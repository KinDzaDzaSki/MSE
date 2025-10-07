import { pgTable, text, decimal, integer, timestamp, boolean, varchar, serial, index } from 'drizzle-orm/pg-core'

// Stocks table - stores current stock information
export const stocks = pgTable('stocks', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull().unique(),
  name: text('name').notNull(),
  price: decimal('price', { precision: 15, scale: 2 }).notNull(),
  change: decimal('change', { precision: 15, scale: 2 }).notNull().default('0'),
  changePercent: decimal('change_percent', { precision: 8, scale: 4 }).notNull().default('0'),
  volume: integer('volume').notNull().default(0),
  marketCap: decimal('market_cap', { precision: 20, scale: 2 }),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  symbolIdx: index('symbol_idx').on(table.symbol),
  lastUpdatedIdx: index('last_updated_idx').on(table.lastUpdated),
}))

// Historical prices table - stores price history for charts and analysis
export const historicalPrices = pgTable('historical_prices', {
  id: serial('id').primaryKey(),
  stockId: integer('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  symbol: varchar('symbol', { length: 10 }).notNull(), // Denormalized for faster queries
  price: decimal('price', { precision: 15, scale: 2 }).notNull(),
  change: decimal('change', { precision: 15, scale: 2 }).notNull().default('0'),
  changePercent: decimal('change_percent', { precision: 8, scale: 4 }).notNull().default('0'),
  volume: integer('volume').notNull().default(0),
  high: decimal('high', { precision: 15, scale: 2 }),
  low: decimal('low', { precision: 15, scale: 2 }),
  open: decimal('open', { precision: 15, scale: 2 }),
  close: decimal('close', { precision: 15, scale: 2 }),
  timestamp: timestamp('timestamp').notNull(),
  tradingDate: varchar('trading_date', { length: 10 }).notNull(), // YYYY-MM-DD format
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  stockIdIdx: index('stock_id_idx').on(table.stockId),
  symbolIdx: index('hist_symbol_idx').on(table.symbol),
  timestampIdx: index('timestamp_idx').on(table.timestamp),
  tradingDateIdx: index('trading_date_idx').on(table.tradingDate),
  symbolDateIdx: index('symbol_date_idx').on(table.symbol, table.tradingDate),
}))

// Market indices table - stores market index data (MBI10, etc.)
export const marketIndices = pgTable('market_indices', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(), // MBI10, MBI10-TR, etc.
  value: decimal('value', { precision: 15, scale: 2 }).notNull(),
  change: decimal('change', { precision: 15, scale: 2 }).notNull().default('0'),
  changePercent: decimal('change_percent', { precision: 8, scale: 4 }).notNull().default('0'),
  timestamp: timestamp('timestamp').notNull(),
  tradingDate: varchar('trading_date', { length: 10 }).notNull(),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: index('index_name_idx').on(table.name),
  timestampIdx: index('index_timestamp_idx').on(table.timestamp),
  nameTimestampIdx: index('index_name_timestamp_idx').on(table.name, table.timestamp),
}))

// Scraping logs table - tracks scraping operations for monitoring
export const scrapingLogs = pgTable('scraping_logs', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 20 }).notNull(), // 'success', 'error', 'partial'
  stocksCount: integer('stocks_count').notNull().default(0),
  indicesCount: integer('indices_count').notNull().default(0),
  errors: text('errors'), // JSON string of error messages
  duration: integer('duration'), // Duration in milliseconds
  source: varchar('source', { length: 100 }).notNull().default('mse.mk'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('scraping_status_idx').on(table.status),
  timestampIdx: index('scraping_timestamp_idx').on(table.timestamp),
}))

// Types for TypeScript
export type Stock = typeof stocks.$inferSelect
export type NewStock = typeof stocks.$inferInsert

export type HistoricalPrice = typeof historicalPrices.$inferSelect
export type NewHistoricalPrice = typeof historicalPrices.$inferInsert

export type MarketIndex = typeof marketIndices.$inferSelect
export type NewMarketIndex = typeof marketIndices.$inferInsert

export type ScrapingLog = typeof scrapingLogs.$inferSelect
export type NewScrapingLog = typeof scrapingLogs.$inferInsert