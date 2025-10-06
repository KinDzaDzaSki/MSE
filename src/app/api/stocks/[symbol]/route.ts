import { NextRequest, NextResponse } from 'next/server'
import { MSEScraper } from '@/lib/scraper'
import { ApiResponse, StockDetail } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
): Promise<NextResponse<ApiResponse<StockDetail>>> {
  try {
    const symbol = params.symbol.toUpperCase()
    
    // For now, we'll use the main scraper and filter for the specific stock
    // In a production app, you'd want to scrape individual stock pages
    const scraper = new MSEScraper()
    const result = await scraper.scrapeStocks()
    await scraper.close()

    const stock = result.stocks.find(s => s.symbol === symbol)
    
    if (!stock) {
      return NextResponse.json({
        success: false,
        error: `Stock with symbol ${symbol} not found`
      }, { status: 404 })
    }

    // Convert Stock to StockDetail with additional mock data
    const stockDetail: StockDetail = {
      ...stock,
      isin: `MK${symbol}101011`,
      sector: 'Unknown',
      website: `https://www.${symbol.toLowerCase()}.com.mk`,
      description: `${stock.name} is a company listed on the Macedonian Stock Exchange.`
    }

    return NextResponse.json({
      success: true,
      data: stockDetail
    })

  } catch (error) {
    console.error('API Error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch stock details'
    }, { status: 500 })
  }
}