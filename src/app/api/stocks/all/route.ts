import { NextResponse } from 'next/server'
import { MSEScraperWithDB } from '@/lib/scraper'
import { Stock, ApiResponse } from '@/lib/types'

let cachedAllStocks: Stock[] = []
let lastDiscoveryUpdate: Date | null = null
const DISCOVERY_CACHE_DURATION = 6 * 60 * 60 * 1000 // 6 hours cache for comprehensive discovery

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

    if (shouldRunDiscovery || cachedAllStocks.length === 0) {
      console.log('🔍 Discovering all MSE companies via scraper...')
      
      try {
        // Use the scraper's discovery method to find all companies
        const scraper = new MSEScraperWithDB()
        stocks = await scraper.discoverAllMSECompanies()
        
        console.log(`🎯 Discovery complete: Found ${stocks.length} companies`)
        
        if (stocks.length === 0) {
          console.warn('⚠️ No companies discovered, using fallback list')
          stocks = await getFallbackCompanyList()
        }
        
        cachedAllStocks = stocks
        lastDiscoveryUpdate = now
        
        await scraper.close()
        
      } catch (error) {
        console.error('❌ Error during company discovery:', error)
        
        // Fallback to hardcoded list if discovery fails
        console.log('📋 Using fallback company list')
        stocks = await getFallbackCompanyList()
        cachedAllStocks = stocks
        lastDiscoveryUpdate = now
      }
      
    } else {
      console.log('📋 Using cached complete company list')
      stocks = cachedAllStocks
    }

    // Helper function for fallback company list
    async function getFallbackCompanyList(): Promise<Stock[]> {
      // Try to get at least the active trading data
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/stocks`)
        const result = await response.json()
        
        if (result.success && result.data.stocks.length > 0) {
          return result.data.stocks
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch fallback data:', error)
      }
      
      // Last resort: return empty array
      return []
    }

    // Calculate statistics
    const activeCompanies = stocks.filter(s => s.price > 0).length
    const totalCompanies = stocks.length
    
    console.log(`🎯 Returning ${totalCompanies} companies total (${activeCompanies} active, ${totalCompanies - activeCompanies} inactive)`)

    return NextResponse.json({
      success: true,
      data: {
        stocks: stocks.sort((a, b) => a.symbol.localeCompare(b.symbol)),
        discoveryTimestamp: lastDiscoveryUpdate?.toISOString() || new Date().toISOString(),
        totalCompanies,
        activeCompanies
      }
    })

  } catch (error) {
    console.error('❌ All companies API error:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}