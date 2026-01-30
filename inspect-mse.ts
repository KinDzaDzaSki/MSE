import puppeteer from 'puppeteer';

async function inspect() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    console.log('Navigating to https://www.mse.mk/en...');
    await page.goto('https://www.mse.mk/en', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const tableExists = await page.evaluate(() => {
        return !!document.querySelector('#topSymbolValueTopSymbols table');
    });
    console.log('Table exists:', tableExists);

    if (tableExists) {
        const tableHTML = await page.evaluate(() => {
            const table = document.querySelector('#topSymbolValueTopSymbols table');
            return table ? table.outerHTML.substring(0, 1000) : 'Table not found';
        });
        console.log('Table HTML (first 1000 chars):');
        console.log(tableHTML);

        const rowData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#topSymbolValueTopSymbols table tr')).slice(0, 3);
            return rows.map(r => Array.from(r.querySelectorAll('td, th')).map(c => c.textContent?.trim()));
        });
        console.log('Row Data (first 3 rows):');
        console.log(JSON.stringify(rowData, null, 2));
    } else {
        console.log('Available IDs:');
        const ids = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[id]')).map(el => el.id).filter(id => id.includes('Symbol') || id.includes('Top'));
        });
        console.log(ids);
    }

    await browser.close();
}

inspect().catch(console.error);
