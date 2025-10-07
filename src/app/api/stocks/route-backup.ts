import { NextResponse } from 'next/server'
import { MSEScraper, isMarketOpen } from '@/lib/scraper'
import { Stock, ApiResponse, MarketStatus } from '@/lib/types'
import { deduplicateStocks } from '@/lib/utils'
import { generateMockStocks } from '@/lib/mock-data'

// Simple in-memory cache for development (fallback when database is not available)
let cachedStocks: Stock[] = []
let lastUpdate: Date | null = null
let lastError: string | null = null
const CACHE_DURATION = 30000 // 30 seconds

export async function GET(): Promise<NextResponse<ApiResponse<{
  stocks: Stock[]
  marketStatus: MarketStatus
  lastUpdated: string
  databaseStatus?: any
}>>> {
  try {
    const now = new Date()
    const shouldFetchFresh = !lastUpdate || (now.getTime() - lastUpdate.getTime()) > CACHE_DURATION

    let scraper: MSEScraper | null = null
    let stocks: Stock[] = []
    let databaseStatus: any = null

    try {
      scraper = new MSEScraper()
      
      // Get database status for debugging
      databaseStatus = await scraper.getDatabaseStatus()
      
      if (shouldFetchFresh || cachedStocks.length === 0) {
        console.log('🔄 Fetching stock data...')
        
        // Use the enhanced scraper's getStocks method which handles database integration
        stocks = await scraper.getStocks()
        
        if (stocks.length > 0) {
          // Apply additional deduplication as safety measure
          cachedStocks = deduplicateStocks(stocks)
          lastUpdate = now
          lastError = null
          
          // Log detailed diagnostic information about scraped stocks
          console.log(`✅ Successfully retrieved ${cachedStocks.length} unique stocks`)
          
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
        } else {
          // Fallback to cached data or mock data
          if (cachedStocks.length > 0) {
            console.log('⚠️ No fresh data available, using cached stocks')
            stocks = cachedStocks
          } else {
            console.log('⚠️ No data available, generating mock stocks for development')
            stocks = generateMockStocks()
            lastError = 'No real data available - using mock data'
          }
        }
      } else {
        console.log('📋 Using cached stock data')
        stocks = cachedStocks
      }

    } catch (scrapingError) {
      console.error('❌ Scraping error:', scrapingError)
      lastError = scrapingError instanceof Error ? scrapingError.message : 'Unknown scraping error'
      
      // Fallback to cached data or mock data
      if (cachedStocks.length > 0) {
        console.log('🔄 Using cached data due to scraping error')
        stocks = cachedStocks
      } else {
        console.log('🔄 Generating mock data due to scraping error')
        stocks = generateMockStocks()
      }
    } finally {
      if (scraper) {
        await scraper.close()
      }
    }

    // Determine market status
    const marketStatus: MarketStatus = {
      isOpen: isMarketOpen(),
      nextOpen: getNextMarketOpen(),
      nextClose: getNextMarketClose(),
      timezone: 'Europe/Skopje'
    }

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
          
          // Log potential data issues
          const potentialIssues = cachedStocks.filter(s => 
            Math.abs(s.changePercent) > 20 || // Change > ±20%
            s.price > 50000 || // Extremely high price
            s.price < 10 // Very low price
          )
          
          if (potentialIssues.length > 0) {
            console.log(`Potential data anomalies detected in ${potentialIssues.length} stocks:`, 
              potentialIssues.map(s => `${s.symbol}: price=${s.price}, change=${s.changePercent}%`).join('; ')
            )
          }
        } else {
          const errorMessage = result.errors?.join('; ') || 'No stocks found'
          lastError = errorMessage
          console.error('Scraping returned no data:', errorMessage)
          
          // If we have cached data, continue using it
          if (cachedStocks.length === 0) {
            // Use mock data as absolute fallback
            console.log('Using mock data as fallback due to scraping failure')
            cachedStocks = generateMockStocks()
            lastUpdate = now
            lastError = `No data found: ${errorMessage}`
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown scraping error'
        lastError = errorMessage
        console.error('Scraping error:', errorMessage)
        
        // If we have no cached data and scraping fails, return error
        if (cachedStocks.length === 0) {
          // Use mock data as absolute fallback for development
          console.log('Using mock data as fallback')
          cachedStocks = generateMockStocks()
          lastUpdate = now
          lastError = `Scraping failed, using mock data: ${errorMessage}`
        }
        
        // Otherwise, use cached data with warning
        console.log('Using cached data due to scraping error')
      } finally {
        if (scraper) {
          await scraper.close()
        }
      }
    }

    const marketStatus: MarketStatus = isMarketOpen() ? 'open' : 'closed'

    const response = {
      success: true,
      data: {
        stocks: cachedStocks,
        marketStatus,
        lastUpdated: lastUpdate?.toISOString() || now.toISOString()
      },
      // Include warning if using stale data
      ...(lastError && { warning: `Using cached data: ${lastError}` })
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('API Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stock data'
    
    // Return cached data if available, even on error
    const response = {
      success: false,
      error: errorMessage,
      data: {
        stocks: cachedStocks,
        marketStatus: 'closed' as MarketStatus,
        lastUpdated: lastUpdate?.toISOString() || new Date().toISOString()
      }
    }
    
    return NextResponse.json(response, { status: cachedStocks.length > 0 ? 200 : 500 })
  }
}