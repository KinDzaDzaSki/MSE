'use client'

import { useState } from 'react'
import { Stock } from '@/lib/types'
import { useStocks } from '@/hooks/useStocks'
import { StockList } from '@/components/stocks/StockList'
import { MarketOverview } from '@/components/market/MarketOverview'
import { Button } from '@/components/ui/button'
import { RefreshCw, Search, Menu, TrendingUp } from 'lucide-react'

export default function HomePage() {
  const { stocks, marketStatus, lastUpdated, isLoading, error, refetch } = useStocks()
  const [view, setView] = useState<'overview' | 'list'>('overview')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }

  const handleStockClick = (stock: Stock) => {
    window.location.href = `/stock/${stock.symbol}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Yahoo Finance Style Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between h-16 px-4">
            {/* Logo and Navigation */}
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div className="text-xl font-bold text-gray-900">MSE</div>
              </div>
              
              <nav className="hidden md:flex space-x-8">
                <button 
                  onClick={() => setView('overview')}
                  className={`text-sm font-medium transition-colors ${
                    view === 'overview' 
                      ? 'text-blue-600 border-b-2 border-blue-600 pb-4' 
                      : 'text-gray-700 hover:text-blue-600'
                  }`}
                >
                  Преглед на пазарот
                </button>
                <button 
                  onClick={() => setView('list')}
                  className={`text-sm font-medium transition-colors ${
                    view === 'list' 
                      ? 'text-blue-600 border-b-2 border-blue-600 pb-4' 
                      : 'text-gray-700 hover:text-blue-600'
                  }`}
                >
                  Сите акции
                </button>
              </nav>
            </div>

            {/* Search and Actions */}
            <div className="flex items-center space-x-4">
              {/* Search Bar */}
              <div className="hidden md:flex items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Пребарај акции..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-64"
                  />
                </div>
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-2 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Освежи</span>
              </Button>

              {/* Mobile Menu */}
              <button className="md:hidden p-2">
                <Menu className="w-5 h-5 text-gray-700" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Market Status Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  marketStatus === 'open' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className="text-sm font-medium text-gray-900">
                  Пазарот е {marketStatus === 'open' ? 'отворен' : 'затворен'}
                </span>
              </div>
              
              {lastUpdated && (
                <div className="text-sm text-gray-600">
                  Последно ажурирање: {new Date(lastUpdated).toLocaleTimeString('mk-MK')}
                </div>
              )}
              
              <div className="text-sm text-gray-600">
                {stocks.length} листирани компании
              </div>
            </div>
          </div>
        </div>
      </div>      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-800">Грешка при вчитувањето на податоците</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              className="text-red-700 border-red-300 hover:bg-red-50"
            >
              Обиди се повторно
            </Button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && stocks.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Се вчитуваат податоците за акциите...</p>
            </div>
          </div>
        ) : (
          <>
            {view === 'overview' ? (
              <MarketOverview
                stocks={stocks}
                marketStatus={marketStatus}
                lastUpdated={lastUpdated || new Date().toISOString()}
              />
            ) : (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Сите акции на МСЕ</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Преглед на сите {stocks.length} листирани компании
                  </p>
                </div>
                
                <StockList
                  stocks={stocks.filter(stock => 
                    searchQuery === '' || 
                    stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    stock.name.toLowerCase().includes(searchQuery.toLowerCase())
                  )}
                  onStockClick={handleStockClick}
                  isLoading={isLoading}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-sm text-gray-500">
            <p className="mb-2">
              © 2025 MSE Stock Tracker. Податоци преземени од Македонската берза.
            </p>
            <p>
              Оваа апликација не е поврзана со МСЕ. Изградено со Next.js и TypeScript.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}