import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Stock } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('mk-MK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

export function formatChange(change: number): string {
  const formatted = Math.abs(change).toFixed(2)
  return change >= 0 ? `+${formatted}` : `-${formatted}`
}

export function formatPercent(percent: number): string {
  const formatted = Math.abs(percent).toFixed(2)
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
  if (change > 0) return 'text-green-600'
  if (change < 0) return 'text-red-600'
  return 'text-gray-600'
}

export function getChangeBgColor(change: number): string {
  if (change > 0) return 'bg-green-50 text-green-700'
  if (change < 0) return 'bg-red-50 text-red-700'
  return 'bg-gray-50 text-gray-700'
}

/**
 * Removes duplicate stocks from an array, keeping the one with highest volume
 * @param stocks Array of stock objects
 * @returns Deduplicated array of stocks
 */
export function deduplicateStocks(stocks: Stock[]): Stock[] {
  const stockMap = new Map<string, Stock>()
  
  stocks.forEach(stock => {
    const existing = stockMap.get(stock.symbol)
    
    // Keep the stock with higher volume, or if volumes are equal, the one with more recent timestamp
    if (!existing || 
        stock.volume > existing.volume || 
        (stock.volume === existing.volume && new Date(stock.lastUpdated) > new Date(existing.lastUpdated))) {
      stockMap.set(stock.symbol, stock)
    }
  })
  
  return Array.from(stockMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol))
}