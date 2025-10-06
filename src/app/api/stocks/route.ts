import { NextRequest, NextResponse } from 'next/server'
import { MSEScraper, isMarketOpen } from '@/lib/scraper'
import { Stock, ApiResponse, MarketStatus } from '@/lib/types'
import { deduplicateStocks } from '@/lib/utils'
import { generateMockStocks } from '@/lib/mock-data'

// Simple in-memory cache for development
let cachedStocks: Stock[] = []
let lastUpdate: Date | null = null
let lastError: string | null = null
const CACHE_DURATION = 30000 // 30 seconds

export async function GET(): Promise<NextResponse<ApiResponse<{
  stocks: Stock[]
  marketStatus: MarketStatus
  lastUpdated: string
}>>> {
  try {
    const now = new Date()
    const shouldFetchFresh = !lastUpdate || (now.getTime() - lastUpdate.getTime()) > CACHE_DURATION

    if (shouldFetchFresh) {
      console.log('Fetching fresh stock data...')
      
      let scraper: MSEScraper | null = null
      
      try {
        scraper = new MSEScraper()
        const result = await scraper.scrapeStocks()

        if (result.stocks.length > 0) {
          // Apply additional deduplication as safety measure
          cachedStocks = deduplicateStocks(result.stocks)
          lastUpdate = now
          lastError = null
          console.log(`Successfully scraped ${cachedStocks.length} unique stocks`)
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