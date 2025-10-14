import { NextResponse } from 'next/server'
import { Stock, ApiResponse } from '@/lib/types'

let cachedAllStocks: Stock[] = []
let lastDiscoveryUpdate: Date | null = null
const DISCOVERY_CACHE_DURATION = 30 * 60 * 1000 // 30 minutes cache

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
      console.log('🔍 Building complete company list with active trading data...')
      
      // List of all 22 configured companies
      const allConfiguredSymbols = [
        'ALK', 'KMB', 'TNB', 'STB', 'TEL', 'MPT', 'GRNT', 'REPL',
        'MTUR', 'UNI', 'USJE', 'VITA', 'OKTA', 'STIL', 'FERS',
        'AUMK', 'TETE', 'PPIV', 'TIGA', 'RZLE', 'SBT', 'RZUS'
      ]
      
      // Company name mapping
      const companyNames: Record<string, string> = {
        'ALK': 'Алкалоид Скопје',
        'KMB': 'Комерцијална банка Скопје',
        'TNB': 'Тутунски комбинат Прилеп',
        'STB': 'Стопанска банка Скопје',
        'TEL': 'Македонски Телеком Скопје',
        'MPT': 'Макпетрол Скопје',
        'GRNT': 'Гранит Скопје',
        'REPL': 'Реплек Скопје',
        'MTUR': 'Македонијатурист Скопје',
        'UNI': 'Универзална Инвестициона Банка Скопје',
        'USJE': 'ТИТАН УСЈЕ АД Скопје',
        'VITA': 'Витаминка Прилеп',
        'OKTA': 'ОКТА Скопје',
        'STIL': 'Стил Скопје',
        'FERS': 'Ферс Скопје',
        'AUMK': 'Ауремарк Скопје',
        'TETE': 'Тете Скопје',
        'PPIV': 'ППИВ Скопје',
        'TIGA': 'Тига Скопје',
        'RZLE': 'РЖ Лесновска Скопје',
        'SBT': 'СБТ Скопје',
        'RZUS': 'РЖ Услуги Скопје'
      }

      try {
        // Get active trading data from the regular endpoint
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/stocks`)
        const result = await response.json()
        
        const activeStocks: Stock[] = result.success ? result.data.stocks : []
        const activeStockMap = new Map(activeStocks.map(stock => [stock.symbol, stock]))
        
        console.log(`📊 Found ${activeStocks.length} active stocks from trading data`)
        
        // Create complete list with active + inactive companies
        stocks = allConfiguredSymbols.map(symbol => {
          const activeStock = activeStockMap.get(symbol)
          
          if (activeStock) {
            console.log(`✅ ${symbol}: Active with trading data`)
            return activeStock
          } else {
            console.log(`� ${symbol}: Added as inactive (no trading data)`)
            return {
              id: `placeholder-${symbol}`,
              symbol: symbol,
              name: companyNames[symbol] || `${symbol} Company`,
              price: 0,
              change: 0,
              changePercent: 0,
              volume: 0,
              lastUpdated: new Date().toISOString()
            }
          }
        })
        
        cachedAllStocks = stocks
        lastDiscoveryUpdate = now
        
      } catch (error) {
        console.error('❌ Error fetching active stock data:', error)
        
        // Create list with all companies as inactive
        stocks = allConfiguredSymbols.map(symbol => ({
          id: `placeholder-${symbol}`,
          symbol: symbol,
          name: companyNames[symbol] || `${symbol} Company`,
          price: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          lastUpdated: new Date().toISOString()
        }))
      }
      
    } else {
      console.log('📋 Using cached complete company list')
      stocks = cachedAllStocks
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