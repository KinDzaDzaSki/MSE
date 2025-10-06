'use client'

import { useState } from 'react'
import { Stock } from '@/lib/types'
import { useStocks } from '@/hooks/useStocks'
import { StockList } from '@/components/stocks/StockList'
import { MarketOverview } from '@/components/market/MarketOverview'
import { Button } from '@/components/ui/button'
import { RefreshCw, BarChart3, List } from 'lucide-react'

export default function HomePage() {
  const { stocks, marketStatus, lastUpdated, isLoading, error, refetch } = useStocks()
  const [view, setView] = useState<'overview' | 'list'>('overview')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }

  const handleStockClick = (stock: Stock) => {
    // Navigate to stock detail page
    window.location.href = `/stock/${stock.symbol}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">МСЕ Следење на Акции</h1>
                <p className="text-sm text-gray-600">Македонска берза</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setView(view === 'overview' ? 'list' : 'overview')}
                className="flex items-center gap-2"
              >
                {view === 'overview' ? <List className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
                {view === 'overview' ? 'Прикажи листа' : 'Прикажи преглед'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Освежи
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Грешка: {error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              className="mt-2"
            >
              Обиди се повторно
            </Button>
          </div>
        )}

        {view === 'overview' ? (
          <MarketOverview
            stocks={stocks}
            marketStatus={marketStatus}
            lastUpdated={lastUpdated || new Date().toISOString()}
          />
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Сите акции</h2>
              <p className="text-gray-600">
                {stocks.length} компании листирани на МСЕ
                {lastUpdated && (
                  <span className="ml-2 text-sm">
                    • Последно ажурирано: {new Date(lastUpdated).toLocaleTimeString('mk-MK')}
                  </span>
                )}
              </p>
            </div>

            <StockList
              stocks={stocks}
              onStockClick={handleStockClick}
              isLoading={isLoading}
            />
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 py-8 border-t border-gray-200">
          <div className="text-center text-sm text-gray-500">
            <p>
              Податоци преземени од Македонската берза. 
              Оваа апликација не е поврзана со МСЕ.
            </p>
            <p className="mt-1">
              Изградено со Next.js • Ажурирање во реално време на секои 30 секунди за време на работните часови
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}