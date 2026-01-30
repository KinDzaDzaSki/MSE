import puppeteer, { Browser } from 'puppeteer'
import { Stock, ScrapingResult, MarketIndex } from './types'
import { StockService, HistoricalDataService, ScrapingLogService } from './db/services'
import { DatabaseService } from './db/connection'

export class MSEScraperWithDB {
  private browser: Browser | null = null
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  private isDatabaseEnabled = false

  // Private constructor - use create() factory method instead
  private constructor() { }

  // Factory method for proper async initialization
  static async create(): Promise<MSEScraperWithDB> {
    const scraper = new MSEScraperWithDB()
    await scraper.checkDatabaseConnection()
    return scraper
  }

  // Synchronous constructor for backward compatibility (database check deferred)
  static createSync(): MSEScraperWithDB {
    const scraper = new MSEScraperWithDB()
    // Database check will happen on first use
    scraper.checkDatabaseConnection().catch(() => {
      // Silently handle - isDatabaseEnabled stays false
    })
    return scraper
  }

  private async checkDatabaseConnection() {
    try {
      this.isDatabaseEnabled = await DatabaseService.testConnection()
      if (this.isDatabaseEnabled) {
        console.log('✅ Database enabled for scraper')
      } else {
        console.log('⚠️ Database not available, using in-memory mode')
      }
    } catch {
      console.log('⚠️ Database connection failed, using in-memory mode')
      this.isDatabaseEnabled = false
    }
  }

  async initialize(): Promise<void> {
    if (this.browser) return

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    })
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  async scrapeStocks(): Promise<ScrapingResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let stocks: Stock[] = []

    if (!this.browser) {
      await this.initialize()
    }

    const page = await this.browser!.newPage()

    try {
      await page.setUserAgent(this.userAgent)
      await page.setViewport({ width: 1280, height: 720 })

      console.log('🔄 Starting MSE stock scraping...')

      // Navigate to MSE Macedonian page (default locale for better consistency)
      let navigationSuccess = false
      try {
        await Promise.race([
          page.goto('https://www.mse.mk/mk', {
            waitUntil: 'networkidle2',
            timeout: 30000
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Navigation timeout')), 35000)
          )
        ])
        navigationSuccess = true
        console.log('✅ Successfully navigated to MSE main page')
      } catch (navError) {
        console.error('❌ Failed to navigate to MSE:', navError)
        errors.push(`Navigation error: ${navError instanceof Error ? navError.message : String(navError)}`)
        navigationSuccess = false
      }

      if (!navigationSuccess) {
        console.log('⚠️ Could not navigate to MSE, returning empty results')
        return {
          stocks: [],
          timestamp: new Date().toISOString(),
          source: 'mse.mk',
          errors: ['Failed to reach MSE website']
        }
      }

      // Wait for content to load
      try {
        await page.waitForSelector('body', { timeout: 10000 })
      } catch {
        console.warn('⚠️ Could not find body element, continuing anyway')
      }
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Catch browser console logs
      page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

      // Extract stocks from the "Most Traded" table
      const rawStocks = await page.evaluate(() => {
        const stockData: {
          symbol: string;
          price: number;
          changePercent: number;
          volume: number;
          instrumentType: string;
          source: string;
        }[] = []
        console.log('Starting extraction from "Most Traded" table');

        // Helper: Parse Macedonian locale numbers
        const parseMacedonianNumber = (str: string) => {
          if (!str) return 0
          const clean = str.replace(/\s/g, '').replace(/\u00a0/g, '').trim()
          const normalized = clean.replace(/\./g, '').replace(',', '.')
          return parseFloat(normalized) || 0
        }

        try {
          // Target the "Most Traded" table specifically
          const table = document.querySelector('#topSymbolValueTopSymbols table')
          if (!table) {
            console.error('Could not find "Most Traded" table')
            return []
          }

          const rows = Array.from(table.querySelectorAll('tr')).slice(1) // Skip header row
          console.log(`Found ${rows.length} rows in the table`)

          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'))
            if (cells.length < 4) continue

            const symbol = cells[0]?.textContent?.trim() || ''
            if (!symbol || symbol === 'Шифра') continue

            const priceText = cells[1]?.textContent?.trim() || ''
            const changePercentText = cells[2]?.textContent?.trim() || ''
            const volumeText = cells[3]?.textContent?.trim() || ''

            const price = parseMacedonianNumber(priceText)
            const changePercent = parseMacedonianNumber(changePercentText)
            const volume = parseMacedonianNumber(volumeText)

            // Detection for instrument type
            const isBond = symbol.startsWith('RM') || /^\d/.test(symbol)
            const instrumentType = isBond ? 'bond' : 'stock'

            console.log(`Parsed ${symbol}: price=${price}, change=${changePercent}%, volume=${volume}, type=${instrumentType}`)

            if (price > 0 && !isNaN(price)) {
              stockData.push({
                symbol,
                price,
                changePercent,
                volume,
                instrumentType,
                source: 'most_traded_table'
              })
            }
          }

          return stockData
        } catch (e) {
          console.error('Error in table extraction:', String(e));
          return []
        }
      })

      console.log(`Raw stocks extracted: ${rawStocks.length}`);
      if (rawStocks.length > 0) {
        console.log('Sample raw stock:', JSON.stringify(rawStocks[0]));
      }

      await page.close()

      // Process and validate the scraped data
      stocks = this.processStockData(rawStocks)
      console.log(`Processed stocks: ${stocks.length}`);

      if (stocks.length === 0) {
        errors.push('No valid stock data found')
      } else {
        console.log(`✅ Successfully processed ${stocks.length} stocks`)

        // Enhance stocks with volume data from individual pages
        console.log('🔍 Enhancing stocks with volume data from individual pages...')
        stocks = await this.enhanceStocksWithVolumeData(stocks)
      }

      // Save to database if enabled
      if (this.isDatabaseEnabled && stocks.length > 0) {
        try {
          await this.saveStocksToDatabase(stocks)
          console.log('💾 Stocks saved to database')
        } catch (dbError) {
          const errorMsg = `Database save failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
          errors.push(errorMsg)
          console.error('❌', errorMsg)
        }
      }

      // Log scraping operation
      if (this.isDatabaseEnabled) {
        try {
          await ScrapingLogService.logScrapingOperation({
            status: errors.length > 0 ? 'partial' : 'success',
            stocksCount: stocks.length,
            indicesCount: 0, // Not implementing market indices in this version
            errors: errors.length > 0 ? JSON.stringify(errors) : null,
            duration: Date.now() - startTime,
            source: 'mse.mk'
          })
        } catch (logError) {
          console.warn('Failed to log scraping operation:', logError)
        }
      }

      const result: ScrapingResult = {
        stocks,
        timestamp: new Date().toISOString(),
        source: 'mse.mk',
        errors: errors.length > 0 ? errors : []
      }

      // Add database status info
      if (this.isDatabaseEnabled) {
        console.log('📊 Database integration active')
      } else {
        console.log('📊 Using in-memory data (database not available)')
      }

      return result

    } catch (error) {
      const errorMsg = `Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMsg)
      console.error('❌', errorMsg)

      await page.close()

      // Log error to database if possible
      if (this.isDatabaseEnabled) {
        try {
          await ScrapingLogService.logScrapingOperation({
            status: 'error',
            stocksCount: 0,
            indicesCount: 0,
            errors: JSON.stringify(errors),
            duration: Date.now() - startTime,
            source: 'mse.mk'
          })
        } catch (logError) {
          console.warn('Failed to log scraping error:', logError)
        }
      }

      return {
        stocks: [],
        timestamp: new Date().toISOString(),
        source: 'mse.mk',
        errors
      }
    }
  }

  /**
   * Enhanced method to discover additional MSE companies beyond main page
   * Tries to access individual stock pages for comprehensive company list
   */
  async discoverAllMSECompanies(): Promise<Stock[]> {
    console.log('🔍 Starting enhanced MSE company discovery...')

    if (!this.browser) {
      await this.initialize()
    }

    let page: import('puppeteer').Page | null = null

    try {
      page = await this.browser!.newPage()
      await page.setUserAgent(this.userAgent)

      // Comprehensive list of all known MSE-listed companies (50+)
      const knownMSESymbols = [
        // Banking & Financial (6)
        'ALK', 'KMB', 'TNB', 'STB', 'UNI', 'USJE',
        // Industrial & Manufacturing (6)
        'VITA', 'GRNT', 'MTUR', 'OKTA', 'STIL', 'FERS',
        // Services & Utilities (6)
        'TEL', 'MPT', 'REPL', 'TETE', 'AUMK', 'PPIV',
        // Transportation & Real Estate (4)
        'TIGA', 'RZLE', 'SBT', 'RZUS',
        // Additional companies from MSE directory
        'HLKB', 'SVRB', 'ZUAS', 'DIMI', 'ESM', 'BENG', 'RDMH',
        'HLKO', 'PRIM', 'PRZI', 'KRZI', 'KRNZ',
        'KRAD', 'ZLZN', 'LAJN', 'MKEL', 'EDS', 'METR',
        'ZRNM', 'MNAV', 'TELM', 'EURO', 'BRIK', 'TIGR',
        'INBR', 'SUPB', 'MBRK', 'POBR', 'RMDEN21',
        'MKKU', 'FKAP'
      ]

      console.log(`🔎 Checking ${knownMSESymbols.length} known MSE symbols...`)

      // First get active trading data
      const activeStocks = await this.getStocks()
      const activeStockMap = new Map(activeStocks.map(stock => [stock.symbol, stock]))

      // Get all stocks from database for fallback if enabled
      let dbStocksMap = new Map<string, Stock>()
      if (this.isDatabaseEnabled) {
        try {
          const dbStocks = await StockService.getAllStocks()
          dbStocksMap = new Map(dbStocks.map(s => [s.symbol, StockService.dbStockToAppStock(s)]))
          console.log(`🗄️ Loaded ${dbStocksMap.size} stocks from database for fallback`)
        } catch (dbError) {
          console.warn('⚠️ Could not load database stocks for fallback:', dbError)
        }
      }

      // Create entries for all requested companies
      const allCompanies: Stock[] = []

      for (const symbol of knownMSESymbols) {
        const activeStock = activeStockMap.get(symbol)
        const dbStock = dbStocksMap.get(symbol)

        if (activeStock) {
          // 1. Use real trading data if active today
          allCompanies.push(activeStock)
          console.log(`✅ ${symbol}: Active with trading data (${activeStock.price})`)
        } else if (dbStock && dbStock.price > 0) {
          // 2. Use last known price from database if available
          allCompanies.push({
            ...dbStock,
            // Tag it as "last known" or maintain its lastUpdated
            lastUpdated: dbStock.lastUpdated
          })
          console.log(`📚 ${symbol}: Found last known price in database (${dbStock.price})`)
        } else {
          // 3. Create placeholder entry for inactive companies with no history
          const placeholderStock: Stock = {
            id: `placeholder-${symbol}`,
            symbol: symbol,
            name: this.getCompanyName(symbol),
            price: 0,
            change: 0,
            changePercent: 0,
            volume: 0,
            instrumentType: this.getInstrumentType(symbol),
            lastUpdated: new Date().toISOString()
          }
          allCompanies.push(placeholderStock)
          console.log(`📝 ${symbol}: Added as inactive (no trading data or history)`)
        }
      }

      console.log(`🎯 Returning ${allCompanies.length} companies total (${activeStocks.length} active, ${allCompanies.length - activeStocks.length} inactive)`)

      return allCompanies.sort((a, b) => a.symbol.localeCompare(b.symbol))

    } finally {
      if (page) {
        try {
          await page.close()
        } catch (error) {
          // Silently ignore page close errors
          console.debug('Page close warning (non-critical):', error instanceof Error ? error.message : String(error))
        }
      }
    }
  }

  private async enhanceStocksWithVolumeData(stocks: Stock[]): Promise<Stock[]> {
    if (!this.browser) await this.initialize()
    const page = await this.browser!.newPage()
    const enhancedStocks: Stock[] = []
    try {
      await page.setUserAgent(this.userAgent)
      for (const stock of stocks) {
        try {
          const url = `https://www.mse.mk/en/symbol/${stock.symbol}`
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 })
          const volumeData = await page.evaluate(() => {
            let volume = 0
            const volumeSelectors = ['.volume', '.trading-volume', '[data-volume]', '.last-volume', '.turnover', '.quantity']
            let volumeText = ''
            for (const selector of volumeSelectors) {
              const element = document.querySelector(selector)
              if (element && element.textContent) {
                volumeText = element.textContent.trim()
                break
              }
            }
            if (!volumeText) {
              const allText = document.body.textContent || ''
              const volumePatterns = [/volume[:\s]+([0-9,\.]+)/gi, /količina[:\s]+([0-9,\.]+)/gi, /promet[:\s]+([0-9,\.]+)/gi, /turnover[:\s]+([0-9,\.]+)/gi, /trading volume[:\s]+([0-9,\.]+)/gi, /last quantity[:\s]+([0-9,\.]+)/gi, /количина[:\s]+([0-9,\.]+)/gi]
              const volumeCandidates: { value: number, text: string }[] = []
              for (const pattern of volumePatterns) {
                const matches = [...allText.matchAll(pattern)]
                for (const match of matches) {
                  if (match && match[1]) {
                    const cleanVolume = match[1].replace(/[^\d,]/g, '').replace(/,/g, '')
                    const volumeValue = parseInt(cleanVolume) || 0
                    if (volumeValue > 0 && volumeValue <= 10000) volumeCandidates.push({ value: volumeValue, text: match[1] })
                  }
                }
              }
              if (volumeCandidates.length > 0) {
                const bestVolume = volumeCandidates.sort((a, b) => a.value - b.value)[0]
                if (bestVolume) volumeText = bestVolume.text
              }
            }
            if (volumeText) {
              const cleanVolume = volumeText.replace(/[^\d]/g, '')
              volume = parseInt(cleanVolume) || 0
            }
            return { volume }
          })
          enhancedStocks.push({ ...stock, volume: volumeData.volume })
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch {
          enhancedStocks.push(stock)
        }
      }
      return enhancedStocks
    } finally {
      await page.close()
    }
  }

  private async saveStocksToDatabase(stocks: Stock[]): Promise<void> {
    const dbStocks = stocks.map(stock => StockService.appStockToDbStock(stock))
    const savedStocks = await StockService.bulkUpsertStocks(dbStocks)
    await Promise.allSettled(savedStocks.map(stock => HistoricalDataService.createHistoricalEntryFromStock(stock)))
    console.log(`💾 Saved ${savedStocks.length} stocks to database`)
  }

  async getStocks(): Promise<Stock[]> {
    if (!this.isDatabaseEnabled) {
      const result = await this.scrapeStocks()
      return result.stocks
    }
    try {
      const dbStocks = await StockService.getAllStocks()
      if (dbStocks.length === 0) {
        const result = await this.scrapeStocks()
        return result.stocks
      }
      const MAX_AGE_MS = 15 * 60 * 1000
      const newestUpdate = Math.max(...dbStocks.map(s => s.lastUpdated.getTime()))
      if ((Date.now() - newestUpdate) > MAX_AGE_MS) {
        const result = await this.scrapeStocks()
        return result.stocks
      }
      return dbStocks.map(StockService.dbStockToAppStock)
    } catch {
      const result = await this.scrapeStocks()
      return result.stocks
    }
  }

  async getHistoricalData(symbol: string, days: number = 30): Promise<Record<string, unknown>[]> {
    if (!this.isDatabaseEnabled) return []
    try {
      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
      const historicalPrices = await HistoricalDataService.getHistoricalPrices(symbol.toUpperCase(), startDate, endDate)
      return historicalPrices.map(price => ({ date: price.timestamp.toISOString(), price: parseFloat(price.price), change: parseFloat(price.change), changePercent: parseFloat(price.changePercent), volume: price.volume }))
    } catch {
      return []
    }
  }

  async scrapeMarketIndices(): Promise<MarketIndex[]> { return [] }

  private processStockData(rawStocks: Record<string, unknown>[]): Stock[] {
    const validStocks = rawStocks.filter(stock =>
      stock.symbol &&
      typeof stock.symbol === 'string' &&
      typeof stock.price === 'number' &&
      stock.price > 0 &&
      !isNaN(stock.price)
    )

    const stockMap = new Map<string, Record<string, unknown>>()
    validStocks.forEach(stock => {
      const symbol = (stock.symbol as string).toUpperCase()
      if (!stockMap.has(symbol) || (stock.price as number) > 0) stockMap.set(symbol, stock)
    })

    return Array.from(stockMap.values()).map(stock => {
      const symbol = (stock.symbol as string).toUpperCase()
      const price = stock.price as number
      const changePercent = Number(stock.changePercent) || 0
      const previousPrice = changePercent === 0 ? price : price / (1 + changePercent / 100)

      return {
        id: symbol,
        symbol: symbol,
        name: this.getCompanyName(symbol),
        price: Number(price.toFixed(2)),
        change: Number((price - previousPrice).toFixed(2)),
        changePercent: changePercent,
        volume: (stock.volume as number) || 0,
        instrumentType: (stock.instrumentType as 'stock' | 'bond') || this.getInstrumentType(symbol),
        lastUpdated: new Date().toISOString()
      }
    }).sort((a, b) => a.symbol.localeCompare(b.symbol))
  }

  private getInstrumentType(symbol: string): 'stock' | 'bond' {
    const s = symbol.toUpperCase()
    return (s.startsWith('RM') || /^\d/.test(s)) ? 'bond' : 'stock'
  }

  private getCompanyName(symbol: string): string {
    const companyMap: Record<string, string> = {
      'ALK': 'Алкалоид Скопје', 'KMB': 'Комерцијална банка Скопје', 'TNB': 'НЛБ Банка Скопје', 'STB': 'Стопанска банка Скопје',
      'MPT': 'Макпетрол Скопје', 'TTK': 'ТТК Банка Скопје', 'REPL': 'Реплек Скопје', 'GRNT': 'Гранит Скопје',
      'KBP': 'Комерцијална банка Скопје (Преф)', 'SBT': 'Стопанска банка Битола', 'STBP': 'Стопанска банка Скопје (Преф)',
      'UNI': 'Уни банка Скопје', 'USJE': 'Цементарница УСЈЕ Скопје', 'VITA': 'Витаминка Прилеп', 'OKTA': 'ОКТА Скопје',
      'STIL': 'Стил Скопје', 'FERS': 'Ферс Скопје', 'AUMK': 'Ауремарк Скопје', 'PPIV': 'ППИВ Скопје', 'TIGA': 'Тига Скопје',
      'RZLE': 'РЖ Лесновска Скопје', 'RZUS': 'РЖ Услуги Скопје', 'HLKB': 'Халк Банка АД Скопје', 'SVRB': 'Светска Варезна Банка АД Скопје',
      'ZUAS': 'Жито Варадар АД Неготино', 'DIMI': 'Дими АД Кавадарци', 'ESM': 'ЕСМ АД Скопје', 'BENG': 'Бенг АД Скопје',
      'RDMH': 'РДМХ АД Скопје', 'HLKO': 'Халк Осигурување АД Скопје', 'PRIM': 'Прим Осигурување АД Скопје', 'PRZI': 'ПРЗ Идеја АД Скопје',
      'KRZI': 'КРЗ Идеја АД Скопје', 'KRNZ': 'КРН Нови Занаетчиски АД Скопје', 'KRAD': 'КРАД АД Скопје', 'ZLZN': 'Золотна Зена АД Скопје',
      'LAJN': 'Лајн АД Скопје', 'MKEL': 'М Кел АД Скопје', 'EDS': 'ЕДС АД Скопје', 'METR': 'Метро АД Скопје', 'ZRNM': 'Железница на Македонија АД Скопје',
      'MNAV': 'Морска Навигација АД Скопје', 'TELM': 'Телм АД Скопје', 'EURO': 'Евро АД Скопје', 'BRIK': 'Брик АД Скопје',
      'TIGR': 'Тигр АД Скопје', 'INBR': 'Инва Брокер АД Скопје', 'SUPB': 'Суперб Брокер АД Скопје', 'MBRK': 'М Брокер АД Скопје',
      'POBR': 'По Брокер АД Скопје', 'RMDEN21': 'РМ Денари 2021 АД Скопје', 'MKKU': 'МК Кујув АД Скопје', 'FKAP': 'ФК Апо АД Скопје'
    }
    return companyMap[symbol] || `${symbol} Company`
  }

  async getDatabaseStatus() {
    if (!this.isDatabaseEnabled) return { status: 'disabled', message: 'Database connection not available' }
    return await DatabaseService.getHealthStatus()
  }
}

// Utility function to check if market is open
export function isMarketOpen(): boolean {
  const now = new Date()

  // Convert to Macedonia timezone (UTC+1/UTC+2)
  const macedoniaTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Skopje',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false
  }).formatToParts(now)

  const weekday = macedoniaTime.find(part => part.type === 'weekday')?.value
  const hour = parseInt(macedoniaTime.find(part => part.type === 'hour')?.value || '0')
  const minute = parseInt(macedoniaTime.find(part => part.type === 'minute')?.value || '0')

  // Market is closed on weekends
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false
  }

  // Market hours: 9:00 AM - 4:00 PM Macedonia time
  const currentMinutes = hour * 60 + minute
  const marketOpen = 9 * 60 // 9:00 AM
  const marketClose = 16 * 60 // 4:00 PM

  return currentMinutes >= marketOpen && currentMinutes <= marketClose
}

export function getMarketStatus(): import('./types').MarketStatusInfo {
  const now = new Date()
  const isOpen = isMarketOpen()

  // Convert to Macedonia timezone
  const macedoniaTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Skopje',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour12: false
  }).formatToParts(now)

  const weekday = macedoniaTime.find(part => part.type === 'weekday')?.value
  const hour = parseInt(macedoniaTime.find(part => part.type === 'hour')?.value || '0')

  let status: import('./types').MarketStatus
  let nextOpen: string
  let nextClose: string

  if (weekday === 'Sat' || weekday === 'Sun') {
    status = 'closed'
    // Next open is Monday 9:00 AM
    const nextMonday = new Date(now)
    nextMonday.setDate(now.getDate() + (1 + 7 - now.getDay()) % 7)
    nextMonday.setHours(9, 0, 0, 0)
    nextOpen = nextMonday.toISOString()
    nextClose = 'N/A'
  } else if (hour < 9) {
    status = 'pre-market'
    const today = new Date(now)
    today.setHours(9, 0, 0, 0)
    nextOpen = today.toISOString()
    today.setHours(16, 0, 0, 0)
    nextClose = today.toISOString()
  } else if (hour >= 16) {
    status = 'after-hours'
    const tomorrow = new Date(now)
    // Account for weekends: Friday after-hours -> Monday
    const dayOfWeek = now.getDay()
    const daysUntilNextOpen = dayOfWeek === 5 ? 3 : dayOfWeek === 6 ? 2 : 1
    tomorrow.setDate(now.getDate() + daysUntilNextOpen)
    tomorrow.setHours(9, 0, 0, 0)
    nextOpen = tomorrow.toISOString()
    nextClose = 'N/A'
  } else {
    status = 'open'
    const today = new Date(now)
    today.setHours(16, 0, 0, 0)
    nextClose = today.toISOString()
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    nextOpen = tomorrow.toISOString()
  }

  return {
    isOpen,
    status,
    nextOpen,
    nextClose,
    timezone: 'Europe/Skopje'
  }
}

// Export the enhanced scraper as the main MSEScraper
export { MSEScraperWithDB as MSEScraper }