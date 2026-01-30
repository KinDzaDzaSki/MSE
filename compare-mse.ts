import puppeteer from 'puppeteer';

async function inspect() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const urls = [
        'https://www.mse.mk/en',
        'https://www.mse.mk/mk'
    ];

    for (const url of urls) {
        console.log(`\n--- Inspecting ${url} ---`);
        await page.goto(url, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));

        const rowData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#topSymbolValueTopSymbols table tr')).slice(0, 3);
            return rows.map(r => Array.from(r.querySelectorAll('td, th')).map(c => c.textContent?.trim()));
        });
        console.log(`Row Data:`);
        console.log(JSON.stringify(rowData, null, 2));
    }

    await browser.close();
}

inspect().catch(console.error);
