#!/usr/bin/env node

/**
 * Generate realistic historical test data for MSE stocks
 * This script populates the database with 1 year of historical price data
 * for testing chart rendering and time range selection
 */

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const STOCKS = ['ALK', 'KMB', 'STB', 'GRNT', 'MPT', 'TETE', 'ADIN', 'RMDEN23', 'RMDEN24', 'STBP']

// Generate realistic price movements
function generateHistoricalPrices(symbol, currentPrice, days = 365) {
  const prices = []
  let price = currentPrice * 0.85 // Start price 15% lower
  const volatility = 0.01 // 1% daily volatility (reduced)
  const drift = (currentPrice - price) / days // Gradual drift to current price
  
  for (let i = days; i > 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(16, 0, 0, 0)
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) {
      continue
    }
    
    // Random walk with drift
    const randomChange = (Math.random() - 0.5) * volatility * 2
    price = price * (1 + randomChange + drift / days)
    
    // Keep price in reasonable bounds
    price = Math.max(0.01, Math.min(price, 100000))
    
    // Add some correlation to volume - higher volume on bigger moves
    const volume = Math.floor(
      Math.random() * 10000 + 
      5000 + 
      Math.abs(randomChange) * 50000
    )
    
    const previousPrice = price / (1 + randomChange)
    const change = price - previousPrice
    const changePercent = (change / previousPrice) * 100
    
    prices.push({
      symbol: symbol.toUpperCase(),
      date: date.toISOString(),
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(Math.max(-9999, Math.min(9999, change)).toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume,
    })
  }
  
  return prices
}

async function generateData() {
  const client = await pool.connect()
  
  try {
    console.log('🔄 Generating historical data for MSE stocks...')
    
    // Get current prices and IDs from database
    const result = await client.query(
      'SELECT id, symbol, price FROM stocks WHERE symbol = ANY($1)',
      [STOCKS]
    )
    
    const stockData = new Map(
      result.rows.map(row => [row.symbol, { id: row.id, price: row.price }])
    )
    
    console.log(`📊 Found ${stockData.size} stocks in database`)
    
    // Clear existing historical data
    await client.query(
      'DELETE FROM "historical_prices" WHERE symbol = ANY($1)',
      [STOCKS]
    )
    console.log('✅ Cleared existing historical data')
    
    // Generate and insert historical data
    let totalInserted = 0
    
    for (const [symbol, { id: stockId, price: currentPrice }] of stockData) {
      const prices = generateHistoricalPrices(symbol, currentPrice, 365)
      
      for (const priceData of prices) {
        try {
          await client.query(
            `INSERT INTO "historical_prices" 
             (stock_id, symbol, timestamp, price, change, "change_percent", volume, "trading_date") 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              stockId,
              priceData.symbol,
              priceData.date,
              priceData.price,
              priceData.change,
              priceData.changePercent,
              priceData.volume,
              priceData.date.split('T')[0], // YYYY-MM-DD
            ]
          )
          totalInserted++
        } catch (err) {
          // Skip duplicates
          if (!err.message.includes('duplicate')) {
            throw err
          }
        }
      }
      
      console.log(`📈 Generated ${prices.length} historical entries for ${symbol}`)
    }
    
    console.log(`✅ Generated ${totalInserted} total historical data points`)
    console.log('🎉 Historical data generation complete!')
    
  } catch (error) {
    console.error('❌ Error generating historical data:', error)
    throw error
  } finally {
    await client.end()
  }
}

generateData().catch(console.error).finally(() => process.exit(0))
