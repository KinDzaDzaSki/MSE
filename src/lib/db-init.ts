// Database initialization script for MSE Stock Tracker
// This script runs once when the server starts to ensure database is ready

import { DatabaseService } from './db/connection'
import { StockService } from './db/services'
import { MSEScraper } from './scraper'

export async function initializeDatabase() {
  console.log('🔧 Initializing database...')
  
  try {
    // Test database connection
    const dbAvailable = await DatabaseService.testConnection()
    
    if (!dbAvailable) {
      console.log('📝 Database not configured - running in memory mode')
      return false
    }
    
    console.log('✅ Database connection successful')
    
    // Check if we have any stocks in the database
    const existingStocks = await StockService.getAllStocks()
    
    if (existingStocks.length === 0) {
      console.log('📊 Database is empty, performing initial data population...')
      
      try {
        // Try to scrape fresh data for initial population
        const scraper = new MSEScraper()
        const freshStocks = await scraper.getStocks()
        await scraper.close()
        
        if (freshStocks.length > 0) {
          // Convert and save to database
          const dbStocks = freshStocks.map((stock: any) => StockService.appStockToDbStock(stock))
          await StockService.bulkUpsertStocks(dbStocks)
          console.log(`✅ Populated database with ${freshStocks.length} stocks from MSE`)
        } else {
          // No fallback to mock data - database remains empty until real data is available
          console.log(`⚠️ No real stock data available from MSE for initial population`)
        }
      } catch (scrapingError) {
        console.warn('⚠️ Initial scraping failed:', scrapingError)
        
        // No fallback to mock data - database remains empty until real data is available
        console.log(`⚠️ Database initialization skipped - waiting for real MSE data`)
      }
    } else {
      console.log(`📊 Database already contains ${existingStocks.length} stocks`)
    }
    
    return true
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    return false
  }
}

// Auto-initialize when this module is imported
if (typeof window === 'undefined') { // Server-side only
  initializeDatabase().catch(console.error)
}