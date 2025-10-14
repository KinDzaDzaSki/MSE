const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('📊 Testing volume extraction for ALK...');
    await page.goto('https://www.mse.mk/en/symbol/ALK', { 
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    
    const volumeData = await page.evaluate(() => {
      const allText = document.body.textContent || '';
      
      // Test the exact patterns from the scraper
      const volumePatterns = [
        /volume[:\s]+([0-9,\.]+)/gi,  // Using global flag to find all matches
        /količina[:\s]+([0-9,\.]+)/gi,
        /promet[:\s]+([0-9,\.]+)/gi,
        /turnover[:\s]+([0-9,\.]+)/gi,
        /trading volume[:\s]+([0-9,\.]+)/gi,
        /last quantity[:\s]+([0-9,\.]+)/gi,
        /количина[:\s]+([0-9,\.]+)/gi
      ];
      
      const results = [];
      
      volumePatterns.forEach((pattern, patternIndex) => {
        // Find all matches for this pattern
        const matches = [...allText.matchAll(pattern)];
        matches.forEach((match, matchIndex) => {
          results.push({
            patternIndex,
            pattern: pattern.source,
            matchIndex,
            fullMatch: match[0],
            capturedValue: match[1],
            context: allText.substring(match.index - 50, match.index + 100)
          });
        });
      });
      
      // Also try to find the largest number that could be volume
      const allNumbers = [...allText.matchAll(/([0-9,]+)/g)];
      const largeNumbers = allNumbers
        .map(m => ({
          number: m[1],
          value: parseInt(m[1].replace(/,/g, ''))
        }))
        .filter(n => n.value > 100 && n.value < 1000000) // Reasonable volume range
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      
      return {
        results,
        largeNumbers,
        pageLength: allText.length
      };
    });
    
    console.log('\n🔍 Volume pattern matches:');
    volumeData.results.forEach((result, index) => {
      console.log(`${index + 1}. Pattern: ${result.pattern}`);
      console.log(`   Full match: "${result.fullMatch}"`);
      console.log(`   Value: "${result.capturedValue}"`);
      console.log(`   Context: "...${result.context}..."`);
      console.log('   ---');
    });
    
    console.log('\n📊 Largest numbers (potential volumes):');
    volumeData.largeNumbers.forEach((num, index) => {
      console.log(`${index + 1}. ${num.number} (${num.value})`);
    });
    
    console.log(`\n📄 Page text length: ${volumeData.pageLength} characters`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
})();