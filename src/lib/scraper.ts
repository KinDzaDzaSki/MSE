import puppeteer, { Browser, Page } from 'puppeteer'
import { Stock, ScrapingResult, MarketIndex } from './types'

export class MSEScraper {
  private browser: Browser | null = null
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

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
    if (!this.browser) {
      await this.initialize()
    }

    const page = await this.browser!.newPage()
    const errors: string[] = []
    
    try {
      await page.setUserAgent(this.userAgent)
      await page.setViewport({ width: 1280, height: 720 })
      
      // Set timeout and retry logic
      const maxRetries = 3
      let lastError: Error | null = null
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Navigate to MSE English page with timeout
          await page.goto('https://www.mse.mk/en', {
            waitUntil: 'networkidle2',
            timeout: 30000
          })

          // Wait for the stock table to load
          await page.waitForSelector('table', { timeout: 15000 })
          break // Success, exit retry loop
          
        } catch (error) {
          lastError = error as Error
          errors.push(`Attempt ${attempt} failed: ${lastError.message}`)
          
          if (attempt < maxRetries) {
            // Wait before retry with exponential backoff
            const delay = Math.pow(2, attempt) * 1000
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      }
      
      if (lastError) {
        throw new Error(`All ${maxRetries} attempts failed. Last error: ${lastError.message}`)
      }

      // Extract stock data with better error handling
      const stocks = await page.evaluate(() => {
        const stockData: any[] = []
        
        try {
          // Try different table selectors and approaches
          const tables = document.querySelectorAll('table')
          
          for (const table of tables) {
            const rows = table.querySelectorAll('tr')
            
            for (const row of rows) {
              const cells = row.querySelectorAll('td')
              
              if (cells.length >= 3) {
                try {
                  const symbolElement = cells[0]?.querySelector('a') || cells[0]
                  const symbol = symbolElement?.textContent?.trim()
                  
                  if (symbol && symbol.length > 0 && symbol.length <= 10 && /^[A-Z]+$/.test(symbol)) {
                    const priceText = cells[1]?.textContent?.trim() || '0'
                    const changeText = cells[2]?.textContent?.trim() || '0'
                    const volumeText = cells[3]?.textContent?.trim() || '0'
                    
                    // Parse price (remove commas and non-numeric characters except dots)
                    const price = parseFloat(priceText.replace(/[^0-9.]/g, ''))
                    
                    // Parse change percentage
                    const changeMatch = changeText.match(/([-+]?\d+\.?\d*)/)
                    const change = changeMatch ? parseFloat(changeMatch[1]) : 0
                    
                    // Parse volume (remove commas and non-numeric characters)
                    const volume = parseInt(volumeText.replace(/[^0-9]/g, '')) || 0
                    
                    if (price > 0 && !isNaN(price)) {
                      stockData.push({
                        symbol: symbol.toUpperCase(),
                        price,
                        changePercent: change,
                        volume
                      })
                    }
                  }
                } catch (cellError) {
                  // Skip problematic rows but continue processing
                  console.warn('Error processing table row:', cellError)
                }
              }
            }
          }
          
          return stockData
        } catch (evalError) {
          console.error('Error in page evaluation:', evalError)
          return []
        }
      })

      await page.close()

      // Process and validate the scraped data
      const processedStocks = this.processStockData(stocks)
      
      if (processedStocks.length === 0) {
        errors.push('No valid stock data found on the page')
      }
      
      return {
        stocks: processedStocks,
        timestamp: new Date().toISOString(),
        source: 'mse.mk',
        errors: errors.length > 0 ? errors : undefined
      }

    } catch (error) {
      errors.push(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      await page.close()
      
      return {
        stocks: [],
        timestamp: new Date().toISOString(),
        source: 'mse.mk',
        errors
      }
    }
  }

  async scrapeMarketIndices(): Promise<MarketIndex[]> {
    if (!this.browser) {
      await this.initialize()
    }

    const page = await this.browser!.newPage()
    
    try {
      await page.setUserAgent(this.userAgent)
      await page.goto('https://www.mse.mk/en', {
        waitUntil: 'networkidle2',
        timeout: 30000
      })

      const indices = await page.evaluate(() => {
        const indexData: any[] = []
        
        // Look for MBI10 index data
        const indexElements = document.querySelectorAll('[class*="index"], [class*="mbi"]')
        
        for (const element of indexElements) {
          const text = element.textContent || ''
          const mbi10Match = text.match(/MBI10.*?(\d+[\d,]*\.?\d*).*?([-+]?\d+\.?\d*)%?/)
          
          if (mbi10Match) {
            indexData.push({
              name: 'MBI10',
              value: parseFloat(mbi10Match[1].replace(/,/g, '')),
              changePercent: parseFloat(mbi10Match[2])
            })
          }
        }
        
        return indexData
      })

      await page.close()
      
      return indices.map(index => ({
        ...index,
        change: 0, // Calculate from value and percent if needed
        lastUpdated: new Date().toISOString()
      }))

    } catch (error) {
      await page.close()
      console.error('Failed to scrape market indices:', error)
      return []
    }
  }

  private processStockData(rawStocks: any[]): Stock[] {
    // First filter valid stocks
    const validStocks = rawStocks.filter(stock => 
      stock.symbol && 
      typeof stock.price === 'number' && 
      stock.price > 0
    )

    // Create a map to deduplicate by symbol, keeping the most recent data
    const stockMap = new Map<string, any>()
    
    validStocks.forEach(stock => {
      const symbol = stock.symbol.toUpperCase()
      const existing = stockMap.get(symbol)
      
      // Keep the stock with higher volume or more recent data
      if (!existing || stock.volume > existing.volume) {
        stockMap.set(symbol, stock)
      }
    })

    // Convert map back to array and process
    return Array.from(stockMap.values())
      .map(stock => {
        // Calculate change amount from percentage
        const changeAmount = (stock.price * stock.changePercent) / (100 + stock.changePercent)
        
        return {
          id: stock.symbol.toUpperCase(),
          symbol: stock.symbol.toUpperCase(),
          name: this.getCompanyName(stock.symbol.toUpperCase()),
          price: stock.price,
          change: changeAmount,
          changePercent: stock.changePercent,
          volume: stock.volume || 0,
          lastUpdated: new Date().toISOString()
        }
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  }

  private getCompanyName(symbol: string): string {
    // Basic mapping of symbols to company names
    const companyMap: Record<string, string> = {
      'ALK': 'Alkaloid AD Skopje',
      'KMB': 'Komercijalna Banka AD Skopje',
      'MPT': 'Makpetrol AD Skopje',
      'STB': 'Stopanska Banka AD Bitola',
      'TNB': 'Tutunska Banka AD Prilep',
      'UNI': 'Univerzalna Banka AD Skopje',
      'VITA': 'Vitaminka AD Prilep',
      'TEL': 'Makedonski Telekom AD Skopje',
      'USJE': 'Usje AD Skopje',
      'REPL': 'Replek AD Skopje'
    }
    
    return companyMap[symbol] || `${symbol} Company`
  }

  // Rate limiting helper
  private async waitForRateLimit(minDelay: number = 2000): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, minDelay))
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