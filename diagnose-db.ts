import { DatabaseService } from './src/lib/db/connection';
import { StockService, ScrapingLogService } from './src/lib/db/services';

async function diagnose() {
    console.log('--- Database Diagnostics ---');

    const dbConnected = await DatabaseService.testConnection();
    console.log('Database Connected:', dbConnected);

    if (!dbConnected) return;

    const stocks = await StockService.getAllStocks();
    console.log('Total stocks in DB:', stocks.length);

    if (stocks.length > 0) {
        console.log('Sample Stocks (Top 5):');
        stocks.slice(0, 5).forEach(s => {
            console.log(`${s.symbol}: ${s.price} (Updated: ${s.updatedAt})`);
        });
    }

    const logs = await ScrapingLogService.getRecentLogs(10);
    console.log('\n--- Recent Scraping Logs ---');
    logs.forEach(log => {
        console.log(`[${log.timestamp.toISOString()}] Status: ${log.status}, Stocks: ${log.stocksCount}, Errors: ${log.errors ? 'Yes' : 'No'}`);
        if (log.errors) console.log('  Errors:', log.errors);
    });
}

diagnose().catch(console.error);
