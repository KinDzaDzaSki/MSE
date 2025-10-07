import { NextResponse } from 'next/server'
import { MSEScraperWithDB } from '@/lib/scraper'
import { Stock, ApiResponse } from '@/lib/types'

let cachedAllStocks: Stock[] = []
let lastDiscoveryUpdate: Date | null = null
const DISCOVERY_CACHE_DURATION = 6 * 60 * 60 * 1000 // 6 hours (longer cache for comprehensive discovery)

export async function GET(): Promise<NextResponse<ApiResponse<{
  stocks: Stock[]
  discoveryTimestamp: string
  totalCompanies: number
  activeCompanies: number
}>>> {
  try {
    const now = new Date()
    const shouldRunDiscovery = !lastDiscoveryUpdate || 
      (now.getTime() - lastDiscoveryUpdate.getTime()) > DISCOVERY_CACHE_DURATION

    let stocks: Stock[] = []
    let scraper: MSEScraperWithDB | null = null

    try {
      scraper = new MSEScraperWithDB()
      
      if (shouldRunDiscovery || cachedAllStocks.length === 0) {
        console.log('🔍 Running comprehensive MSE company discovery...')
        
        // Use enhanced discovery to find all MSE companies
        stocks = await scraper.discoverAllMSECompanies()
        
        if (stocks.length > 0) {
          cachedAllStocks = stocks
          lastDiscoveryUpdate = now
          
          console.log(`🎯 Discovery complete: Found ${stocks.length} MSE companies`)
          
          // Log companies by category
          const activeCompanies = stocks.filter(s => s.price > 0)
          const inactiveCompanies = stocks.filter(s => s.price === 0)
          
          console.log(`📊 Active companies (with prices): ${activeCompanies.length}`)
          console.log(`📊 Listed companies (no current price): ${inactiveCompanies.length}`)
          
          if (activeCompanies.length > 0) {
            const topActive = activeCompanies
              .sort((a, b) => b.price - a.price)
              .slice(0, 10)
              .map(s => `${s.symbol}: ${s.price} MKD`)
            console.log('🔝 Top 10 active companies:', topActive.join(', '))
          }
        } else {
          console.warn('⚠️ Discovery returned no companies, using cached data')
          stocks = cachedAllStocks
        }
      } else {
        console.log('📋 Using cached discovery data')
        stocks = cachedAllStocks
      }
      
    } catch (error) {
      console.error('❌ Error during company discovery:', error)
      
      // Fallback to cached data or mock data
      if (cachedAllStocks.length > 0) {
        console.log('🔄 Using cached discovery data as fallback')
        stocks = cachedAllStocks
      } else {
        console.log('🔄 Using mock data as fallback')
        const { generateMockStocks } = await import('@/lib/mock-data')
        stocks = generateMockStocks()
      }
    } finally {
      if (scraper) {
        await scraper.close()
      }
    }

    // Calculate statistics
    const activeCompanies = stocks.filter(s => s.price > 0).length
    const totalCompanies = stocks.length

    return NextResponse.json({
      success: true,
      data: {
        stocks,
        discoveryTimestamp: lastDiscoveryUpdate?.toISOString() || new Date().toISOString(),
        totalCompanies,
        activeCompanies
      }
    })

  } catch (error) {
    console.error('❌ Comprehensive discovery API error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}