/**
 * Debug utility component to check for duplicate stocks
 * Remove this component in production
 */

'use client'

import { Stock } from '@/lib/types'

interface DebugStocksProps {
  stocks: Stock[]
  title: string
}

export function DebugStocks({ stocks, title }: DebugStocksProps) {
  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  const symbols = stocks.map(s => s.symbol)
  const uniqueSymbols = new Set(symbols)
  const hasDuplicates = symbols.length !== uniqueSymbols.size
  
  if (!hasDuplicates) {
    return (
      <div className="text-xs text-green-600 mb-2">
        ✅ {title}: {stocks.length} unique stocks
      </div>
    )
  }

  // Find duplicates
  const duplicates = symbols.filter((symbol, index) => symbols.indexOf(symbol) !== index)
  const uniqueDuplicates = [...new Set(duplicates)]

  return (
    <div className="text-xs text-red-600 mb-2 p-2 bg-red-50 rounded">
      ⚠️ {title}: Found {uniqueDuplicates.length} duplicate symbols: {uniqueDuplicates.join(', ')}
      <br />
      Total: {stocks.length} stocks, Unique: {uniqueSymbols.size} stocks
    </div>
  )
}