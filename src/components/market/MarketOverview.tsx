'use client'

import { useState, useEffect } from 'react'
import { Stock, MarketStatusInfo } from '@/lib/types'
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react'
import { uiTextMK, formatMacedonian } from '@/lib/localization'

interface MarketOverviewProps {
  stocks: Stock[]
  marketStatus: MarketStatusInfo
  lastUpdated: string
}

export function MarketOverview({}: MarketOverviewProps) {
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
    <div className="space-y-6">
      {/* Market Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Тргувани денес</p>
              <p className="text-2xl font-bold text-slate-900">{totalStocks}</p>
            </div>
            <DollarSign className="w-8 h-8 text-indigo-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">{uiTextMK.gainers}</p>
              <p className="text-2xl font-bold text-emerald-600">{gainers}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">{uiTextMK.losers}</p>
              <p className="text-2xl font-bold text-red-600">{losers}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Непроменети</p>
              <p className="text-2xl font-bold text-slate-600">{unchanged}</p>
            </div>
            <Activity className="w-8 h-8 text-slate-600" />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Most Traded Today - Always show all stocks sorted by volume */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center">
              <Activity className="w-5 h-5 text-indigo-600 mr-2" />
              Најтргувани денес
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {mostTraded.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500">
                Нема податоци за тргување денес
              </div>
            ) : (
              mostTraded.map((stock, index) => (
                <div key={stock.id} className="px-6 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-500 w-4 flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-sm">{stock.symbol}</div>
                        <div className="text-xs text-slate-600 break-words leading-tight">
                          {stock.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="font-bold text-slate-900 text-sm">
                        {formatMacedonian.currency(stock.price)}
                      </div>
                      <div className="text-xs text-indigo-600 font-medium">
                        {formatMacedonian.volume(stock.volume)} тргувани
                      </div>
                      <div className={`text-sm font-semibold ${
                        stock.changePercent > 0 ? 'text-emerald-600' : 
                        stock.changePercent < 0 ? 'text-red-600' : 'text-slate-600'
                      }`}>
                        {formatChange(stock.changePercent)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center">
              <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
              Најголеми {uiTextMK.losers}
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {topLosers.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500">
                {uiTextMK.noLosers} {uiTextMK.today}
              </div>
            ) : (
              topLosers.map((stock, index) => (
                <div key={stock.id} className="px-6 py-3 hover:bg-red-50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-500 w-4 flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-sm">{stock.symbol}</div>
                        <div className="text-xs text-slate-600 break-words leading-tight">
                          {stock.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="font-bold text-slate-900 text-sm">
                        {formatMacedonian.currency(stock.price)}
                      </div>
                      <div className="text-sm font-semibold text-red-600">
                        {formatChange(stock.changePercent)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Biggest Gainers */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center">
              <TrendingUp className="w-5 h-5 text-emerald-600 mr-2" />
              Најголеми {uiTextMK.gainers}
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {topGainers.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500">
                {uiTextMK.noGainers} {uiTextMK.today}
              </div>
            ) : (
              topGainers.map((stock, index) => (
                <div key={stock.id} className="px-6 py-3 hover:bg-emerald-50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-500 w-4 flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-sm">{stock.symbol}</div>
                        <div className="text-xs text-slate-600 break-words leading-tight">
                          {stock.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="font-bold text-slate-900 text-sm">
                        {formatMacedonian.currency(stock.price)}
                      </div>
                      <div className="text-sm font-semibold text-emerald-600">
                        {formatChange(stock.changePercent)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
