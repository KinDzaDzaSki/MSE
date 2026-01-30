'use client'

import { useState, useEffect, useRef } from 'react'
import { Stock } from '@/lib/types'
import { StockList } from './StockList'
import { Button } from '@/components/ui/button'
import { uiTextMK } from '@/lib/localization'
import { ChevronDown } from 'lucide-react'

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
        const activeStocks = stocks.filter((stock: Stock) => stock.changePercent !== 0 || stock.volume > 0 || stock.price > 0)
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
    <div className="space-y-6">
      {/* Sort Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Current View Info */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">
            🏢 Сите компании
          </span>
          <span className="text-sm text-slate-500">
            ({stats?.totalCompanies || allStocks.length})
          </span>
        </div>

        {/* Sort and Refresh Controls */}
        <div className="flex gap-2 flex-wrap">
          {/* Sort Dropdown */}
          <div className="relative" ref={sortDropdownRef}>
            <Button
              variant="outline"
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSortDropdown(false)
                }
              }}
              className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2"
              aria-expanded={showSortDropdown}
              aria-haspopup="true"
            >
              📊 {getCurrentSortLabel()}
              <ChevronDown className={`w-4 h-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </Button>

            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                <div className="p-2 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-700">Подреди акции по:</p>
                </div>
                <div className="max-h-80 overflow-y-auto" role="menu" aria-label="Опции за подредување">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value)
                        setShowSortDropdown(false)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowSortDropdown(false)
                        }
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none transition-colors ${sortBy === option.value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'
                        }`}
                      role="menuitem"
                      aria-selected={sortBy === option.value}
                    >
                      <div className="font-medium text-sm">{option.label}</div>
                      <div className="text-xs text-slate-500">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStocks(true)}
            disabled={isLoading}
            className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {isLoading ? `⏳ ${uiTextMK.loading}` : `🔄 ${uiTextMK.refresh}`}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            📈 Преглед на МСЕ
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-600 mb-1">{uiTextMK.totalCompanies}</p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalCompanies}</p>
            </div>
            <div>
              <p className="text-slate-600 mb-1">{uiTextMK.activeCompanies}</p>
              <p className="text-2xl font-bold text-green-600">{stats.activeCompanies}</p>
            </div>
            <div>
              <p className="text-slate-600 mb-1">Акции / Обврзници</p>
              <p className="text-2xl font-bold text-slate-900">
                <span className="text-blue-600">{stats.stocksCount}</span>
                <span className="text-slate-300 mx-2">/</span>
                <span className="text-amber-600">{stats.bondsCount}</span>
              </p>
            </div>
            <div>
              <p className="text-slate-600 mb-1">Активност</p>
              <p className="text-2xl font-bold text-indigo-600">
                {((stats.activeCompanies / stats.totalCompanies) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mode Description */}
      <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="text-2xl">
            📋
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">
              Комплетен МСЕ директориум
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Сеопфатна листа на сите компании листирани на Македонската берза
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">❌ {error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => fetchStocks(true)}
          >
            {uiTextMK.tryAgain}
          </Button>
        </div>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-xs text-gray-500 text-center">
          {uiTextMK.lastUpdated}: {new Date(lastUpdated).toLocaleString('mk-MK')}
        </div>
      )}

      {/* Stock List */}
      <StockList
        stocks={currentStocks}
        onStockClick={onStockClick || (() => { })}
        isLoading={isLoading}
      />
    </div>
  )
}