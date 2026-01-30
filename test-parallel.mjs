import puppeteer from 'puppeteer';

async function testParallelEnhancement() {
    console.log('🧪 Testing Parallel Enhancement Logic...');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const symbols = ['ALK', 'KMB', 'TNB']; // Test with 3 symbols
        console.log(`🚀 Processing symbols: ${symbols.join(', ')}`);

        const start = Date.now();

        // Simulate the parallel processing logic from scraper.ts
        const results = await Promise.all(symbols.map(async (symbol) => {
            const page = await browser.newPage();
            try {
                console.log(`🔍 Visiting ${symbol}...`);
                await page.goto(`https://www.mse.mk/en/symbol/${symbol}`, {
                    waitUntil: 'domcontentloaded',
                    timeout: 20000
                });

                const volume = await page.evaluate(() => {
                    const element = document.querySelector('.volume, .trading-volume, .turnover');
                    return element ? element.textContent.trim() : 'N/A';
                });

                console.log(`✅ ${symbol} volume found: ${volume}`);
                return { symbol, volume };
            } catch (err) {
                console.warn(`⚠️ Failed ${symbol}:`, err.message);
                return { symbol, error: err.message };
            } finally {
                await page.close();
            }
        }));

        const duration = Date.now() - start;
        console.log(`\n✨ Parallel processing took ${duration}ms`);
        console.log('Results:', JSON.stringify(results, null, 2));

    } finally {
        await browser.close();
    }
}

testParallelEnhancement().catch(console.error);
