import { Stock } from './types'

/**
 * Generates realistic mock data for MSE stocks
 * Used when scraping fails or for development/testing
 * Includes ONLY the specified companies from the user's list
 */
export function generateMockStocks(): Stock[] {
  const mockStocks: Array<{
    symbol: string
    name: string
    basePrice: number
    sector: string
  }> = [
    // Specified MSE Companies - Real companies from user's list
    { symbol: 'KMB', name: 'Комерцијална банка Скопје', basePrice: 27200, sector: 'банкарство' },
    { symbol: 'ALK', name: 'Алкалоид Скопје', basePrice: 25900, sector: 'индустрија' },
    { symbol: 'FERSP', name: 'Фершпед Скопје', basePrice: 1100, sector: 'услуги' },
    { symbol: 'GRNT', name: 'Гранит Скопје', basePrice: 4800, sector: 'градежништво' },
    { symbol: 'DSS', name: 'ДС Смитх АД Скопје', basePrice: 2800, sector: 'индустрија' },
    { symbol: 'MKSP', name: 'Макошпед Скопје', basePrice: 950, sector: 'услуги' },
    { symbol: 'HMOH', name: 'Хотели Метропол Охрид', basePrice: 2600, sector: 'угостителство' },
    { symbol: 'MPT', name: 'Макпетрол Скопје', basePrice: 116900, sector: 'трговија' },
    { symbol: 'MTUR', name: 'Македонијатурист Скопје', basePrice: 2200, sector: 'угостителство' },
    { symbol: 'REPL', name: 'Реплек Скопје', basePrice: 16000, sector: 'трговија' },
    { symbol: 'RZUS', name: 'РЖ Услуги Скопје', basePrice: 45, sector: 'услуги' },
    { symbol: 'MKST', name: 'Макстил Скопје', basePrice: 3400, sector: 'индустрија' },
    { symbol: 'TETO', name: 'Тетекс Тетово', basePrice: 1600, sector: 'индустрија' },
    { symbol: 'TNB', name: 'Тутунски комбинат Прилеп', basePrice: 57800, sector: 'индустрија' },
    { symbol: 'VVT', name: 'ВВ Тиквеш АД Кавадарци', basePrice: 3200, sector: 'индустрија' },
    { symbol: 'TTK', name: 'ТТК Банка АД Скопје', basePrice: 4200, sector: 'банкарство' },
    { symbol: 'VITA', name: 'Витаминка Прилеп', basePrice: 12200, sector: 'индустрија' },
    { symbol: 'ZITO', name: 'Жито Лукс Скопје', basePrice: 8900, sector: 'индустрија' },
    { symbol: 'ZKPEL', name: 'ЗК Пелагонија Битола', basePrice: 1200, sector: 'земјоделство' },
    { symbol: 'ADING', name: 'Адинг Скопје', basePrice: 1500, sector: 'трговија' },
    { symbol: 'FZC11', name: 'ФЗЦ 11 Октомври Куманово', basePrice: 800, sector: 'индустрија' },
    { symbol: 'FAKOM', name: 'Факом Скопје', basePrice: 1200, sector: 'трговија' },
    { symbol: 'FUST', name: 'Фустеларко Борец Битола', basePrice: 900, sector: 'индустрија' },
    { symbol: 'MOS', name: 'Македонија осигурување АД Скопје - Виена Иншуренс Груп', basePrice: 18000, sector: 'осигурување' },
    { symbol: 'KARPOS', name: 'Карпош Скопје', basePrice: 1100, sector: 'трговија' },
    { symbol: 'MERM', name: 'Мермерен комбинат Прилеп', basePrice: 650, sector: 'индустрија' },
    { symbol: 'VABT', name: 'Вабтек МЗТ Скопје', basePrice: 750, sector: 'индустрија' },
    { symbol: 'OKDA', name: 'Оилко КДА Скопје', basePrice: 1300, sector: 'трговија' },
    { symbol: 'OKTA', name: 'ОКТА Скопје', basePrice: 14500, sector: 'индустрија' },
    { symbol: 'PEKA', name: 'Пекабеско Скопје', basePrice: 1800, sector: 'индустрија' },
    { symbol: 'POPOV', name: 'Попова Кула Демир Капија', basePrice: 2200, sector: 'индустрија' },
    { symbol: 'PRILEP', name: 'Прилепска Пиварница Прилеп', basePrice: 3500, sector: 'индустрија' },
    { symbol: 'RADE', name: 'Раде Кончар Скопје', basePrice: 950, sector: 'индустрија' },
    { symbol: 'RZTEK', name: 'РЖ Техничка контрола Скопје', basePrice: 650, sector: 'услуги' },
    { symbol: 'STB', name: 'Стопанска банка Скопје', basePrice: 2800, sector: 'банкарство' },
    { symbol: 'TEKNO', name: 'Технокомерц Скопје', basePrice: 1400, sector: 'трговија' },
    { symbol: 'TEL', name: 'Македонски Телеком Скопје', basePrice: 440, sector: 'телекомуникации' },
    { symbol: 'NLB', name: 'НЛБ Банка АД Скопје', basePrice: 3200, sector: 'банкарство' },
    { symbol: 'TRGOT', name: 'Трготекстил малопродажба Скопје', basePrice: 850, sector: 'трговија' },
    { symbol: 'UNI', name: 'Универзална Инвестициона Банка Скопје', basePrice: 2100, sector: 'банкарство' },
    { symbol: 'USJE', name: 'ТИТАН УСЈЕ АД Скопје', basePrice: 43600, sector: 'индустрија' },
    { symbol: 'VETEKS', name: 'Ветекс Велес', basePrice: 1200, sector: 'индустрија' },
    { symbol: 'ZAS', name: 'ЖАС Скопје', basePrice: 980, sector: 'индустрија' }
  ]

  return mockStocks.map(stock => {
    // Generate realistic price variations (-5% to +5%)
    const priceVariation = (Math.random() - 0.5) * 0.1 // -5% to +5%
    const currentPrice = stock.basePrice * (1 + priceVariation)
    
    // Generate change percentage (-3% to +3%)
    const changePercent = (Math.random() - 0.5) * 6 // -3% to +3%
    
    // Calculate change amount
    const changeAmount = (currentPrice * changePercent) / 100
    
    // Generate volume (10K to 1M) - higher for banks and large industrials
    let volumeMultiplier = 1
    if (stock.sector === 'банкарство') volumeMultiplier = 2
    if (stock.sector === 'индустрија' && stock.basePrice > 10000) volumeMultiplier = 1.5
    
    const volume = Math.floor(Math.random() * 990000 * volumeMultiplier) + 10000
    
    return {
      id: stock.symbol,
      symbol: stock.symbol,
      name: stock.name,
      price: Math.round(currentPrice * 100) / 100, // Round to 2 decimal places
      change: Math.round(changeAmount * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      volume,
      lastUpdated: new Date().toISOString(),
      sector: stock.sector
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