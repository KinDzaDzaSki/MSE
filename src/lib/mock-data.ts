import { Stock } from './types'

/**
 * Generates realistic mock data for MSE stocks
 * Used when scraping fails or for development/testing
 * Includes ALL companies listed on MSE (Macedonian Stock Exchange)
 */
export function generateMockStocks(): Stock[] {
  const mockStocks: Array<{
    symbol: string
    name: string
    basePrice: number
  }> = [
    // Main Market - Most Active Companies (actively scraped)
    { symbol: 'ALK', name: 'Alkaloid AD Skopje', basePrice: 25900 },
    { symbol: 'KMB', name: 'Komercijalna Banka AD Skopje', basePrice: 27200 },
    { symbol: 'MPT', name: 'Makpetrol AD Skopje', basePrice: 116900 },
    { symbol: 'REPL', name: 'Replek AD Skopje', basePrice: 16000 },
    { symbol: 'RZUS', name: 'RZUS AD', basePrice: 45 },
    { symbol: 'TEL', name: 'Makedonski Telekom AD Skopje', basePrice: 440 },
    
    // Additional MSE Listed Companies (from MSE liquid market data)
    { symbol: 'STB', name: 'Stopanska Banka AD Bitola', basePrice: 2800 },
    { symbol: 'UNI', name: 'Univerzalna Banka AD Skopje', basePrice: 7300 },
    { symbol: 'TNB', name: 'Tutunska Banka AD Prilep', basePrice: 57800 },
    { symbol: 'VITA', name: 'Vitaminka AD Prilep', basePrice: 12200 },
    { symbol: 'USJE', name: 'Titan Usje AD Skopje', basePrice: 43600 },
    
    // Government & Financial Securities
    { symbol: 'RMDEN21', name: 'Government Bond RMDEN21', basePrice: 92 },
    
    // Industrial & Manufacturing Companies
    { symbol: 'GRNT', name: 'Granit AD Skopje', basePrice: 480 },
    { symbol: 'MTUR', name: 'Makedonijaturist AD Skopje', basePrice: 220 },
    { symbol: 'ZUAS', name: 'Zito Vardar AD Negotino', basePrice: 5600 },
    { symbol: 'DIMI', name: 'Dimi AD Kavadarci', basePrice: 1800 },
    
    // Energy & Utilities
    { symbol: 'TETO', name: 'TE-TO AD Skopje', basePrice: 950 },
    { symbol: 'ESM', name: 'Elektrани na Severna Makedonija AD Skopje', basePrice: 1200 },
    
    // Construction & Real Estate
    { symbol: 'KRAD', name: 'Knauf Radika AD', basePrice: 850 },
    { symbol: 'ZLZN', name: 'Zeleznik AD Demir Hisar', basePrice: 300 },
    
    // Insurance Companies
    { symbol: 'HLKB', name: 'Halk Banka AD Skopje', basePrice: 1500 },
    { symbol: 'HLKO', name: 'Halk Osiguruvanje AD Skopje', basePrice: 800 },
    { symbol: 'PRIM', name: 'Premium Insurance AD Skopje', basePrice: 650 },
    { symbol: 'PRZI', name: 'Prva Zivot AD Skopje', basePrice: 750 },
    { symbol: 'KRZI', name: 'Kroacija Osiguruvanje - Zivot AD Skopje', basePrice: 400 },
    { symbol: 'KRNZ', name: 'Kroacija Osiguruvanje - Nezivot AD Skopje', basePrice: 420 },
    
    // Technology & Services
    { symbol: 'LAJN', name: 'Lajon Ins AD Skopje', basePrice: 350 },
    { symbol: 'MKEL', name: 'Mokel EEII AD Bitola', basePrice: 280 },
    { symbol: 'EDS', name: 'EDS AD Skopje', basePrice: 180 },
    { symbol: 'METR', name: 'Metro AD Skopje', basePrice: 320 },
    
    // Transportation & Logistics
    { symbol: 'ZRNM', name: 'Zeleznici na Republika Severna Makedonija - Transport AD Skopje', basePrice: 150 },
    { symbol: 'MNAV', name: 'M-NAV AD Skopje', basePrice: 200 },
    
    // Textile & Manufacturing
    { symbol: 'TELM', name: 'Tekstil ELMA AD Prilep', basePrice: 160 },
    { symbol: 'EURO', name: 'Europrofil AD Aldinci', basePrice: 90 },
    { symbol: 'BRIK', name: 'Brik AD Berovo', basePrice: 110 },
    
    // Food & Beverage
    { symbol: 'TIGR', name: 'Tigar AD Kriva Palanka', basePrice: 140 },
    { symbol: 'DAMJ', name: 'Damjanov AD Delcevo', basePrice: 85 },
    
    // Financial Services & Brokers
    { symbol: 'INBR', name: 'IN-Broker AD Skopje', basePrice: 120 },
    { symbol: 'SUPB', name: 'Super Broker AD Skopje', basePrice: 100 },
    { symbol: 'MBRK', name: 'OBD M Broker AD Skopje', basePrice: 95 },
    { symbol: 'POBR', name: 'Petrol Oil Broker AD Skopje', basePrice: 80 },
    
    // Energy & Mining
    { symbol: 'RDMH', name: 'Rudnik Demir Hisar AD Sopotnica', basePrice: 75 },
    { symbol: 'BENG', name: 'Balkan Energy Group AD Skopje', basePrice: 250 },
    
    // Other Companies
    { symbol: 'ZIM', name: 'ZIM AD Skopje', basePrice: 60 },
    { symbol: 'SVRB', name: 'Silk Road Banka AD Skopje', basePrice: 800 },
    { symbol: 'SVOD', name: 'SVOD MASTER AD Skopje', basePrice: 55 },
    { symbol: 'NOMA', name: 'NOMAGAS AD Skopje', basePrice: 45 },
    { symbol: 'KIBS', name: 'KIBS AD Skopje', basePrice: 70 },
    { symbol: 'DAUT', name: 'Dauti-Komerc AD Skopje', basePrice: 40 },
    { symbol: 'PTCT', name: 'Patentcentar-konslating AD Skopje', basePrice: 35 },
    
    // Sports Clubs
    { symbol: 'MKKU', name: 'Maski Kosarkarski Klub Kumanovo AD Kumanovo', basePrice: 25 },
    { symbol: 'FKAP', name: 'FK Akademija Pandev Brera Strumica', basePrice: 30 },
    
    // Professional Services
    { symbol: 'SPNS', name: 'Sava Penziisko Drustvo AD Skopje', basePrice: 180 },
    { symbol: 'KICO', name: 'KIC Komerc AD Stip', basePrice: 65 },
    { symbol: 'LIHN', name: 'Lihnida AD Ohrid', basePrice: 90 }
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