import { NextResponse } from 'next/server'
import { MSEScraper, getMarketStatus } from '@/lib/scraper'
import { Stock, ApiResponse, MarketStatusInfo } from '@/lib/types'
import { deduplicateStocks } from '@/lib/utils'
import { StockService } from '@/lib/db/services'
import { DatabaseService } from '@/lib/db/connection'
// Initialize database on server start
import '@/lib/db-init'

// Simple in-memory cache for development (fallback when database is not available)
let cachedStocks: Stock[] = []
let lastUpdate: Date | null = null
let lastError: string | null = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes for better performance
const STALE_CACHE_DURATION = 15 * 60 * 1000 // 15 minutes before cache is completely stale
const DB_SYNC_INTERVAL = 2 * 60 * 1000 // Sync database every 2 minutes

// Background sync state
let isBackgroundSyncRunning = false
let lastDatabaseSync: Date | null = null

// Background database sync function
async function backgroundDatabaseSync() {
  if (isBackgroundSyncRunning) {
    console.log('🔄 Background sync already running, skipping...')
    return
  }

  isBackgroundSyncRunning = true
  console.log('🔄 Starting background database sync...')
  
  try {
    const scraper = new MSEScraper()
    const freshStocks = await scraper.getStocks()
    
    if (freshStocks.length > 0) {
      // Update in-memory cache with real data only
      const deduplicatedStocks = deduplicateStocks(freshStocks)
      cachedStocks = deduplicatedStocks
      lastUpdate = new Date()

      // Try to save to database
      try {
        const dbAvailable = await DatabaseService.testConnection()
        if (dbAvailable) {
          // Convert to database format and save
          const dbStocks = freshStocks.map(stock => StockService.appStockToDbStock(stock))
          await StockService.bulkUpsertStocks(dbStocks)
          lastDatabaseSync = new Date()
          console.log('✅ Background sync: Database updated successfully')
        } else {
          console.log('📋 Background sync: Database not available, cache updated')
        }
      } catch (dbError) {
        console.warn('⚠️ Background sync: Database update failed, cache updated:', dbError)
      }
    }
    
    await scraper.close()
  } catch (error) {
    console.error('❌ Background sync failed:', error)
  } finally {
    isBackgroundSyncRunning = false
  }
}

// Start periodic background sync
setInterval(() => {
  const now = new Date()
  const shouldSync = !lastDatabaseSync || (now.getTime() - lastDatabaseSync.getTime()) > DB_SYNC_INTERVAL
  
  if (shouldSync) {
    backgroundDatabaseSync()
  }
}, DB_SYNC_INTERVAL)

export async function GET(): Promise<NextResponse<ApiResponse<{
  stocks: Stock[]
  marketStatus: MarketStatusInfo
  lastUpdated: string
  databaseStatus?: any
}>>> {
  try {
    const now = new Date()
    const shouldFetchFresh = !lastUpdate || (now.getTime() - lastUpdate.getTime()) > CACHE_DURATION

    let scraper: MSEScraper | null = null
    let stocks: Stock[] = []
    let databaseStatus: any = null

    // 1. First priority: Try to get fresh data from database
    try {
      const dbAvailable = await DatabaseService.testConnection()
      if (dbAvailable) {
        const dbStocks = await StockService.getAllStocks()
        if (dbStocks.length > 0) {
          // Convert database stocks to app format - real data only
          const appStocks = dbStocks.map(dbStock => StockService.dbStockToAppStock(dbStock))
          
          console.log(`📋 Using database data: ${appStocks.length} stocks`)
          
          // Start background sync if needed (don't await)
          if (shouldFetchFresh) {
            console.log('� Starting background sync for fresh data')
            backgroundDatabaseSync()
          }
          
          return NextResponse.json({
            success: true,
            data: {
              stocks: appStocks,
              marketStatus: getMarketStatus(),
              lastUpdated: dbStocks[0]?.updatedAt?.toISOString() || new Date().toISOString(),
              databaseStatus: 'database'
            },
            message: 'Successfully retrieved stocks from database'
          })
        }
      }
    } catch (dbError) {
      console.warn('⚠️ Database not available, falling back to cache/scraping:', dbError)
      databaseStatus = { error: 'Database unavailable', fallback: true }
    }

    // 2. Second priority: Use cached data if available
    const hasRecentData = cachedStocks.length > 0 && lastUpdate && (now.getTime() - lastUpdate.getTime()) < STALE_CACHE_DURATION

    if (hasRecentData && !shouldFetchFresh) {
      console.log('📋 Using cached stock data')
      return NextResponse.json({
        success: true,
        data: {
          stocks: cachedStocks,
          marketStatus: getMarketStatus(),
          lastUpdated: lastUpdate?.toISOString() || new Date().toISOString(),
          databaseStatus: 'cached'
        },
        message: 'Successfully retrieved stocks from cache'
      })
    }

    // 3. Third priority: Return stale cached data while refreshing
    if (cachedStocks.length > 0 && shouldFetchFresh) {
      console.log('� Using cached stock data (refreshing in background)')
      
      // Start background refresh (don't await)
      backgroundDatabaseSync()
      
      return NextResponse.json({
        success: true,
        data: {
          stocks: cachedStocks,
          marketStatus: getMarketStatus(),
          lastUpdated: lastUpdate?.toISOString() || new Date().toISOString(),
          databaseStatus: 'cached-refreshing'
        },
        message: 'Successfully retrieved stocks from cache (refreshing data)'
      })
    }

    // 4. Last resort: Live scraping (for first-time users or complete cache miss)
    console.log('🔄 No cached data available, performing live scraping...')
    try {
      scraper = new MSEScraper()
      
      // Get database status for debugging
      databaseStatus = await scraper.getDatabaseStatus()
      
      if (shouldFetchFresh || cachedStocks.length === 0) {
        console.log('🔄 Fetching stock data...')
        
        // Use the enhanced scraper's getStocks method which handles database integration
        // Add a timeout to prevent the request from hanging indefinitely
        try {
          stocks = await Promise.race([
            scraper.getStocks(),
            new Promise<Stock[]>((_, reject) => 
              setTimeout(() => reject(new Error('Scraper timeout after 40 seconds')), 40000)
            )
          ])
        } catch (timeoutError) {
          console.error('❌ Scraper timeout:', timeoutError)
          lastError = 'Scraper timeout - could not connect to MSE'
          
          // If we have cached data, return it with a warning
          if (cachedStocks.length > 0) {
            return NextResponse.json({
              success: true,
              data: {
                stocks: cachedStocks,
                marketStatus: getMarketStatus(),
                lastUpdated: lastUpdate?.toISOString() || new Date().toISOString(),
                databaseStatus: 'cached-stale'
              },
              message: 'Stock scraper timed out, returning cached data'
            })
          }
          
          // No cached data, return error
          return NextResponse.json({
            success: false,
            data: {
              stocks: [],
              marketStatus: getMarketStatus(),
              lastUpdated: new Date().toISOString(),
              databaseStatus: 'error'
            },
            message: 'Could not fetch stock data - scraper timeout',
            error: lastError
          }, { status: 503 })
        }
        
        if (stocks.length > 0) {
          // Apply deduplication to ensure clean data
          const deduplicatedStocks = deduplicateStocks(stocks)
          // Use only real scraped data
          cachedStocks = deduplicatedStocks
          lastUpdate = now
          lastError = null
          
          // Log detailed diagnostic information about scraped stocks
          console.log(`✅ Successfully retrieved ${cachedStocks.length} unique stocks`)
          console.log(`📊 All stocks are from real MSE data`)
          
          // Log price statistics to detect anomalies
          const prices = cachedStocks.map(s => s.price)
          const minPrice = Math.min(...prices)
          const maxPrice = Math.max(...prices)
          const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length
          
          console.log(`📊 Stock price statistics - Min: ${minPrice.toFixed(2)}, Max: ${maxPrice.toFixed(2)}, Avg: ${avgPrice.toFixed(2)}`)
          
          // Log top 5 stocks by price for verification
          const topByPrice = [...cachedStocks].sort((a, b) => b.price - a.price).slice(0, 5)
          console.log('🔝 Top stocks by price:', topByPrice.map(s => `${s.symbol}: ${s.price}`).join(', '))
          
          // Detect potential anomalies
          const anomalousStocks = cachedStocks.filter(stock => 
            stock.price > 100000 || // Very high price
            Math.abs(stock.changePercent) > 10 // Very high change
          )
          
          if (anomalousStocks.length > 0) {
            console.log('⚠️ Potential data anomalies detected in', anomalousStocks.length, 'stocks:', 
              anomalousStocks.map(s => `${s.symbol}: price=${s.price}, change=${s.changePercent}%`).join(', '))
          }
          
          // Use the real stock data only
          stocks = cachedStocks
        } else {
          // No fallback to mock data - return empty if no real data available
          if (cachedStocks.length > 0) {
            console.log('⚠️ No fresh data available, using cached stocks')
            stocks = cachedStocks
          } else {
            console.log('❌ No real data available')
            stocks = []
            lastError = 'No real data available from MSE'
          }
        }
      } else {
        console.log('📋 Using cached stock data')
        stocks = cachedStocks
      }

    } catch (scrapingError) {
      console.error('❌ Scraping error:', scrapingError)
      lastError = scrapingError instanceof Error ? scrapingError.message : 'Unknown scraping error'
      
      // Fallback to cached data only - no mock data
      if (cachedStocks.length > 0) {
        console.log('🔄 Using cached data due to scraping error')
        stocks = cachedStocks
      } else {
        console.log('❌ No real data available due to scraping error')
        stocks = []
      }
    } finally {
      if (scraper) {
        await scraper.close()
      }
    }

    // Get market status
    const marketStatus = getMarketStatus()

    const response = {
      success: true,
      data: {
        stocks,
        marketStatus,
        lastUpdated: lastUpdate?.toISOString() || new Date().toISOString(),
        ...(databaseStatus && { databaseStatus }) // Include database status if available
      },
      timestamp: new Date().toISOString(),
      ...(lastError && { error: lastError })
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ API Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stock data'
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      data: {
        stocks: cachedStocks.length > 0 ? cachedStocks : [],
        marketStatus: getMarketStatus(),
        lastUpdated: lastUpdate?.toISOString() || new Date().toISOString()
      }
    }, { status: 500 })
  }
}