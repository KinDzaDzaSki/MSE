const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('📊 Loading MSE ALK page...');
    await page.goto('https://www.mse.mk/en/symbol/ALK', { 
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    
    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Look specifically for trading data tables
    const tradingData = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      // Look for today's trading section
      const todaySection = bodyText.match(/today[\s\S]*?volume[\s\S]*?(\d+[,\d]*)/i);
      if (todaySection) {
        console.log('Found today section:', todaySection[0]);
      }
      
      // Look for all volume mentions with more context
      const volumeMatches = [];
      const lines = bodyText.split('\n');
      
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes('volume') && /\d/.test(line)) {
          volumeMatches.push({
            line: line.trim(),
            lineNumber: index,
            context: lines.slice(Math.max(0, index-2), index+3).join(' | ')
          });
        }
      });
      
      // Look specifically for trading data - check if there's a trading section
      const tradingSection = lines.find(line => 
        line.toLowerCase().includes('trading') || 
        line.toLowerCase().includes('transaction') ||
        line.toLowerCase().includes('volume')
      );
      
      return {
        volumeMatches,
        tradingSection,
        todaySection: todaySection ? todaySection[0] : null,
        // Get all numeric data that might be volume
        allNumbers: [...bodyText.matchAll(/(\d{1,3}(?:,\d{3})*)/g)].map(m => m[1])
      };
    });
    
    console.log('\n🔍 Volume matches with context:');
    tradingData.volumeMatches.forEach((match, index) => {
      console.log(`${index + 1}. Line: "${match.line}"`);
      console.log(`   Context: ${match.context}`);
      console.log('   ---');
    });
    
    console.log('\n📊 Trading section:', tradingData.tradingSection);
    console.log('\n📅 Today section:', tradingData.todaySection);
    
    console.log('\n🔢 All numbers found:', tradingData.allNumbers.slice(0, 20)); // First 20 numbers
    
    // Take a screenshot for visual reference
    await page.screenshot({ path: 'mse-alk-page.png', fullPage: true });
    console.log('\n📸 Screenshot saved as mse-alk-page.png');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
})();