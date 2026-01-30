'use client'

import { useState, useEffect } from 'react'
import { Stock } from '@/lib/types'
import { useStocks } from '@/hooks/useStocks'
import { EnhancedStockList } from '@/components/stocks/EnhancedStockList'
import { MarketOverview } from '@/components/market/MarketOverview'
import { announceToScreenReader, createLiveRegion } from '@/lib/accessibility'

export default function HomePage() {
  const { stocks, marketStatus, lastUpdated, isLoading, error, refetch } = useStocks()
  const [activeTab, setActiveTab] = useState<'overview' | 'all'>('overview')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Create live region for accessibility
  useEffect(() => {
    // createLiveRegion is imported from lib/accessibility
    // Let's check its signature first if possible, or just fix it if it's obvious.
    // The lint says "Expected 1-2 arguments, but got 0".
    const liveRegion = createLiveRegion('status', 'polite')
    return () => {
      if (liveRegion && liveRegion.parentNode) {
        liveRegion.parentNode.removeChild(liveRegion)
      }
    }
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    announceToScreenReader('Се освежуваат податоците...')
    await refetch()
    setIsRefreshing(false)
    announceToScreenReader('Податоците се успешно освежени.')
  }

  const handleStockClick = (stock: Stock) => {
    announceToScreenReader(`Избран симбол: ${stock.symbol}. Цена: ${stock.price} денари.`)
    // Details view logic could go here
  }

  return (
    <main className="min-h-screen pb-20">
      {/* Modern Minimalist Header */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-40">
        <div className="document-container py-4 flex flex-col sm:flex-row justify-between items-start sm:items-baseline gap-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-black mt-0 mb-0 tracking-tight">МСЕ Следење</h1>
            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">Информации во живо</p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-primary transition-colors disabled:opacity-50"
          >
            {isRefreshing ? 'Освежувам...' : 'Освежи'}
          </button>
        </div>
      </nav>

      <div className="document-container">
        {/* HEY-style View Switcher */}
        <div className="flex gap-10 mb-12 border-b-2 border-gray-100">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-4 text-xl font-black transition-all relative ${activeTab === 'overview' ? 'text-primary' : 'text-gray-300 hover:text-gray-500'
              }`}
          >
            Денес на берза
            {activeTab === 'overview' && <div className="absolute bottom-[-2px] left-0 right-0 h-1 bg-primary rounded-full"></div>}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-4 text-xl font-black transition-all relative ${activeTab === 'all' ? 'text-primary' : 'text-gray-300 hover:text-gray-500'
              }`}
          >
            Берзански именик
            {activeTab === 'all' && <div className="absolute bottom-[-2px] left-0 right-0 h-1 bg-primary rounded-full"></div>}
          </button>
        </div>

        {/* Dynamic Content */}
        <div className="space-y-12">
          {error && (
            <div className="p-8 bg-red-50 border-2 border-red-100 rounded-3xl text-red-900">
              <h3 className="text-xl font-black mt-0 mb-2">Имаше мал проблем</h3>
              <p className="font-bold opacity-75 mb-4">{error}</p>
              <p className="text-sm mb-6 opacity-70">Можно е веб-страницата на Берзата да е под оптоварување или привремено недостапна. Ве молиме обидете се повторно за кратко.</p>
              <button onClick={handleRefresh} className="quiet-button">Пробај повторно</button>
            </div>
          )}

          {activeTab === 'overview' ? (
            <div className="quiet-card">
              {isLoading && stocks.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="text-2xl font-black text-gray-300 animate-pulse">Ги преземаме најновите цени...</div>
                </div>
              ) : (
                <MarketOverview
                  stocks={stocks}
                  marketStatus={marketStatus}
                  lastUpdated={lastUpdated || ''}
                />
              )}
            </div>
          ) : (
            <EnhancedStockList
              onStockClick={handleStockClick}
            />
          )}
        </div>
      </div>
    </main>
  )
}