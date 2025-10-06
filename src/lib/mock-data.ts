import { Stock } from './types'

/**
 * Generates realistic mock data for MSE stocks
 * Used when scraping fails or for development/testing
 */
export function generateMockStocks(): Stock[] {
  const mockStocks: Array<{
    symbol: string
    name: string
    basePrice: number
  }> = [
    { symbol: 'ALK', name: 'Alkaloid AD Skopje', basePrice: 4200 },
    { symbol: 'KMB', name: 'Komercijalna Banka AD Skopje', basePrice: 180 },
    { symbol: 'MPT', name: 'Makpetrol AD Skopje', basePrice: 9500 },
    { symbol: 'STB', name: 'Stopanska Banka AD Bitola', basePrice: 4800 },
    { symbol: 'TNB', name: 'Tutunska Banka AD Prilep', basePrice: 110 },
    { symbol: 'UNI', name: 'Univerzalna Banka AD Skopje', basePrice: 95 },
    { symbol: 'VITA', name: 'Vitaminka AD Prilep', basePrice: 12000 },
    { symbol: 'TEL', name: 'Makedonski Telekom AD Skopje', basePrice: 650 },
    { symbol: 'USJE', name: 'Usje AD Skopje', basePrice: 1200 },
    { symbol: 'REPL', name: 'Replek AD Skopje', basePrice: 2800 },
    { symbol: 'GRNT', name: 'Granit AD Skopje', basePrice: 480 },
    { symbol: 'MKSV', name: 'Makedonijaturist AD Skopje', basePrice: 220 },
    { symbol: 'ZUAS', name: 'Zito Vardar AD Negotino', basePrice: 5600 },
    { symbol: 'MTUR', name: 'Makoteks AD Skopje', basePrice: 320 },
    { symbol: 'DIMI', name: 'Dimi AD Kavadarci', basePrice: 1800 }
  ]

  return mockStocks.map(stock => {
    // Generate realistic price variations (-5% to +5%)
    const priceVariation = (Math.random() - 0.5) * 0.1 // -5% to +5%
    const currentPrice = stock.basePrice * (1 + priceVariation)
    
    // Generate change percentage (-3% to +3%)
    const changePercent = (Math.random() - 0.5) * 6 // -3% to +3%
    
    // Calculate change amount
    const changeAmount = (currentPrice * changePercent) / 100
    
    // Generate volume (10K to 1M)
    const volume = Math.floor(Math.random() * 990000) + 10000
    
    return {
      id: stock.symbol,
      symbol: stock.symbol,
      name: stock.name,
      price: Math.round(currentPrice * 100) / 100, // Round to 2 decimal places
      change: Math.round(changeAmount * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      volume,
      lastUpdated: new Date().toISOString()
    }
  })
}

/**
 * Validates that all stocks in the array are unique by symbol
 */
export function validateUniqueStocks(stocks: Stock[]): boolean {
  const symbols = stocks.map(s => s.symbol)
  const uniqueSymbols = new Set(symbols)
  return symbols.length === uniqueSymbols.size
}