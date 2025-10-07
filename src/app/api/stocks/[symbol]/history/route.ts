import { NextResponse } from 'next/server'
import { MSEScraper } from '@/lib/scraper'
import { ApiResponse } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { symbol: string } }
): Promise<NextResponse<ApiResponse<{
  symbol: string
  data: Array<{
    date: string
    price: number
    change: number
    changePercent: number
    volume: number
  }>
}>>> {
  try {
    const { symbol } = params
    const url = new URL(request.url)
    const days = parseInt(url.searchParams.get('days') || '30')
    
    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required'
      }, { status: 400 })
    }

    const scraper = new MSEScraper()
    const historicalData = await scraper.getHistoricalData(symbol.toUpperCase(), days)
    await scraper.close()

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        data: historicalData
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Historical data API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch historical data'
    }, { status: 500 })
  }
}