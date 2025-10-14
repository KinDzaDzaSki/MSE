const { MSEScraper } = require('./src/lib/scraper.js');

(async () => {
  const scraper = new MSEScraper();
  try {
    console.log('🔄 Testing MSE homepage scraping...');
    const result = await scraper.scrapeStocks();
    console.log(`✅ Scraped ${result.stocks.length} stocks from MSE homepage:`);
    
    result.stocks.forEach(stock => {
      console.log(`${stock.symbol}: ${stock.price} MKD (${stock.changePercent}%) vol:${stock.volume}`);
    });
    
    // Analyze the data
    const gainers = result.stocks.filter(s => s.changePercent > 0);
    const losers = result.stocks.filter(s => s.changePercent < 0);
    const unchanged = result.stocks.filter(s => s.changePercent === 0);
    
    console.log('\n📊 Analysis:');
    console.log(`Total traded: ${result.stocks.length}`);
    console.log(`Gainers: ${gainers.length}`);
    console.log(`Losers: ${losers.length}`);
    console.log(`Unchanged: ${unchanged.length}`);
    
  } catch (error) {
    console.error('❌ Scraping error:', error.message);
  } finally {
    await scraper.close();
  }
})();