export interface Stock {
  id: string
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  lastUpdated: string
}

export interface StockDetail extends Stock {
  isin?: string
  sector?: string
  website?: string
  high52w?: number
  low52w?: number
  pe?: number
  pb?: number
  description?: string
}

export interface PricePoint {
  timestamp: string
  price: number
  volume?: number
}

export interface MarketIndex {
  name: string
  value: number
  change: number
  changePercent: number
  lastUpdated: string
}

export interface MarketSummary {
  totalStocks: number
  gainers: number
  losers: number
  unchanged: number
  totalVolume: number
  marketCap: number
}

export interface MarketOverview {
  indices: MarketIndex[]
  topGainers: Stock[]
  topLosers: Stock[]
  mostActive: Stock[]
  summary: MarketSummary
  lastUpdated: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  lastUpdated?: string
}

export interface ScrapingResult {
  stocks: Stock[]
  timestamp: string
  source: string
  errors?: string[]
}

export type MarketStatus = 'open' | 'closed' | 'pre-market' | 'after-hours'

export interface AppState {
  stocks: Stock[]
  selectedStock: StockDetail | null
  marketOverview: MarketOverview | null
  isLoading: boolean
  error: string | null
  lastUpdated: string | null
  marketStatus: MarketStatus
}