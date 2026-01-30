'use client'

import { useState, useEffect } from 'react'
import { Stock, MarketStatusInfo } from '@/lib/types'
import { uiTextMK, formatMacedonian } from '@/lib/localization'

interface MarketOverviewProps {
  stocks: Stock[]
  marketStatus: MarketStatusInfo
  lastUpdated: string
}

export function MarketOverview({ }: MarketOverviewProps) {
  const [currentDayStocks, setCurrentDayStocks] = useState<Stock[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch current day trading data directly from /api/stocks
  useEffect(() => {
    const fetchCurrentDayData = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('/api/stocks')
        const result = await response.json()

        if (result.success && result.data?.stocks) {
          setCurrentDayStocks(result.data.stocks)
        }
      } catch (error) {
        console.error('Failed to fetch current day trading data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCurrentDayData()
  }, [])

  // Filter for stocks that appear on MSE's trading list (those with actual prices > 0)
  // This matches MSE's definition of "traded today" rather than requiring price changes
  const tradedToday = currentDayStocks.filter((stock: Stock) => stock.price > 0)

  const totalStocks = tradedToday.length
  const gainers = tradedToday.filter(s => s.changePercent > 0).length
  const losers = tradedToday.filter(s => s.changePercent < 0).length
  const unchanged = tradedToday.filter(s => s.changePercent === 0).length

  // Always show all traded stocks sorted by volume (most to least transactions)
  const mostTraded = [...tradedToday]
    .sort((a, b) => b.volume - a.volume) // Sort by volume (number of transactions)

  const topGainers = [...tradedToday]
    .filter(s => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5)

  const topLosers = [...tradedToday]
    .filter(s => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5)

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(2)}%`
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Се вчитуваат денешните податоци...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-16">
      {/* Summary Card */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-gray-400 text-xs font-black uppercase tracking-wider mb-2">Тргувани</h4>
            <div className="text-5xl font-black">{totalStocks}</div>
          </div>
          <div>
            <h4 className="text-green-700/50 text-xs font-black uppercase tracking-wider mb-2">Во пораст</h4>
            <div className="text-5xl font-black text-stock-gain">{gainers}</div>
          </div>
          <div>
            <h4 className="text-red-700/50 text-xs font-black uppercase tracking-wider mb-2">Во пад</h4>
            <div className="text-5xl font-black text-stock-loss">{losers}</div>
          </div>
          <div>
            <h4 className="text-gray-400 text-xs font-black uppercase tracking-wider mb-2">Мирни</h4>
            <div className="text-5xl font-black text-gray-300">{unchanged}</div>
          </div>
        </div>
      </section>

      {/* Market Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        {/* Activity Stream */}
        <section>
          <h3 className="text-xl font-black mb-8 border-b-2 border-gray-100 pb-2">Активни денес</h3>
          <div className="space-y-6">
            {mostTraded.length === 0 ? (
              <p className="text-gray-400 font-medium">Денес сѐ уште нема активност.</p>
            ) : (
              mostTraded.slice(0, 6).map((stock) => (
                <div key={stock.id} className="flex justify-between items-center group">
                  <div className="flex flex-col">
                    <span className="text-lg font-black group-hover:text-primary transition-colors cursor-pointer">{stock.symbol}</span>
                    <span className="text-xs text-gray-400 font-bold truncate max-w-[150px]">{stock.name}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-extrabold">{formatMacedonian.currency(stock.price)}</span>
                    <span className={`px-2 py-1 rounded text-xs font-black ${stock.changePercent > 0 ? 'bg-green-100 text-green-700' :
                        stock.changePercent < 0 ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-500'
                      }`}>
                      {formatChange(stock.changePercent)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          {mostTraded.length > 6 && (
            <button className="mt-8 text-sm font-black text-gray-400 hover:text-black uppercase tracking-widest">Види повеќе →</button>
          )}
        </section>

        {/* Momentum */}
        <div className="space-y-16">
          <section>
            <h3 className="text-xl font-black mb-8 border-b-2 border-gray-100 pb-2">Најголем скок</h3>
            <div className="space-y-4">
              {topGainers.map((stock) => (
                <div key={stock.id} className="flex justify-between items-center bg-green-50/50 p-4 rounded-xl">
                  <span className="font-black text-green-900">{stock.symbol}</span>
                  <span className="px-3 py-1 bg-green-600 text-white text-xs font-black rounded-full">
                    {formatChange(stock.changePercent)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xl font-black mb-8 border-b-2 border-gray-100 pb-2">Најголем пад</h3>
            <div className="space-y-4">
              {topLosers.map((stock) => (
                <div key={stock.id} className="flex justify-between items-center bg-red-50/50 p-4 rounded-xl">
                  <span className="font-black text-red-900">{stock.symbol}</span>
                  <span className="px-3 py-1 bg-red-600 text-white text-xs font-black rounded-full">
                    {formatChange(stock.changePercent)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
