import { db } from './connection'
import { stocks, historicalPrices, marketIndices, scrapingLogs } from './schema'
import type { Stock, NewStock, HistoricalPrice, NewHistoricalPrice, MarketIndex, NewMarketIndex, ScrapingLog, NewScrapingLog } from './schema'
import { eq, desc, and, gte, lte, sql, inArray } from 'drizzle-orm'
import type { Stock as AppStock } from '../types'

export class StockService {

  // Upsert stock data (insert or update if exists)
  static async upsertStock(stockData: Omit<NewStock, 'id' | 'createdAt'>): Promise<Stock> {
    try {
      const existingStock = await db
        .select()
        .from(stocks)
        .where(eq(stocks.symbol, stockData.symbol))
        .limit(1)

      if (existingStock.length > 0) {
        // Update existing stock
        const updated = await db
          .update(stocks)
          .set({
            ...stockData,
            updatedAt: new Date(),
          })
          .where(eq(stocks.symbol, stockData.symbol))
          .returning()

        if (!updated[0]) throw new Error('Failed to update stock')
        return updated[0]
      } else {
        // Insert new stock
        const inserted = await db
          .insert(stocks)
          .values(stockData)
          .returning()

        if (!inserted[0]) throw new Error('Failed to insert stock')
        return inserted[0]
      }
    } catch (error) {
      console.error('Error upserting stock:', error)
      throw error
    }
  }

  // Get all active stocks
  static async getAllStocks(): Promise<Stock[]> {
    try {
      return await db
        .select()
        .from(stocks)
        .where(eq(stocks.isActive, true))
        .orderBy(stocks.symbol)
    } catch (error) {
      console.error('Error getting all stocks:', error)
      throw error
    }
  }

  // Get stock by symbol
  static async getStockBySymbol(symbol: string): Promise<Stock | null> {
    try {
      const result = await db
        .select()
        .from(stocks)
        .where(and(eq(stocks.symbol, symbol), eq(stocks.isActive, true)))
        .limit(1)

      return result[0] || null
    } catch (error) {
      console.error(`Error getting stock ${symbol}:`, error)
      throw error
    }
  }

  // Bulk upsert stocks (efficient for scraper)
  static async bulkUpsertStocks(stocksData: Array<Omit<NewStock, 'id' | 'createdAt'>>): Promise<Stock[]> {
    try {
      const results: Stock[] = []

      // Process in batches to avoid overwhelming the database
      const batchSize = 10
      for (let i = 0; i < stocksData.length; i += batchSize) {
        const batch = stocksData.slice(i, i + batchSize)

        for (const stockData of batch) {
          const result = await this.upsertStock(stockData)
          results.push(result)
        }
      }

      return results
    } catch (error) {
      console.error('Error bulk upserting stocks:', error)
      throw error
    }
  }

  // Convert app stock format to database format
  static appStockToDbStock(appStock: AppStock): Omit<NewStock, 'id' | 'createdAt'> {
    return {
      symbol: appStock.symbol,
      name: appStock.name,
      price: appStock.price.toString(),
      change: appStock.change.toString(),
      changePercent: appStock.changePercent.toString(),
      volume: appStock.volume,
      instrumentType: appStock.instrumentType,
      lastUpdated: new Date(appStock.lastUpdated),
      updatedAt: new Date(),
    }
  }

  // Convert database stock to app format
  static dbStockToAppStock(dbStock: Stock): AppStock {
    return {
      id: dbStock.symbol,
      symbol: dbStock.symbol,
      name: dbStock.name,
      price: parseFloat(dbStock.price),
      change: parseFloat(dbStock.change),
      changePercent: parseFloat(dbStock.changePercent),
      volume: dbStock.volume,
      instrumentType: dbStock.instrumentType as 'stock' | 'bond',
      lastUpdated: dbStock.lastUpdated.toISOString(),
    }
  }
}

export class HistoricalDataService {

  // Add historical price entry
  static async addHistoricalPrice(data: Omit<NewHistoricalPrice, 'id' | 'createdAt'>): Promise<HistoricalPrice> {
    try {
      const inserted = await db
        .insert(historicalPrices)
        .values(data)
        .returning()

      if (!inserted[0]) throw new Error('Failed to insert historical price')
      return inserted[0]
    } catch (error) {
      console.error('Error adding historical price:', error)
      throw error
    }
  }

  // Bulk insert historical prices
  static async bulkAddHistoricalPrices(data: Array<Omit<NewHistoricalPrice, 'id' | 'createdAt'>>): Promise<void> {
    try {
      if (data.length === 0) return

      await db
        .insert(historicalPrices)
        .values(data)
    } catch (error) {
      console.error('Error bulk adding historical prices:', error)
      throw error
    }
  }

  // Get historical prices for a stock within date range
  static async getHistoricalPrices(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<HistoricalPrice[]> {
    try {
      return await db
        .select()
        .from(historicalPrices)
        .where(
          and(
            eq(historicalPrices.symbol, symbol),
            gte(historicalPrices.timestamp, startDate),
            lte(historicalPrices.timestamp, endDate)
          )
        )
        .orderBy(historicalPrices.timestamp)
    } catch (error) {
      console.error(`Error getting historical prices for ${symbol}:`, error)
      throw error
    }
  }

  // Get latest price for each stock (for current stock data)
  static async getLatestPrices(symbols?: string[]): Promise<HistoricalPrice[]> {
    try {
      const query = db
        .select()
        .from(historicalPrices)
        .where(
          symbols ? inArray(historicalPrices.symbol, symbols) : undefined
        )
        .orderBy(desc(historicalPrices.timestamp))

      return await query
    } catch (error) {
      console.error('Error getting latest prices:', error)
      throw error
    }
  }

  // Create historical entry from current stock data
  static async createHistoricalEntryFromStock(stock: Stock): Promise<HistoricalPrice> {
    const now = new Date()
    const tradingDate = now.toISOString().split('T')[0] // YYYY-MM-DD

    if (!tradingDate) {
      throw new Error('Failed to generate trading date')
    }

    const historicalData: Omit<NewHistoricalPrice, 'id' | 'createdAt'> = {
      stockId: stock.id,
      symbol: stock.symbol,
      price: stock.price,
      change: stock.change,
      changePercent: stock.changePercent,
      volume: stock.volume,
      instrumentType: stock.instrumentType,
      timestamp: stock.lastUpdated,
      tradingDate,
      // For now, set OHLC to the current price (would need intraday data for real OHLC)
      open: stock.price,
      high: stock.price,
      low: stock.price,
      close: stock.price,
    }

    return await this.addHistoricalPrice(historicalData)
  }
}

export class MarketIndexService {

  // Upsert market index
  static async upsertMarketIndex(indexData: Omit<NewMarketIndex, 'id' | 'createdAt'>): Promise<MarketIndex> {
    try {
      const tradingDate = indexData.tradingDate
      const existingIndex = await db
        .select()
        .from(marketIndices)
        .where(
          and(
            eq(marketIndices.name, indexData.name),
            eq(marketIndices.tradingDate, tradingDate)
          )
        )
        .limit(1)

      if (existingIndex.length > 0) {
        // Update existing index
        const updated = await db
          .update(marketIndices)
          .set({
            ...indexData,
            lastUpdated: new Date(),
          })
          .where(eq(marketIndices.id, existingIndex[0]!.id))
          .returning()

        if (!updated[0]) throw new Error('Failed to update market index')
        return updated[0]
      } else {
        // Insert new index
        const inserted = await db
          .insert(marketIndices)
          .values(indexData)
          .returning()

        if (!inserted[0]) throw new Error('Failed to insert market index')
        return inserted[0]
      }
    } catch (error) {
      console.error('Error upserting market index:', error)
      throw error
    }
  }

  // Get latest market indices
  static async getLatestIndices(): Promise<MarketIndex[]> {
    try {
      return await db
        .select()
        .from(marketIndices)
        .orderBy(desc(marketIndices.timestamp))
        .limit(10)
    } catch (error) {
      console.error('Error getting latest market indices:', error)
      throw error
    }
  }
}

export class ScrapingLogService {

  // Log scraping operation
  static async logScrapingOperation(logData: Omit<NewScrapingLog, 'id' | 'createdAt' | 'timestamp'>): Promise<ScrapingLog> {
    try {
      const inserted = await db
        .insert(scrapingLogs)
        .values(logData)
        .returning()

      if (!inserted[0]) throw new Error('Failed to insert scraping log')
      return inserted[0]
    } catch (error) {
      console.error('Error logging scraping operation:', error)
      throw error
    }
  }

  // Get recent scraping logs
  static async getRecentLogs(limit: number = 50): Promise<ScrapingLog[]> {
    try {
      return await db
        .select()
        .from(scrapingLogs)
        .orderBy(desc(scrapingLogs.timestamp))
        .limit(limit)
    } catch (error) {
      console.error('Error getting scraping logs:', error)
      throw error
    }
  }

  // Get scraping statistics
  static async getScrapingStats() {
    try {
      const stats = await db
        .select({
          totalRuns: sql<number>`count(*)`,
          successfulRuns: sql<number>`sum(case when status = 'success' then 1 else 0 end)`,
          errorRuns: sql<number>`sum(case when status = 'error' then 1 else 0 end)`,
          avgDuration: sql<number>`avg(duration)`,
          lastRun: sql<Date>`max(timestamp)`,
        })
        .from(scrapingLogs)

      return stats[0] || null
    } catch (error) {
      console.error('Error getting scraping stats:', error)
      throw error
    }
  }
}