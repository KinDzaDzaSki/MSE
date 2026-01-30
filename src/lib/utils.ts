import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Stock } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a price with appropriate precision based on its value
 * @param price The price to format
 * @param options Optional formatting options
 * @returns Formatted price string
 */
export function formatPrice(price: number, options: {
  minimumFractionDigits?: number,
  maximumFractionDigits?: number,
  adaptivePrecision?: boolean,
} = {}): string {
  // Make sure price is finite and a number
  if (!isFinite(price) || isNaN(price)) {
    return '0.00'
  }

  // Use adaptive precision based on price value unless overridden
  const minFractionDigits = options.minimumFractionDigits ?? 2
  let maxFractionDigits = options.maximumFractionDigits ?? 2

  if (options.adaptivePrecision !== false) {
    // For smaller prices (under 10), show more decimal places
    if (Math.abs(price) < 10) {
      maxFractionDigits = Math.max(maxFractionDigits, 3)
    }

    // For very small prices, show even more precision
    if (Math.abs(price) < 1) {
      maxFractionDigits = Math.max(maxFractionDigits, 4)
    }
  }

  return new Intl.NumberFormat('mk-MK', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(price)
}

/**
 * Format a price change with sign and appropriate precision
 * @param change The price change to format
 * @returns Formatted change string with + or - sign
 */
export function formatChange(change: number): string {
  // Make sure change is finite and a number
  if (!isFinite(change) || isNaN(change)) {
    return '+0.00'
  }

  // Use adaptive precision based on change value
  let decimals = 2
  if (Math.abs(change) < 1) {
    decimals = 3
  }
  if (Math.abs(change) < 0.1) {
    decimals = 4
  }

  const formatted = Math.abs(change).toFixed(decimals)
  return change >= 0 ? `+${formatted}` : `-${formatted}`
}

/**
 * Format a percentage change with sign and appropriate precision
 * @param percent The percentage to format
 * @returns Formatted percentage string with + or - sign
 */
export function formatPercent(percent: number): string {
  // Make sure percent is finite and a number
  if (!isFinite(percent) || isNaN(percent)) {
    return '+0.00%'
  }

  // Use adaptive precision based on percentage value
  let decimals = 2
  if (Math.abs(percent) < 1) {
    decimals = 3
  }
  if (Math.abs(percent) < 0.1) {
    decimals = 4
  }

  const formatted = Math.abs(percent).toFixed(decimals)
  return `${percent >= 0 ? '+' : '-'}${formatted}%`
}

export function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`
  }
  return volume.toString()
}

export function getChangeColor(change: number): string {
  if (change > 0) return 'text-green-700'
  if (change < 0) return 'text-red-700'
  return 'text-gray-700'
}

export function getChangeBgColor(change: number): string {
  if (change > 0) return 'bg-green-50 text-green-800'
  if (change < 0) return 'bg-red-50 text-red-800'
  return 'bg-gray-50 text-gray-800'
}

/**
 * Removes duplicate stocks from an array, keeping the one with highest volume
 * @param stocks Array of stock objects
 * @returns Deduplicated array of stocks
 */
/**
 * Removes duplicate stocks from an array using advanced deduplication strategy
 * @param stocks Array of stock objects
 * @returns Deduplicated array of stocks
 */
export function deduplicateStocks(stocks: Stock[]): Stock[] {
  // First, validate and filter out any invalid data
  const validStocks = stocks.filter(stock => {
    // Basic validation for required fields
    if (!stock.symbol ||
      typeof stock.price !== 'number' ||
      !isFinite(stock.price) ||
      isNaN(stock.price) ||
      stock.price <= 0) {
      console.warn(`Filtered invalid stock data: ${JSON.stringify(stock)}`)
      return false
    }

    // Check for unreasonable values
    if (stock.price > 1000000) { // Unreasonably high price
      console.warn(`Filtered stock with unreasonable price: ${stock.symbol} at ${stock.price}`)
      return false
    }

    if (Math.abs(stock.changePercent) > 100) { // Change over ±100% is likely an error
      console.warn(`Filtered stock with extreme change: ${stock.symbol} at ${stock.changePercent}%`)
      return false
    }

    return true
  })

  // Group by symbol
  const stockMap = new Map<string, Stock[]>()

  validStocks.forEach(stock => {
    const symbol = stock.symbol.toUpperCase()
    const existingGroup = stockMap.get(symbol) || []
    existingGroup.push(stock)
    stockMap.set(symbol, existingGroup)
  })

  // Select the best stock from each group
  const result: Stock[] = []

  stockMap.forEach((stocksForSymbol) => {
    if (stocksForSymbol.length === 1) {
      // Only one entry, use it if not undefined
      const stock = stocksForSymbol[0]
      if (stock) {
        result.push(stock)
      }
    } else {
      // Multiple entries for this symbol, need to select the best one

      // Sort by data quality metrics (non-zero volume first, then by recency)
      stocksForSymbol.sort((a, b) => {
        // Prefer stocks with non-zero volume
        if ((a.volume > 0) !== (b.volume > 0)) {
          return a.volume > 0 ? -1 : 1
        }

        // Then by recency
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      })

      // Take the best one, but check for undefined
      const bestStock = stocksForSymbol[0]
      if (bestStock) {
        result.push(bestStock)
      }
    }
  })

  // Sort alphabetically by symbol
  return result.sort((a, b) => a.symbol.localeCompare(b.symbol))
}