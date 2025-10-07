import { MSEScraper } from './src/lib/scraper.js'

async function testScraper() {
  console.log('Testing MSE Scraper...')
  
  const scraper = new MSEScraper()
  
  try {
    console.log('Initializing scraper...')
    await scraper.initialize()
    
    console.log('Scraping stocks...')
    const result = await scraper.scrapeStocks()
    
    console.log('Scraping result:')
    console.log(`- Found ${result.stocks.length} stocks`)
    console.log(`- Timestamp: ${result.timestamp}`)
    console.log(`- Source: ${result.source}`)
    console.log(`- Errors: ${result.errors?.length || 0}`)
    
    if (result.errors && result.errors.length > 0) {
      console.log('Errors:')
      result.errors.forEach(error => console.log(`  - ${error}`))
    }
    
    if (result.stocks.length > 0) {
      console.log('\nFirst few stocks:')
      result.stocks.slice(0, 5).forEach(stock => {
        console.log(`  ${stock.symbol}: ${stock.price} ден. (${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent}%)`)
      })
    }
    
  } catch (error) {
    console.error('Error testing scraper:', error)
  } finally {
    await scraper.close()
  }
}

testScraper().catch(console.error)