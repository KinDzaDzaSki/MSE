const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,  // Show browser for debugging
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('📊 Loading MSE ALK page...');
    await page.goto('https://www.mse.mk/en/symbol/ALK', { 
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    
    // Get page content and look for volume/quantity data
    const pageData = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      // Look for patterns that might contain trading volume
      const volumePatterns = [
        /volume[:\s]+([0-9,\.]+)/gi,
        /količina[:\s]+([0-9,\.]+)/gi,
        /quantity[:\s]+([0-9,\.]+)/gi,
        /promet[:\s]+([0-9,\.]+)/gi,
        /turnover[:\s]+([0-9,\.]+)/gi,
        /last.{0,10}quantity[:\s]+([0-9,\.]+)/gi,
        /last.{0,10}volume[:\s]+([0-9,\.]+)/gi,
        /trading.{0,10}volume[:\s]+([0-9,\.]+)/gi,
        /shares.{0,10}traded[:\s]+([0-9,\.]+)/gi
      ];
      
      const foundPatterns = [];
      
      volumePatterns.forEach((pattern, index) => {
        const matches = [...bodyText.matchAll(pattern)];
        if (matches.length > 0) {
          matches.forEach(match => {
            foundPatterns.push({
              pattern: pattern.source,
              match: match[0],
              value: match[1]
            });
          });
        }
      });
      
      // Also get all table data that might contain volume
      const tables = Array.from(document.querySelectorAll('table'));
      const tableData = tables.map((table, index) => ({
        tableIndex: index,
        text: table.innerText
      }));
      
      return {
        foundPatterns,
        tableData,
        fullText: bodyText.slice(0, 2000) // First 2000 chars for debugging
      };
    });
    
    console.log('🔍 Found volume patterns:');
    pageData.foundPatterns.forEach(p => {
      console.log(`  Pattern: ${p.pattern}`);
      console.log(`  Match: ${p.match}`);
      console.log(`  Value: ${p.value}`);
      console.log('  ---');
    });
    
    console.log('\n📊 Table data:');
    pageData.tableData.forEach((table, index) => {
      console.log(`Table ${index}:`);
      console.log(table.text.slice(0, 500));
      console.log('---');
    });
    
    console.log('\n📄 Page sample text:');
    console.log(pageData.fullText);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
})();