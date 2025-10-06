# Data Scraping Strategy
## MSE Website Analysis & Implementation Plan

### 1. MSE Website Analysis Results

#### 1.1 Website Structure Analysis

**Primary Data Sources:**
- **Main Page:** `https://www.mse.mk/en`
  - Live stock prices in table format
  - Market overview with basic statistics
  - Real-time updates during trading hours

- **Individual Stock Pages:** `https://www.mse.mk/en/symbol/{SYMBOL}`
  - Detailed company information
  - Historical price charts
  - Trading statistics and market data

- **Historical Data:** `https://www.mse.mk/en/stats/symbolhistory/{SYMBOL}`
  - Historical trading data
  - Downloadable CSV/Excel formats

- **Daily Reports:** `https://www.mse.mk/Repository/Reports/{YEAR}/{DATE}en.xls`
  - Excel files with daily trading summaries
  - Available for download

#### 1.2 Data Extraction Points

**Real-time Stock Data (Main Page):**
```html
<!-- Example structure found on mse.mk -->
<table class="table">
  <tr>
    <td><a href="/en/symbol/ALK">ALK</a></td>
    <td>25,919.83</td>
    <td class="positive">2.28%</td>
    <td>1,088,633</td>
  </tr>
</table>
```

**Market Index Data:**
```html
<div class="index-data">
  <span class="index-name">MBI10</span>
  <span class="index-value">10,318.14</span>
  <span class="index-change positive">0.60%</span>
</div>
```

**Stock Detail Information:**
- Company name and ISIN code
- Current trading statistics
- 52-week high/low data
- Market capitalization
- P/E ratios and financial metrics

### 2. Technical Implementation Strategy

#### 2.1 Scraping Technology Stack

**Primary Approach: Headless Browser (Puppeteer)**
```typescript
import puppeteer from 'puppeteer';

class MSEScraper {
  private browser: Browser | null = null;
  
  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
  }
  
  async scrapeMainPage(): Promise<StockData[]> {
    const page = await this.browser!.newPage();
    
    // Set user agent to appear as regular browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    
    await page.goto('https://www.mse.mk/en', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Extract stock data
    const stocks = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          return {
            symbol: cells[0]?.textContent?.trim(),
            price: parseFloat(cells[1]?.textContent?.replace(/,/g, '') || '0'),
            change: cells[2]?.textContent?.trim(),
            volume: parseInt(cells[3]?.textContent?.replace(/,/g, '') || '0')
          };
        }
        return null;
      }).filter(Boolean);
    });
    
    await page.close();
    return stocks;
  }
}
```

**Fallback Approach: HTTP + Cheerio**
```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';

class MSEHttpScraper {
  async scrapeWithHttp(): Promise<StockData[]> {
    try {
      const response = await axios.get('https://www.mse.mk/en', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      const stocks: StockData[] = [];
      
      $('table tr').each((index, element) => {
        const cells = $(element).find('td');
        if (cells.length >= 4) {
          stocks.push({
            symbol: $(cells[0]).text().trim(),
            price: parseFloat($(cells[1]).text().replace(/,/g, '')),
            change: $(cells[2]).text().trim(),
            volume: parseInt($(cells[3]).text().replace(/,/g, ''))
          });
        }
      });
      
      return stocks;
    } catch (error) {
      console.error('HTTP scraping failed:', error);
      throw error;
    }
  }
}
```

#### 2.2 Rate Limiting & Respectful Scraping

```typescript
class RateLimitedScraper {
  private lastRequest: number = 0;
  private minDelay: number = 2000; // 2 seconds between requests
  
  async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequest = Date.now();
  }
  
  async scrapeWithRateLimit(): Promise<StockData[]> {
    await this.waitForRateLimit();
    // Perform scraping...
  }
}
```

#### 2.3 Error Handling & Retry Logic

```typescript
class RobustScraper {
  async scrapeWithRetry(maxRetries: number = 3): Promise<StockData[]> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await this.scrapeMainPage();
        if (this.validateData(data)) {
          return data;
        }
        throw new Error('Invalid data received');
      } catch (error) {
        console.error(`Scraping attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('All scraping attempts failed');
  }
  
  private validateData(data: StockData[]): boolean {
    return data.length > 0 && 
           data.every(stock => 
             stock.symbol && 
             typeof stock.price === 'number' && 
             stock.price > 0
           );
  }
}
```

### 3. Data Processing & Validation

#### 3.1 Data Cleaning Pipeline

```typescript
class DataProcessor {
  processRawStockData(rawData: any[]): StockData[] {
    return rawData
      .filter(this.isValidStock)
      .map(this.cleanStockData)
      .filter(stock => stock !== null);
  }
  
  private isValidStock(data: any): boolean {
    return data &&
           typeof data.symbol === 'string' &&
           data.symbol.length > 0 &&
           data.price !== undefined;
  }
  
  private cleanStockData(data: any): StockData | null {
    try {
      const price = this.parsePrice(data.price);
      const change = this.parseChange(data.change);
      const volume = this.parseVolume(data.volume);
      
      return {
        symbol: data.symbol.toUpperCase().trim(),
        price: price,
        change: change.amount,
        changePercent: change.percent,
        volume: volume,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Failed to clean stock data:', error);
      return null;
    }
  }
  
  private parsePrice(priceStr: string): number {
    const cleaned = priceStr.replace(/[^0-9.,]/g, '').replace(/,/g, '');
    const price = parseFloat(cleaned);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price: ${priceStr}`);
    }
    return price;
  }
  
  private parseChange(changeStr: string): { amount: number; percent: number } {
    // Handle formats like "+2.28%" or "-1.50" or "2.28 %"
    const cleanStr = changeStr.replace(/\s/g, '');
    const percentMatch = cleanStr.match(/([-+]?\d+\.?\d*)%?/);
    
    if (!percentMatch) {
      return { amount: 0, percent: 0 };
    }
    
    const value = parseFloat(percentMatch[1]);
    if (changeStr.includes('%')) {
      return { amount: 0, percent: value }; // We'll calculate amount later
    } else {
      return { amount: value, percent: 0 }; // We'll calculate percent later
    }
  }
  
  private parseVolume(volumeStr: string): number {
    const cleaned = volumeStr.replace(/[^0-9]/g, '');
    return parseInt(cleaned) || 0;
  }
}
```

#### 3.2 Data Validation & Quality Checks

```typescript
class DataValidator {
  validateStockData(stocks: StockData[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if we have reasonable number of stocks
    if (stocks.length < 10) {
      errors.push(`Too few stocks found: ${stocks.length}`);
    }
    
    // Check for duplicate symbols
    const symbols = stocks.map(s => s.symbol);
    const duplicates = symbols.filter((symbol, index) => symbols.indexOf(symbol) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate symbols found: ${duplicates.join(', ')}`);
    }
    
    // Check individual stock data quality
    stocks.forEach(stock => {
      if (stock.price > 1000000) {
        warnings.push(`Unusually high price for ${stock.symbol}: ${stock.price}`);
      }
      
      if (Math.abs(stock.changePercent) > 20) {
        warnings.push(`Large price movement for ${stock.symbol}: ${stock.changePercent}%`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stockCount: stocks.length
    };
  }
}
```

### 4. Scheduling & Automation

#### 4.1 Vercel Cron Job Configuration

```typescript
// app/api/cron/scrape/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { MSEScraper } from '@/lib/scraper';
import { saveStockData } from '@/lib/database';

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const scraper = new MSEScraper();
    await scraper.initialize();
    
    const stocks = await scraper.scrapeMainPage();
    await saveStockData(stocks);
    
    return NextResponse.json({
      success: true,
      stockCount: stocks.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      { error: 'Scraping failed' },
      { status: 500 }
    );
  }
}
```

**Vercel cron configuration (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "*/30 8-16 * * 1-5"
    }
  ]
}
```

#### 4.2 Market Hours Detection

```typescript
class MarketScheduler {
  isMarketOpen(): boolean {
    const now = new Date();
    const macedonia = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Skopje',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short'
    });
    
    const localTime = macedonia.format(now);
    const parts = localTime.split(', ');
    const weekday = parts[0];
    const time = parts[1];
    
    // Market is closed on weekends
    if (weekday === 'Sat' || weekday === 'Sun') {
      return false;
    }
    
    // Market hours: 9:00 AM - 4:00 PM (Macedonia time)
    const [hours, minutes] = time.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;
    const marketOpen = 9 * 60; // 9:00 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    return currentMinutes >= marketOpen && currentMinutes <= marketClose;
  }
  
  getScrapingInterval(): number {
    return this.isMarketOpen() ? 30000 : 300000; // 30s vs 5min
  }
}
```

### 5. Legal & Ethical Considerations

#### 5.1 Robots.txt Compliance

```typescript
class RobotsChecker {
  async checkRobotsPermission(url: string): Promise<boolean> {
    try {
      const robotsUrl = new URL('/robots.txt', url).href;
      const response = await fetch(robotsUrl);
      const robotsTxt = await response.text();
      
      // Parse robots.txt and check if scraping is allowed
      return this.parseRobots(robotsTxt);
    } catch (error) {
      console.warn('Could not fetch robots.txt:', error);
      return true; // Assume allowed if robots.txt not accessible
    }
  }
  
  private parseRobots(robotsTxt: string): boolean {
    // Basic robots.txt parsing logic
    const lines = robotsTxt.split('\n');
    let userAgentSection = false;
    
    for (const line of lines) {
      if (line.startsWith('User-agent: *')) {
        userAgentSection = true;
      } else if (line.startsWith('User-agent:') && !line.includes('*')) {
        userAgentSection = false;
      } else if (userAgentSection && line.startsWith('Disallow:')) {
        const disallowed = line.split(':')[1].trim();
        if (disallowed === '/' || disallowed === '') {
          return false;
        }
      }
    }
    
    return true;
  }
}
```

#### 5.2 Fair Use Guidelines

**Our Approach:**
- **Respect rate limits:** Maximum 1 request per 2 seconds
- **Off-peak scraping:** Reduced frequency outside market hours
- **User-Agent identification:** Clear identification as automated scraper
- **No data redistribution:** Data used only for our application
- **Monitoring impact:** Track server response times and errors

### 6. Monitoring & Alerting

#### 6.1 Scraping Health Monitoring

```typescript
class ScrapingMonitor {
  private successRate: number = 0;
  private lastSuccessfulScrape: Date | null = null;
  
  async recordScrapeAttempt(success: boolean, dataQuality?: number): Promise<void> {
    const metrics = {
      timestamp: new Date(),
      success,
      dataQuality: dataQuality || 0,
      responseTime: 0 // Track this separately
    };
    
    // Store in monitoring database or send to monitoring service
    await this.logMetrics(metrics);
    
    // Alert if success rate drops below threshold
    if (this.successRate < 0.8) {
      await this.sendAlert('Low scraping success rate');
    }
    
    // Alert if no successful scrape in 10 minutes during market hours
    const marketScheduler = new MarketScheduler();
    if (marketScheduler.isMarketOpen() && 
        this.lastSuccessfulScrape && 
        Date.now() - this.lastSuccessfulScrape.getTime() > 600000) {
      await this.sendAlert('No successful scrape in 10 minutes');
    }
  }
  
  private async sendAlert(message: string): Promise<void> {
    // Send to monitoring service (e.g., Vercel, Discord webhook, email)
    console.error(`ALERT: ${message}`);
  }
}
```

### 7. Implementation Roadmap

#### Phase 1: Basic Scraping (Week 1)
- [ ] Set up Puppeteer-based scraper
- [ ] Implement main page data extraction
- [ ] Create data validation pipeline
- [ ] Test scraping reliability

#### Phase 2: Production Setup (Week 2)
- [ ] Configure Vercel cron jobs
- [ ] Implement error handling and retries
- [ ] Add monitoring and alerting
- [ ] Test scheduling during market hours

#### Phase 3: Enhanced Features (Week 3-4)
- [ ] Add individual stock page scraping
- [ ] Implement historical data collection
- [ ] Create data quality monitoring
- [ ] Optimize performance and reliability

#### Phase 4: Maintenance & Optimization
- [ ] Monitor for website changes
- [ ] Optimize scraping performance
- [ ] Add backup data sources
- [ ] Implement advanced error recovery

---

**Document Version:** 1.0  
**Last Updated:** October 6, 2025  
**Next Review:** October 13, 2025