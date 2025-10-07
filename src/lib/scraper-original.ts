import puppeteer, { Browser } from 'puppeteer'
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
      
      // Navigate to MSE main page
      await page.goto('https://www.mse.mk/en', {
        waitUntil: 'networkidle2',
        timeout: 30000
      })

      // Wait for content to load
      await page.waitForSelector('body', { timeout: 10000 })
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Extract stocks using the stock symbol links on the main page
      const stocks = await page.evaluate(() => {
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
                    volume: 0, // Volume not available in main page links
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
      const processedStocks = this.processStockData(stocks)
      
      if (processedStocks.length === 0) {
        errors.push('No valid stock data found')
      }
      
      return {
        stocks: processedStocks,
        timestamp: new Date().toISOString(),
        source: 'mse.mk',
        errors: errors.length > 0 ? errors : []
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
    // Simplified implementation - return empty for now
    return []
  }

  private processStockData(rawStocks: any[]): Stock[] {
    console.log(`Processing ${rawStocks.length} raw stock entries`)
    
    // Filter and validate stocks
    const validStocks = rawStocks.filter(stock => {
      const isValid = 
        stock.symbol && 
        typeof stock.price === 'number' && 
        stock.price > 0 &&
        !isNaN(stock.price) &&
        isFinite(stock.price) &&
        stock.price < 200000 // Reasonable upper limit for MKD prices
        
      if (!isValid) {
        console.log(`Filtering out invalid stock: ${JSON.stringify(stock)}`)
      }
      return isValid
    })
    
    console.log(`Found ${validStocks.length} valid stocks after filtering`)

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
          const previousPrice = stock.price / (1 + changePercent/100)
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
    const companyMap: Record<string, string> = {
      'ALK': 'Alkaloid AD Skopje',
      'KMB': 'Komercijalna Banka AD Skopje',
      'MPT': 'Makpetrol AD Skopje',
      'STB': 'Stopanska Banka AD Bitola',
      'TNB': 'NLB Banka AD Skopje (formerly Tutunska)',
      'GRNT': 'Granit AD Skopje',
      'MTUR': 'Makedonija Turist AD Skopje',
      'REPL': 'Replek AD Skopje',
      'TEL': 'Makedonski Telekom AD Skopje',
      'VITA': 'Vitaminka AD Prilep',
      'UNI': 'TTK Banka AD Skopje (formerly Univerzalna)',
      'USJE': 'Cementarnica USJE AD Skopje',
      'TTK': 'TTK Banka AD Skopje'
    }
    
    return companyMap[symbol] || `${symbol} Company`
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