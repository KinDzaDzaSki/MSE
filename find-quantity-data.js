const puppeteer = require('puppeteer');

// Test data from user
const expectedVolumes = {
  'RZUS': 700,
  'KMB': 280,  
  'TEL': 131,
  'ALK': 46,
  'MPT': 33,
  'REPL': 20
};

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Test ALK (expected volume: 46) and RZUS (expected volume: 700)
  const testStocks = ['ALK', 'RZUS'];
  
  for (const symbol of testStocks) {
    const page = await browser.newPage();
    
    try {
      console.log(`\n📊 Testing ${symbol} (expected volume: ${expectedVolumes[symbol]})...`);
      await page.goto(`https://www.mse.mk/en/symbol/${symbol}`, { 
        waitUntil: 'networkidle2',
        timeout: 15000
      });
      
      const volumeData = await page.evaluate((expectedVol) => {
        const allText = document.body.textContent || '';
        
        // Look for the exact expected volume number
        const expectedRegex = new RegExp(`\\b${expectedVol}\\b`, 'g');
        const expectedMatches = [...allText.matchAll(expectedRegex)];
        
        // Look for "Količina" (quantity in Macedonian) patterns
        const quantityPatterns = [
          /količina[:\s]*([0-9,\.]+)/gi,
          /quantity[:\s]*([0-9,\.]+)/gi,
          /кількість[:\s]*([0-9,\.]+)/gi, // Ukrainian spelling
          /amount[:\s]*([0-9,\.]+)/gi,
          /volume[:\s]*([0-9,\.]+)/gi
        ];
        
        const quantityMatches = [];
        quantityPatterns.forEach(pattern => {
          const matches = [...allText.matchAll(pattern)];
          matches.forEach(match => {
            quantityMatches.push({
              pattern: pattern.source,
              fullMatch: match[0],
              value: match[1],
              context: allText.substring(match.index - 100, match.index + 100)
            });
          });
        });
        
        // Look for tables that might contain trading data
        const tables = Array.from(document.querySelectorAll('table'));
        const tableData = tables.map((table, index) => {
          const tableText = table.innerText;
          const hasExpected = tableText.includes(expectedVol.toString());
          return {
            tableIndex: index,
            hasExpectedVolume: hasExpected,
            text: tableText.slice(0, 500), // First 500 chars
            fullText: hasExpected ? tableText : null // Full text only if it contains expected volume
          };
        });
        
        // Look for specific trading sections
        const lines = allText.split('\n');
        const relevantLines = lines.filter(line => 
          line.includes(expectedVol.toString()) ||
          line.toLowerCase().includes('količina') ||
          line.toLowerCase().includes('quantity') ||
          line.toLowerCase().includes('volume')
        );
        
        return {
          expectedMatches: expectedMatches.map(m => ({
            match: m[0],
            index: m.index,
            context: allText.substring(m.index - 50, m.index + 50)
          })),
          quantityMatches,
          tableData: tableData.filter(t => t.hasExpectedVolume || t.text.toLowerCase().includes('količina')),
          relevantLines,
          pageLength: allText.length
        };
      }, expectedVolumes[symbol]);
      
      console.log(`🔍 Expected volume ${expectedVolumes[symbol]} found in these contexts:`);
      volumeData.expectedMatches.forEach((match, index) => {
        console.log(`  ${index + 1}. Context: "...${match.context}..."`);
      });
      
      console.log(`\n📊 Quantity pattern matches:`);
      volumeData.quantityMatches.forEach((match, index) => {
        console.log(`  ${index + 1}. Pattern: ${match.pattern}`);
        console.log(`     Match: "${match.fullMatch}"`);
        console.log(`     Value: "${match.value}"`);
        console.log(`     Context: "...${match.context.trim()}..."`);
        console.log('     ---');
      });
      
      console.log(`\n📋 Tables containing expected volume or quantity:`);
      volumeData.tableData.forEach((table, index) => {
        console.log(`  Table ${table.tableIndex}:`);
        if (table.fullText) {
          console.log(`     Full text: ${table.fullText}`);
        } else {
          console.log(`     Preview: ${table.text}`);
        }
        console.log('     ---');
      });
      
      console.log(`\n📄 Relevant lines:`);
      volumeData.relevantLines.forEach((line, index) => {
        console.log(`  ${index + 1}. "${line.trim()}"`);
      });
      
    } catch (error) {
      console.error(`❌ Error testing ${symbol}:`, error.message);
    } finally {
      await page.close();
    }
  }
  
  await browser.close();
})();