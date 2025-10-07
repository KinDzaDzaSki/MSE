import { Browser, Page } from 'puppeteer'
import { Stock } from './types'

/**
 * Enhanced scraper that extracts comprehensive data from individual stock pages
 * This provides much more data than the main page scraping approach
 */
export class EnhancedMSEScraper {
  
  /**
   * Scrape detailed data from individual stock page
   * URL format: https://www.mse.mk/en/symbol/ALK
   */
  async scrapeDetailedStockData(page: Page, symbol: string): Promise<Stock | null> {
    try {
      const url = `https://www.mse.mk/en/symbol/${symbol}`
      console.log(`🔍 Scraping detailed data for ${symbol} from ${url}`)
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      })
      
      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Extract comprehensive stock data
      const stockData = await page.evaluate((symbol) => {
        // Helper function to extract text content safely
        const getText = (selector: string): string => {
          const element = document.querySelector(selector)
          return element?.textContent?.trim() || ''
        }
        
        const getNumericValue = (text: string): number => {
          // Handle both comma and dot decimal separators
          const cleaned = text.replace(/[^\d.,-]/g, '').replace(',', '.')
          return parseFloat(cleaned) || 0
        }
        
        // Extract stock information from various selectors on the page
        // Note: These selectors may need adjustment based on actual MSE page structure
        
        const priceText = getText('.stock-price, .current-price, [data-price]')
        const changeText = getText('.price-change, .change-percent, [data-change]')
        const volumeText = getText('.volume, .trading-volume, [data-volume]')
        const openText = getText('.open-price, [data-open]')
        const highText = getText('.high-price, [data-high]')
        const lowText = getText('.low-price, [data-low]')
        const marketCapText = getText('.market-cap, [data-market-cap]')
        
        // Company name extraction
        const companyName = getText('h1, .company-name, .stock-title') || symbol
        
        return {
          id: `mse-${symbol}`,
          symbol,
          name: companyName,
          price: getNumericValue(priceText),
          change: getNumericValue(changeText),
          changePercent: getNumericValue(changeText), // Will be calculated properly
          volume: getNumericValue(volumeText),
          currency: 'MKD',
          lastUpdated: new Date().toISOString()
        }
      }, symbol)
      
      // Validate extracted data
      if (!stockData.price || stockData.price <= 0) {
        console.warn(`⚠️ Invalid price data for ${symbol}: ${stockData.price}`)
        return null
      }
      
      console.log(`✅ Successfully extracted detailed data for ${symbol}:`, {
        price: stockData.price,
        volume: stockData.volume
      })
      
      return stockData as Stock
      
    } catch (error) {
      console.error(`❌ Error scraping detailed data for ${symbol}:`, error)
      return null
    }
  }
  
  /**
   * Scrape all stocks with detailed data using concurrent processing
   */
  async scrapeAllStocksDetailed(browser: Browser, symbols: string[]): Promise<Stock[]> {
    const results: Stock[] = []
    const batchSize = 3 // Process 3 stocks concurrently
    
    console.log(`🚀 Starting detailed scraping for ${symbols.length} stocks (batch size: ${batchSize})`)
    
    // Process stocks in batches to avoid overwhelming the server
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.join(', ')}`)
      
      // Create pages for concurrent processing
      const pages = await Promise.all(
        batch.map(() => browser.newPage())
      )
      
      try {
        // Set up pages for optimal performance
        await Promise.all(pages.map(async (page) => {
          // Block unnecessary resources to speed up loading
          await page.setRequestInterception(true)
          page.on('request', (req) => {
            const resourceType = req.resourceType()
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
              req.abort()
            } else {
              req.continue()
            }
          })
        }))
        
        // Scrape stocks concurrently
        const batchPromises = batch.map((symbol, index) => {
          const page = pages[index]
          if (!page) throw new Error(`No page available for ${symbol}`)
          return this.scrapeDetailedStockData(page, symbol)
        })
        
        const batchResults = await Promise.all(batchPromises)
        
        // Add successful results
        batchResults.forEach(stock => {
          if (stock) results.push(stock)
        })
        
      } finally {
        // Clean up pages
        await Promise.all(pages.map(page => page.close()))
      }
      
      // Small delay between batches to be respectful to the server
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    console.log(`✅ Detailed scraping completed. Successfully extracted ${results.length}/${symbols.length} stocks`)
    return results
  }
}

/**
 * Market-aware refresh interval calculator
 * Adjusts scraping frequency based on market conditions
 */
export class SmartRefreshManager {
  
  static getOptimalRefreshInterval(): number {
    const now = new Date()
    const skopjeTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Skopje"}))
    const hour = skopjeTime.getHours()
    const day = skopjeTime.getDay() // 0 = Sunday, 6 = Saturday
    
    // Weekend - very slow refresh
    if (day === 0 || day === 6) {
      return 15 * 60 * 1000 // 15 minutes
    }
    
    // Market hours (9 AM - 4 PM)
    if (hour >= 9 && hour < 16) {
      // Peak trading hours (10 AM - 2 PM)
      if (hour >= 10 && hour < 14) {
        return 15 * 1000 // 15 seconds - very frequent
      }
      // Regular market hours
      return 30 * 1000 // 30 seconds
    }
    
    // After hours - slower refresh
    return 5 * 60 * 1000 // 5 minutes
  }
  
  static shouldScrapeNow(): boolean {
    const now = new Date()
    const skopjeTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Skopje"}))
    const hour = skopjeTime.getHours()
    const day = skopjeTime.getDay()
    
    // Always allow scraping during market hours
    if (day >= 1 && day <= 5 && hour >= 9 && hour < 16) {
      return true
    }
    
    // During off-hours, only scrape occasionally
    return Math.random() < 0.1 // 10% chance during off-hours
  }
}

/**
 * Advanced caching strategy with different TTLs based on stock activity
 */
export class IntelligentCache {
  
  private static getStockActivity(symbol: string): 'hot' | 'warm' | 'cold' {
    // Classify stocks based on typical trading activity (only real MSE-traded companies)
    const hotStocks = ['ALK', 'KMB', 'MPT'] // High activity - major companies
    const warmStocks = ['TEL', 'REPL'] // Medium activity
    // RZUS and others are classified as 'cold' (default)
    
    if (hotStocks.includes(symbol)) return 'hot'
    if (warmStocks.includes(symbol)) return 'warm'
    return 'cold'
  }
  
  static getCacheTTL(symbol: string): number {
    const activity = this.getStockActivity(symbol)
    
    switch (activity) {
      case 'hot': return 10 * 1000   // 10 seconds for active stocks
      case 'warm': return 30 * 1000  // 30 seconds for medium activity
      case 'cold': return 120 * 1000 // 2 minutes for low activity
    }
  }
  
  static shouldRefreshStock(symbol: string, lastUpdate: Date): boolean {
    const ttl = this.getCacheTTL(symbol)
    const age = Date.now() - lastUpdate.getTime()
    return age > ttl
  }
}