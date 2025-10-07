'use client'

import { useState, useEffect } from 'react'
import { Stock } from '@/lib/types'
import { StockList } from './StockList'
import { Button } from '@/components/ui/button'
import { uiTextMK } from '@/lib/localization'

interface EnhancedStockListProps {
  onStockClick?: (stock: Stock) => void
}

export function EnhancedStockList({ onStockClick }: EnhancedStockListProps) {
  const [viewMode, setViewMode] = useState<'active' | 'all'>('active')
  const [activeStocks, setActiveStocks] = useState<Stock[]>([])
  const [allStocks, setAllStocks] = useState<Stock[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    totalCompanies: number
    activeCompanies: number
  } | null>(null)

  // Fetch active stocks (currently scraped)
  const fetchActiveStocks = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await fetch('/api/stocks')
      const result = await response.json()
      
      if (result.success) {
        setActiveStocks(result.data.stocks)
        setLastUpdated(result.data.lastUpdated)
      } else {
        setError(result.error || 'Неуспешно преземање на активни акции')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : uiTextMK.networkError)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch all MSE companies (comprehensive list)
  const fetchAllCompanies = async () => {
    try {
      
      const response = await fetch('/api/stocks/all')
      const result = await response.json()
      
      if (result.success) {
        setAllStocks(result.data.stocks)
        setStats({
          totalCompanies: result.data.totalCompanies,
          activeCompanies: result.data.activeCompanies
        })
        setLastUpdated(result.data.discoveryTimestamp)
      } else {
        setError(result.error || 'Неуспешно преземање на сите компании')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : uiTextMK.networkError)
    } finally {
      setIsLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchActiveStocks()
  }, [])

  // Fetch data when view mode changes
  useEffect(() => {
    if (viewMode === 'all' && allStocks.length === 0) {
      fetchAllCompanies()
    }
  }, [viewMode, allStocks.length])

  const currentStocks = viewMode === 'active' ? activeStocks : allStocks
  const isActiveMode = viewMode === 'active'

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isActiveMode ? 'default' : 'outline'}
            onClick={() => setViewMode('active')}
            className={`min-w-fit font-semibold ${
              isActiveMode 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600' 
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            📊 {uiTextMK.activeStocks} ({activeStocks.length})
          </Button>
          <Button
            variant={!isActiveMode ? 'default' : 'outline'}
            onClick={() => setViewMode('all')}
            className={`min-w-fit font-semibold ${
              !isActiveMode 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600' 
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            🏢 {uiTextMK.allCompanies} {stats ? `(${stats.totalCompanies})` : ''}
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={isActiveMode ? fetchActiveStocks : fetchAllCompanies}
            disabled={isLoading}
            className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {isLoading ? `⏳ ${uiTextMK.loading}` : `🔄 ${uiTextMK.refresh}`}
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {stats && viewMode === 'all' && (
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
              <p className="text-slate-600 mb-1">Неактивни/Листирани</p>
              <p className="text-2xl font-bold text-slate-500">{stats.totalCompanies - stats.activeCompanies}</p>
            </div>
            <div>
              <p className="text-slate-600 mb-1">Стапка на активност</p>
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
            {isActiveMode ? '🔥' : '📋'}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">
              {isActiveMode ? 'Активни акции во тргување' : 'Комплетен МСЕ директориум'}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {isActiveMode 
                ? 'Податоци во реално време од активно тргуваните акции со тековни цени и промени'
                : 'Сеопфатна листа на сите компании листирани на Македонската берза'
              }
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
            onClick={isActiveMode ? fetchActiveStocks : fetchAllCompanies}
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
        onStockClick={onStockClick || (() => {})}
        isLoading={isLoading}
      />
    </div>
  )
}