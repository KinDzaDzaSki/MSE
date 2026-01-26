import puppeteer from 'puppeteer';

async function testScraper() {
  console.log('🧪 Testing MSE Scraper directly...');
  
  let browser = null;
  
  try {
    console.log('📍 Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ]
    });
    
    console.log('✅ Browser launched successfully');
    
    const page = await browser.newPage();
    console.log('📄 Created new page');
    
    console.log('🌐 Navigating to https://www.mse.mk/en...');
    const startNav = Date.now();
    
    try {
      await Promise.race([
        page.goto('https://www.mse.mk/en', {
          waitUntil: 'networkidle2',
          timeout: 30000
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Navigation timeout')), 35000)
        )
      ]);
      
      const navTime = Date.now() - startNav;
      console.log(`✅ Navigation successful in ${navTime}ms`);
      
      console.log('🔍 Waiting for body element...');
      await page.waitForSelector('body', { timeout: 10000 });
      console.log('✅ Body element found');
      
      console.log('⏱️ Waiting 2 seconds for content...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('📊 Extracting stock links...');
      const rawStocks = await page.evaluate(() => {
        const stockData = [];
        const stockLinks = Array.from(document.querySelectorAll('a[href*="/symbol/"]'));
        console.log(`Found ${stockLinks.length} stock links`);
        
        for (const link of stockLinks) {
          const href = link.getAttribute('href') || '';
          const symbolMatch = href.match(/\/symbol\/([A-Z0-9]+)/);
          
          if (symbolMatch) {
            const symbol = symbolMatch[1];
            const linkText = link.textContent?.trim() || '';
            
            // Parse price
            const parts = linkText.split(/\s+/);
            if (parts.length >= 2) {
              const priceText = parts[1] || '';
              const changeText = parts[2] + (parts[3] || '');
              
              let price = 0;
              if (priceText.includes(',')) {
                price = parseFloat(priceText.replace(',', ''));
              } else {
                price = parseFloat(priceText);
              }
              
              let changePercent = 0;
              const changeMatch = changeText.match(/([+-]?\d+[.,]?\d*)%?/);
              if (changeMatch && changeMatch[1]) {
                changePercent = parseFloat(changeMatch[1].replace(',', '.'));
              }
              
              if (price > 0 && !isNaN(price)) {
                stockData.push({
                  symbol,
                  price,
                  changePercent
                });
              }
            }
          }
        }
        
        return stockData;
      });
      
      console.log(`\n✅ SUCCESS! Found ${rawStocks.length} stocks from MSE`);
      console.log('\n📊 First 10 stocks:');
      rawStocks.slice(0, 10).forEach(stock => {
        console.log(`  ${stock.symbol}: ${stock.price.toFixed(2)} MKD (${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%)`);
      });
      
    } catch (navError) {
      console.error('❌ Navigation/scraping failed:', navError.message);
      console.log('\n📋 This is the actual problem:');
      console.log('- Cannot connect to MSE website');
      console.log('- OR MSE website blocks Puppeteer/headless browsers');
      console.log('- OR Network connectivity issue');
    }
    
    await page.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n✨ Test complete');
  }
}

testScraper().catch(console.error);
