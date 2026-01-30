import { NextResponse } from 'next/server'
import { MSEScraper } from '@/lib/scraper'
import { ApiResponse, Stock, StockDetail } from '@/lib/types'
import { StockService } from '@/lib/db/services'
import { DatabaseService } from '@/lib/db/connection'

// Company details map for Stock to StockDetail enhancement
const companyDataMap: Record<string, Partial<StockDetail>> = {
  'ALK': {
    isin: 'MKALKA101011',
    sector: 'Pharmaceuticals',
    website: 'https://www.alkaloid.com.mk',
    description: 'Alkaloid AD Skopje is a leading pharmaceutical company in Macedonia and the region, producing pharmaceuticals, cosmetics, and chemicals.',
    marketCap: 78904000000,
    pe: 14.2,
    pb: 3.1,
  },
  'KMB': {
    isin: 'MKKMBS101019',
    sector: 'Banking & Finance',
    website: 'https://www.kb.com.mk',
    description: 'Komercijalna Banka AD Skopje is one of the largest and oldest banks in Macedonia offering a full range of banking services.',
    marketCap: 22340000000,
    pe: 8.3,
    pb: 1.4,
  },
  'MPT': {
    isin: 'MKMPTS101016',
    sector: 'Energy & Retail',
    website: 'https://www.makpetrol.com.mk',
    description: 'Makpetrol AD Skopje is a leading oil and gas company in Macedonia operating a network of gas stations across the country.',
    marketCap: 14502000000,
    pe: 10.2,
    pb: 1.7,
  },
  'TEL': {
    isin: 'MKMTLC101018',
    sector: 'Telecommunications',
    website: 'https://www.telekom.mk',
    description: 'Makedonski Telekom AD Skopje is the leading telecommunications company in Macedonia offering mobile, fixed, internet and TV services.',
    marketCap: 52300000000,
    pe: 16.8,
    pb: 2.3,
  },
  'GRNT': {
    isin: 'MKGRNT101015',
    sector: 'Construction',
    website: 'https://www.granit.com.mk',
    description: 'Granit AD Skopje is one of the largest construction companies in Macedonia with expertise in infrastructure projects.',
    marketCap: 3780000000,
    pe: 11.5,
    pb: 0.8,
  },
  'VITA': {
    isin: 'MKVITA101012',
    sector: 'Food Production',
    website: 'https://www.vitaminka.com.mk',
    description: 'Vitaminka AD Prilep specializes in the production of various food products including confectionery, spices, and instant foods.',
    marketCap: 1340000000,
    pe: 9.8,
    pb: 1.1,
  }
}

// Helper function to build StockDetail response
function buildStockDetailResponse(stock: Stock, upperSymbol: string): NextResponse<ApiResponse<StockDetail>> {
  // Get company specific data or use generic data
  const companyData = companyDataMap[upperSymbol] || {
    isin: `MK${upperSymbol}101011`,
    sector: 'General',
    website: `https://www.${upperSymbol.toLowerCase()}.com.mk`,
    description: `${stock.name} is a company listed on the Macedonian Stock Exchange.`,
    marketCap: stock.price * 1000000,
    pe: 12.5,
    pb: 1.8,
  }

  const stockDetail: StockDetail = {
    ...stock,
    ...companyData,
    marketCap: companyData.marketCap || stock.price * 1000000,
    lastUpdated: new Date().toISOString()
  }

  return NextResponse.json({
    success: true,
    data: stockDetail
  })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> }
): Promise<NextResponse<ApiResponse<StockDetail>>> {
  const { symbol } = await context.params
  const upperSymbol = symbol.toUpperCase()

  try {
    // 1. First priority: Try to get from database (fast path)
    try {
      const dbAvailable = await DatabaseService.testConnection()
      if (dbAvailable) {
        const dbStock = await StockService.getStockBySymbol(upperSymbol)
        if (dbStock) {
          console.log(`📋 Individual stock ${upperSymbol}: Using database data`)
          const appStock = StockService.dbStockToAppStock(dbStock)
          return buildStockDetailResponse(appStock, upperSymbol)
        }
      }
    } catch (dbError) {
      console.warn(`⚠️ Database lookup failed for ${upperSymbol}:`, dbError)
    }

    // 2. Fallback: Use scraper if not in database
    console.log(`🔄 Individual stock ${upperSymbol}: Scraping data...`)
    const scraper = MSEScraper.createSync()
    const result = await scraper.scrapeStocks()
    await scraper.close()

    const stock = result.stocks.find(s => s.symbol === upperSymbol)

    if (!stock) {
      return NextResponse.json({
        success: false,
        error: `Stock with symbol ${upperSymbol} not found`
      }, { status: 404 })
    }

    return buildStockDetailResponse(stock, upperSymbol)

  } catch (error) {
    console.error('API Error:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch stock details'
    }, { status: 500 })
  }
}