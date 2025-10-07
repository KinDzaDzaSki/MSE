#!/usr/bin/env tsx

import { DatabaseService } from './connection'
import { StockService, HistoricalDataService } from './services'

async function seedDatabase() {
  console.log('🌱 Starting database seeding...')
  
  try {
    // Test database connection
    const isConnected = await DatabaseService.testConnection()
    if (!isConnected) {
      console.error('❌ Database connection failed')
      process.exit(1)
    }

    console.log('✅ Database connection successful')

    // Create some sample historical data for testing
    console.log('📊 Creating sample historical data...')
    
    // Only companies actively traded on MSE (verified by live scraper)
    const sampleStocks = [
      { symbol: 'ALK', name: 'Alkaloid AD Skopje', price: 25901.8 },
      { symbol: 'KMB', name: 'Komercijalna Banka AD Skopje', price: 27191.56 },
      { symbol: 'MPT', name: 'Makpetrol AD Skopje', price: 116942.27 },
      { symbol: 'REPL', name: 'Replek AD Skopje', price: 16000 },
      { symbol: 'RZUS', name: 'RZUS AD', price: 45 },
      { symbol: 'TEL', name: 'Makedonski Telekom AD Skopje', price: 440 }
    ]

    // Insert sample stocks
    for (const stockData of sampleStocks) {
      try {
        const stock = await StockService.upsertStock({
          symbol: stockData.symbol,
          name: stockData.name,
          price: stockData.price.toString(),
          change: '0',
          changePercent: '0',
          volume: 1000,
          lastUpdated: new Date(),
          updatedAt: new Date()
        })
        
        console.log(`✅ Created/updated stock: ${stock.symbol}`)

        // Create some historical data points for the last 30 days
        const now = new Date()
        for (let i = 0; i < 30; i++) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
          const priceVariation = (Math.random() - 0.5) * 0.1 // ±5% variation
          const historicalPrice = stockData.price * (1 + priceVariation)
          
          const tradingDate = date.toISOString().split('T')[0]
          if (!tradingDate) {
            throw new Error('Failed to generate trading date')
          }
          
          await HistoricalDataService.addHistoricalPrice({
            stockId: stock.id,
            symbol: stock.symbol,
            price: historicalPrice.toString(),
            change: '0',
            changePercent: (priceVariation * 100).toString(),
            volume: Math.floor(Math.random() * 5000) + 500,
            timestamp: date,
            tradingDate,
            open: historicalPrice.toString(),
            high: (historicalPrice * 1.02).toString(),
            low: (historicalPrice * 0.98).toString(),
            close: historicalPrice.toString()
          })
        }
        
        console.log(`📈 Created 30 days of historical data for ${stock.symbol}`)
      } catch (error) {
        console.error(`❌ Error processing ${stockData.symbol}:`, error)
      }
    }

    console.log('🎉 Database seeding completed successfully!')
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error)
    process.exit(1)
  }
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('💥 Seeding script failed:', error)
      process.exit(1)
    })
}