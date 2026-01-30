'use client'

import { useState, useEffect, useRef } from 'react'
import { Stock } from '@/lib/types'
import { StockList } from './StockList'
import { uiTextMK } from '@/lib/localization'

type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc'
  | 'change-asc'
  | 'change-desc'
  | 'volume-asc'
  | 'volume-desc'
  | 'symbol-asc'
  | 'symbol-desc'

interface EnhancedStockListProps {
  onStockClick?: (stock: Stock) => void
  initialViewMode?: 'all' // Keep for compatibility but always use 'all'
}

export function EnhancedStockList({ onStockClick }: EnhancedStockListProps) {
  const [allStocks, setAllStocks] = useState<Stock[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    totalCompanies: number
    activeCompanies: number
    stocksCount: number
    bondsCount: number
  } | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const sortDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false)
      }
    }

    if (showSortDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }

    return undefined
  }, [showSortDropdown])

  // Sort options configuration
  const sortOptions: { value: SortOption; label: string; description: string }[] = [
    { value: 'name-asc', label: 'Име (А-Ш)', description: 'Азбучен редослед по име' },
    { value: 'name-desc', label: 'Име (Ш-А)', description: 'Обратен азбучен редослед по име' },
    { value: 'symbol-asc', label: 'Симбол (А-Ш)', description: 'Азбучен редослед по симбол' },
    { value: 'symbol-desc', label: 'Симбол (Ш-А)', description: 'Обратен азбучен редослед по симбол' },
    { value: 'price-desc', label: 'Цена (висока-ниска)', description: 'Највисока цена прво' },
    { value: 'price-asc', label: 'Цена (ниска-висока)', description: 'Најниска цена прво' },
    { value: 'change-desc', label: 'Промена (висока-ниска)', description: 'Најголема промена прво' },
    { value: 'change-asc', label: 'Промена (ниска-висока)', description: 'Најмала промена прво' },
    { value: 'volume-desc', label: 'Волумен (висок-низок)', description: 'Највисок волумен прво' },
    { value: 'volume-asc', label: 'Волумен (низок-висок)', description: 'Најнизок волумен прво' },
  ]

  // Get current sort label
  const getCurrentSortLabel = () => {
    const currentOption = sortOptions.find(option => option.value === sortBy)
    return currentOption ? currentOption.label : 'Подреди'
  }

  // Sort function
  const sortStocks = (stocks: Stock[], sortOption: SortOption): Stock[] => {
    const sorted = [...stocks].sort((a, b) => {
      switch (sortOption) {
        case 'name-asc':
          return a.name.localeCompare(b.name, 'mk-MK')
        case 'name-desc':
          return b.name.localeCompare(a.name, 'mk-MK')
        case 'symbol-asc':
          return a.symbol.localeCompare(b.symbol)
        case 'symbol-desc':
          return b.symbol.localeCompare(a.symbol)
        case 'price-asc':
          return a.price - b.price
        case 'price-desc':
          return b.price - a.price
        case 'change-asc':
          return a.changePercent - b.changePercent
        case 'change-desc':
          return b.changePercent - a.changePercent
        case 'volume-asc':
          return a.volume - b.volume
        case 'volume-desc':
          return b.volume - a.volume
        default:
          return 0
      }
    })
    return sorted
  }

  // Fetch stocks (enhanced endpoint with comprehensive data)
  const fetchStocks = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) {
        setIsLoading(true)
      }
      setError(null)

      // Use the /all endpoint to get all configured companies, not just active ones
      const response = await fetch('/api/stocks/all')
      const result = await response.json()

      if (result.success) {
        const stocks = result.data.stocks || []

        // Calculate stats for all stocks
        const activeStocks = stocks.filter((stock: Stock) => stock.price > 0 || stock.volume > 0 || stock.changePercent !== 0)
        const stocksCount = stocks.filter((stock: Stock) => stock.instrumentType === 'stock').length
        const bondsCount = stocks.filter((stock: Stock) => stock.instrumentType === 'bond').length

        setAllStocks(stocks)
        setStats({
          totalCompanies: stocks.length,
          activeCompanies: activeStocks.length,
          stocksCount,
          bondsCount
        })
        setLastUpdated(result.data.discoveryTimestamp || result.data.lastUpdated)

        // Show data source in console for debugging
        console.log(`📊 All companies loaded: ${stocks.length} total (${stocksCount} stocks, ${bondsCount} bonds), ${activeStocks.length} active`)
      } else {
        setError(result.error || 'Неуспешно преземање на акции')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : uiTextMK.networkError)
    } finally {
      if (showLoadingSpinner) {
        setIsLoading(false)
      }
    }
  }

  // Initial load - fetch real data (which now comes from database/cache)
  useEffect(() => {
    fetchStocks()
  }, [])

  const currentStocks = sortStocks(allStocks, sortBy)

  return (
    <div className="space-y-12">
      {/* Context area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black mt-0 mb-2">Берзански Именик</h2>
          <p className="text-gray-500 font-medium">Комплетна листа на субјекти на Македонска берза.</p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Simple Sort Dropdown */}
          <div className="relative" ref={sortDropdownRef}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              Подреди: {getCurrentSortLabel()}
            </button>

            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value)
                        setShowSortDropdown(false)
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm rounded-lg hover:bg-green-50 hover:text-green-800 transition-colors ${sortBy === option.value ? 'bg-green-50 text-green-800 font-extrabold' : 'text-gray-700 font-medium'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => fetchStocks(true)}
            disabled={isLoading}
            className="quiet-button text-sm"
          >
            {isLoading ? 'Освежувам...' : 'Освежи листа'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-6 bg-red-50 border-2 border-red-100 rounded-2xl text-red-800 font-bold">
          <p>Имаше мал проблем: {error}</p>
          <button onClick={() => fetchStocks(true)} className="underline mt-2">Пробај повторно</button>
        </div>
      )}

      {/* Modern List Container */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
        <StockList
          stocks={currentStocks}
          onStockClick={onStockClick || (() => { })}
          isLoading={isLoading}
        />
      </div>

      {lastUpdated && (
        <div className="text-center pb-8">
          <span className="inline-block px-4 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-500">
            Последно ажурирано: {new Date(lastUpdated).toLocaleString('mk-MK')}
          </span>
        </div>
      )}
    </div>
  )
}
