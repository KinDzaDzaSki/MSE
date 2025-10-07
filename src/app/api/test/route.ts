import { NextResponse } from 'next/server'
import { MSEScraper } from '@/lib/scraper'
import { generateMockStocks, validateUniqueStocks } from '@/lib/mock-data'

export async function GET(): Promise<NextResponse> {
  try {
    console.log('Testing MSE scraper and data validation...')
    
    const scraper = new MSEScraper()
    const result = await scraper.scrapeStocks()
    await scraper.close()

    // Generate mock data for comparison
    const mockData = generateMockStocks()
    
    // Validate uniqueness
    const scrapedUnique = validateUniqueStocks(result.stocks)
    const mockUnique = validateUniqueStocks(mockData)

    return NextResponse.json({
      success: true,
      message: 'Scraping and validation test completed',
      data: {
        scraped: {
          stockCount: result.stocks.length,
          isUnique: scrapedUnique,
          timestamp: result.timestamp,
          source: result.source,
          errors: result.errors,
          sampleStocks: result.stocks.slice(0, 3)
        },
        mock: {
          stockCount: mockData.length,
          isUnique: mockUnique,
          sampleStocks: mockData.slice(0, 3)
        }
      }
    })

  } catch (error) {
    console.error('Test failed:', error)
    
    // Still test mock data even if scraping fails
    const mockData = generateMockStocks()
    const mockUnique = validateUniqueStocks(mockData)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Scraping test failed, showing mock data only',
      data: {
        mock: {
          stockCount: mockData.length,
          isUnique: mockUnique,
          sampleStocks: mockData.slice(0, 3)
        }
      }
    }, { status: 500 })
  }
}