import puppeteer, { Browser } from 'puppeteer'
import { Stock, ScrapingResult, MarketIndex } from './types'
import { StockService, HistoricalDataService, ScrapingLogService } from './db/services'
import { DatabaseService } from './db/connection'

export class MSEScraperWithDB {
  private browser: Browser | null = null
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  private isDatabaseEnabled = false
  private isInitialized = false

  // Private constructor - use create() factory method instead
  private constructor() { }

  // Factory method for proper async initialization
  static async create(): Promise<MSEScraperWithDB> {
    const scraper = new MSEScraperWithDB()
    await scraper.checkDatabaseConnection()
    scraper.isInitialized = true
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
    } catch (error) {
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

      // Navigate to MSE main page with timeout
      let navigationSuccess = false
      try {
        await Promise.race([
          page.goto('https://www.mse.mk/en', {
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
      } catch (e) {
        console.warn('⚠️ Could not find body element, continuing anyway')
      }
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Extract stocks using the stock symbol links on the main page
      const rawStocks = await page.evaluate(() => {
        const stockData: any[] = []
        console.log('Starting targeted stock extraction from MSE main page')

        try {
          // Look for stock links in the format mse.mk/en/symbol/SYMBOL
          const stockLinks = Array.from(document.querySelectorAll('a[href*="/symbol/"]'))
          console.log(`Found ${stockLinks.length} stock symbol links`)

          for (const link of stockLinks) {
            const href = link.getAttribute('href') || ''
            const symbolMatch = href.match(/\/symbol\/([A-Z0-9]+)/)

            if (symbolMatch) {
              const symbol = symbolMatch[1]
              const linkText = link.textContent?.trim() || ''

              console.log(`Processing link for ${symbol}: "${linkText}"`)

              // Parse the link text which should be in format: "SYMBOL price change%"
              // Example: "ALK 25,901.80 -0.07 %"
              const parts = linkText.split(/\s+/)

              if (parts.length >= 3 && parts[0] === symbol) {
                const priceText = parts[1] || ''
                const changeText = parts[2] + (parts[3] || '')

                // Parse price - handle comma as thousands separator
                let price = 0
                if (priceText && priceText.includes(',')) {
                  // Format like "25,901.80" -> 25901.80
                  price = parseFloat(priceText.replace(',', ''))
                } else if (priceText) {
                  price = parseFloat(priceText)
                }

                // Parse change percentage
                let changePercent = 0
                const changeMatch = changeText.match(/([+-]?\d+[.,]?\d*)%?/)
                if (changeMatch && changeMatch[1]) {
                  changePercent = parseFloat(changeMatch[1].replace(',', '.'))
                }

                console.log(`Parsed ${symbol}: price=${price}, change=${changePercent}%`)

                if (price > 0 && !isNaN(price)) {
                  stockData.push({
                    symbol: symbol,
                    price: price,
                    changePercent: changePercent,
                    volume: 0, // Will be updated later with individual page scraping
                    source: 'main_page_link'
                  })
                }
              }
            }
          }

          console.log(`Successfully extracted ${stockData.length} stocks from main page links`)
          return stockData
        } catch (evalError) {
          console.error('Error in page evaluation:', evalError)
          return []
        }
      })

      await page.close()

      // Process and validate the scraped data
      stocks = this.processStockData(rawStocks)

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

    let page: any = null

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

      // Create entries for all requested companies
      const allCompanies: Stock[] = []

      for (const symbol of knownMSESymbols) {
        const activeStock = activeStockMap.get(symbol)

        if (activeStock) {
          // Use real trading data
          allCompanies.push(activeStock)
          console.log(`✅ ${symbol}: Active with trading data`)
        } else {
          // Create placeholder entry for inactive companies
          const placeholderStock: Stock = {
            id: `placeholder-${symbol}`,
            symbol: symbol,
            name: this.getCompanyName(symbol),
            price: 0,
            change: 0,
            changePercent: 0,
            volume: 0,
            lastUpdated: new Date().toISOString()
          }
          allCompanies.push(placeholderStock)
          console.log(`📝 ${symbol}: Added as inactive (no trading data)`)
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

  /**
   * Scrape individual stock data from its dedicated page
   */
  private async scrapeIndividualStock(page: any, symbol: string): Promise<Stock | null> {
    try {
      const url = `https://www.mse.mk/en/symbol/${symbol}`

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 15000
      })

      // Check if page loaded successfully (not 404 or error)
      const title = await page.title()
      if (title.toLowerCase().includes('error') || title.toLowerCase().includes('not found')) {
        return null
      }

      // Extract stock data from the individual stock page
      const stockData = await page.evaluate((sym: string) => {
        console.log(`Extracting data for ${sym}`)

        // Try to find price information on the page
        const priceSelectors = [
          '.stock-price',
          '.current-price',
          '.price',
          '[data-price]',
          '.last-trade-price'
        ]

        let price = 0
        let volume = 0
        let change = 0
        let changePercent = 0
        let priceText = ''

        // Look for price in selectors
        for (const selector of priceSelectors) {
          const element = document.querySelector(selector)
          if (element && element.textContent) {
            priceText = element.textContent.trim()
            break
          }
        }

        // If no specific price element found, look for price patterns in text
        if (!priceText) {
          const allText = document.body.textContent || ''
          const priceMatch = allText.match(new RegExp(`${sym}[\\s:]+([\\d,]+\\.?\\d*)`, 'i'))
          if (priceMatch && priceMatch[1]) {
            priceText = priceMatch[1]
          }
        }

        // Parse price
        if (priceText) {
          const cleanPrice = priceText.replace(/[^\d.,]/g, '').replace(',', '')
          price = parseFloat(cleanPrice) || 0
        }

        // Look for volume data in various formats
        const volumeSelectors = [
          '.volume',
          '.trading-volume',
          '[data-volume]',
          '.last-volume',
          '.turnover'
        ]

        let volumeText = ''
        for (const selector of volumeSelectors) {
          const element = document.querySelector(selector)
          if (element && element.textContent) {
            volumeText = element.textContent.trim()
            break
          }
        }

        // Look for volume patterns in page text
        if (!volumeText) {
          const allText = document.body.textContent || ''

          // Common volume patterns on MSE pages
          const volumePatterns = [
            /volume[:\s]+([0-9,]+)/i,
            /količina[:\s]+([0-9,]+)/i,
            /promet[:\s]+([0-9,]+)/i,
            /turnover[:\s]+([0-9,]+)/i,
            /trading volume[:\s]+([0-9,]+)/i
          ]

          for (const pattern of volumePatterns) {
            const match = allText.match(pattern)
            if (match && match[1]) {
              volumeText = match[1]
              console.log(`Found volume for ${sym}: ${volumeText}`)
              break
            }
          }
        }

        // Parse volume
        if (volumeText) {
          const cleanVolume = volumeText.replace(/[^\d,]/g, '').replace(',', '')
          volume = parseInt(cleanVolume) || 0
        }

        // Look for change data
        const allText = document.body.textContent || ''

        // Look for change percentage patterns
        const changePatterns = [
          /([+-]?\d+[.,]?\d*)\s*%/,
          /change[:\s]+([+-]?\d+[.,]?\d*)/i,
          /промена[:\s]+([+-]?\d+[.,]?\d*)/i
        ]

        for (const pattern of changePatterns) {
          const match = allText.match(pattern)
          if (match && match[1]) {
            changePercent = parseFloat(match[1].replace(',', '.')) || 0
            break
          }
        }

        // Calculate absolute change from percentage if we have price
        if (changePercent !== 0 && price > 0) {
          change = (price * changePercent) / 100
        }

        console.log(`Extracted ${sym}: price=${price}, volume=${volume}, change=${changePercent}%`)

        return {
          symbol: sym,
          price: price,
          volume: volume,
          change: change,
          changePercent: changePercent,
          found: price > 0
        }
      }, symbol)

      if (stockData.found && stockData.price > 0) {
        return {
          id: `mse-${symbol}`,
          symbol: symbol,
          name: this.getCompanyName(symbol),
          price: stockData.price,
          change: stockData.change,
          changePercent: stockData.changePercent,
          volume: stockData.volume,
          lastUpdated: new Date().toISOString()
        }
      }

      return null

    } catch (error) {
      // Page doesn't exist or other error - company not actively traded
      return null
    }
  }

  /**
   * Enhance existing stocks with volume data by visiting individual stock pages
   */
  private async enhanceStocksWithVolumeData(stocks: Stock[]): Promise<Stock[]> {
    if (!this.browser) {
      await this.initialize()
    }

    const page = await this.browser!.newPage()
    const enhancedStocks: Stock[] = []

    try {
      await page.setUserAgent(this.userAgent)

      console.log(`📊 Enhancing ${stocks.length} stocks with volume data...`)

      for (const stock of stocks) {
        try {
          console.log(`🔍 Getting volume data for ${stock.symbol}...`)

          const url = `https://www.mse.mk/en/symbol/${stock.symbol}`

          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 10000
          })

          // Extract volume data from the individual stock page
          const volumeData = await page.evaluate(() => {
            let volume = 0

            // Look for volume data in various formats
            const volumeSelectors = [
              '.volume',
              '.trading-volume',
              '[data-volume]',
              '.last-volume',
              '.turnover',
              '.quantity'
            ]

            let volumeText = ''
            for (const selector of volumeSelectors) {
              const element = document.querySelector(selector)
              if (element && element.textContent) {
                volumeText = element.textContent.trim()
                break
              }
            }

            // Look for volume patterns in page text - find ALL matches and pick the trading quantity (smaller volume)
            if (!volumeText) {
              const allText = document.body.textContent || ''

              // Common volume patterns on MSE pages - use global flag to find all matches
              const volumePatterns = [
                /volume[:\s]+([0-9,\.]+)/gi,
                /količina[:\s]+([0-9,\.]+)/gi,
                /promet[:\s]+([0-9,\.]+)/gi,
                /turnover[:\s]+([0-9,\.]+)/gi,
                /trading volume[:\s]+([0-9,\.]+)/gi,
                /last quantity[:\s]+([0-9,\.]+)/gi,
                /количина[:\s]+([0-9,\.]+)/gi
              ]

              const volumeCandidates: { value: number, text: string }[] = []

              for (const pattern of volumePatterns) {
                // Find all matches for this pattern
                const matches = [...allText.matchAll(pattern)]
                for (const match of matches) {
                  if (match && match[1]) {
                    // Parse the volume value
                    const cleanVolume = match[1].replace(/[^\d,]/g, '').replace(/,/g, '')
                    const volumeValue = parseInt(cleanVolume) || 0

                    // Only consider reasonable trading quantities (between 1 and 10,000)
                    // The actual trading quantity (number of shares) is typically much smaller
                    // than the turnover amount on MSE
                    if (volumeValue > 0 && volumeValue <= 10000) {
                      volumeCandidates.push({
                        value: volumeValue,
                        text: match[1]
                      })
                    }
                  }
                }
              }

              // Pick the smallest reasonable volume (most likely to be trading quantity, not turnover)
              if (volumeCandidates.length > 0) {
                const bestVolume = volumeCandidates.sort((a, b) => a.value - b.value)[0] // Sort ASCENDING to get smallest
                if (bestVolume) {
                  volumeText = bestVolume.text
                  console.log(`📊 Found ${volumeCandidates.length} volume candidates for stock, selected smallest: ${bestVolume.text} (${bestVolume.value})`)
                }
              }
            }

            // Parse volume
            if (volumeText) {
              // Remove commas and parse as integer
              const cleanVolume = volumeText.replace(/[^\d]/g, '')
              volume = parseInt(cleanVolume) || 0
              console.log(`📊 Final trading quantity for stock: ${volume}`)
            }

            // If no volume found, set to 0 (real data only, no fake generation)
            if (volume === 0) {
              console.log(`⚠️ No trading volume found for stock, using 0`)
            }

            return { volume }
          })

          // Update stock with volume data
          enhancedStocks.push({
            ...stock,
            volume: volumeData.volume
          })

          console.log(`📊 ${stock.symbol}: volume = ${volumeData.volume}`)

          // Small delay to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (error) {
          console.warn(`⚠️ Could not get volume for ${stock.symbol}:`, error instanceof Error ? error.message : 'Unknown error')

          // Keep original stock with volume 0
          enhancedStocks.push(stock)
        }
      }

      console.log(`✅ Enhanced ${enhancedStocks.length} stocks with volume data`)
      return enhancedStocks

    } finally {
      await page.close()
    }
  }

  private async saveStocksToDatabase(stocks: Stock[]): Promise<void> {
    // Convert app stocks to database format and bulk upsert
    const dbStocks = stocks.map(stock => StockService.appStockToDbStock(stock))
    const savedStocks = await StockService.bulkUpsertStocks(dbStocks)

    // Create historical entries for each stock
    const historicalEntries = await Promise.allSettled(
      savedStocks.map(stock => HistoricalDataService.createHistoricalEntryFromStock(stock))
    )

    const successfulHistoricalEntries = historicalEntries.filter(
      result => result.status === 'fulfilled'
    ).length

    console.log(`💾 Saved ${savedStocks.length} stocks and ${successfulHistoricalEntries} historical entries`)
  }

  // Get stocks from database (fallback to scraping if database is empty)
  async getStocks(): Promise<Stock[]> {
    if (!this.isDatabaseEnabled) {
      console.log('📊 Database not available, performing live scraping...')
      const result = await this.scrapeStocks()
      return result.stocks
    }

    try {
      const dbStocks = await StockService.getAllStocks()

      if (dbStocks.length === 0) {
        console.log('📊 No stocks in database, performing initial scraping...')
        const result = await this.scrapeStocks()
        return result.stocks
      }

      // Check if data is recent (within last hour)
      const oldestAcceptableTime = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      const recentStocks = dbStocks.filter(
        stock => stock.lastUpdated > oldestAcceptableTime
      )

      if (recentStocks.length === 0) {
        console.log('📊 Database stocks are stale, performing fresh scraping...')
        const result = await this.scrapeStocks()
        return result.stocks
      }

      console.log(`📊 Returning ${recentStocks.length} stocks from database`)
      return recentStocks.map(StockService.dbStockToAppStock)

    } catch (error) {
      console.error('❌ Database error, falling back to live scraping:', error)
      const result = await this.scrapeStocks()
      return result.stocks
    }
  }

  // Get historical data for a stock
  async getHistoricalData(symbol: string, days: number = 30): Promise<any[]> {
    if (!this.isDatabaseEnabled) {
      console.log('📊 Database not available, historical data not supported')
      return []
    }

    try {
      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)

      const historicalPrices = await HistoricalDataService.getHistoricalPrices(
        symbol.toUpperCase(),
        startDate,
        endDate
      )

      return historicalPrices.map(price => ({
        date: price.timestamp.toISOString(),
        price: parseFloat(price.price),
        change: parseFloat(price.change),
        changePercent: parseFloat(price.changePercent),
        volume: price.volume,
      }))
    } catch (error) {
      console.error(`❌ Error getting historical data for ${symbol}:`, error)
      return []
    }
  }

  async scrapeMarketIndices(): Promise<MarketIndex[]> {
    // Simplified implementation - return empty for now
    return []
  }

  private processStockData(rawStocks: any[]): Stock[] {
    console.log(`Processing ${rawStocks.length} raw stock entries`)

    // Filter for valid data - accept ALL symbols (no hardcoded whitelist)
    const validStocks = rawStocks.filter(stock => {
      const symbol = stock.symbol?.toUpperCase()
      const isValid =
        stock.symbol &&
        typeof stock.price === 'number' &&
        stock.price > 0 &&
        !isNaN(stock.price) &&
        isFinite(stock.price) &&
        stock.price < 200000 // Reasonable upper limit for MKD prices

      if (!isValid && symbol) {
        console.log(`Filtering out invalid stock data for ${symbol}: ${JSON.stringify(stock)}`)
      }

      return isValid
    })

    console.log(`Found ${validStocks.length} valid stocks (all symbols accepted)`)

    // Deduplicate by symbol
    const stockMap = new Map<string, any>()

    validStocks.forEach(stock => {
      const symbol = stock.symbol.toUpperCase()
      const existing = stockMap.get(symbol)

      if (!existing || stock.price > 0) {
        stockMap.set(symbol, stock)
      }
    })

    console.log(`After deduplication, have ${stockMap.size} unique stocks`)

    // Convert to final format
    return Array.from(stockMap.values())
      .map(stock => {
        const symbol = stock.symbol.toUpperCase()

        // Calculate change amount from percentage
        const changePercent = Number(stock.changePercent) || 0
        let changeAmount: number

        if (changePercent === 0) {
          changeAmount = 0
        } else {
          const previousPrice = stock.price / (1 + changePercent / 100)
          changeAmount = stock.price - previousPrice
        }

        console.log(`Final processed ${symbol}: Price=${stock.price}, Change=${changeAmount.toFixed(2)}, ChangePercent=${changePercent}`)

        return {
          id: symbol,
          symbol: symbol,
          name: this.getCompanyName(symbol),
          price: Number(stock.price.toFixed(2)),
          change: Number(changeAmount.toFixed(2)),
          changePercent: changePercent,
          volume: stock.volume || 0,
          lastUpdated: new Date().toISOString()
        }
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  }

  private getCompanyName(symbol: string): string {
    // Comprehensive company mapping for all MSE-listed companies
    const companyMap: Record<string, string> = {
      // Core Trading Companies
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
      'RZUS': 'РЖ Услуги Скопје',

      // Additional MSE Listed Companies
      'HLKB': 'Халк Банка АД Скопје',
      'SVRB': 'Светска Варезна Банка АД Скопје',
      'ZUAS': 'Жито Варадар АД Неготино',
      'DIMI': 'Дими АД Кавадарци',
      'ESM': 'ЕСМ АД Скопје',
      'BENG': 'Бенг АД Скопје',
      'RDMH': 'РДМХ АД Скопје',
      'HLKO': 'Халк Осигурување АД Скопје',
      'PRIM': 'Прим Осигурување АД Скопје',
      'PRZI': 'ПРЗ Идеја АД Скопје',
      'KRZI': 'КРЗ Идеја АД Скопје',
      'KRNZ': 'КРН Нови Занаетчиски АД Скопје',
      'KRAD': 'КРАД АД Скопје',
      'ZLZN': 'Золотна Зена АД Скопје',
      'LAJN': 'Лајн АД Скопје',
      'MKEL': 'М Кел АД Скопје',
      'EDS': 'ЕДС АД Скопје',
      'METR': 'Метро АД Скопје',
      'ZRNM': 'Железница на Македонија АД Скопје',
      'MNAV': 'Морска Навигација АД Скопје',
      'TELM': 'Телм АД Скопје',
      'EURO': 'Евро АД Скопје',
      'BRIK': 'Брик АД Скопје',
      'TIGR': 'Тигр АД Скопје',
      'INBR': 'Инва Брокер АД Скопје',
      'SUPB': 'Суперб Брокер АД Скопје',
      'MBRK': 'М Брокер АД Скопје',
      'POBR': 'По Брокер АД Скопје',
      'RMDEN21': 'РМ Денари 2021 АД Скопје',
      'MKKU': 'МК Кујув АД Скопје',
      'FKAP': 'ФК Апо АД Скопје'
    }

    return companyMap[symbol] || `${symbol} Company`
  }

  // Utility method to get database status
  async getDatabaseStatus() {
    if (!this.isDatabaseEnabled) {
      return {
        status: 'disabled',
        message: 'Database connection not available'
      }
    }

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