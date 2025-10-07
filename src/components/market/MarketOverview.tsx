'use client'

import { Stock, MarketStatusInfo } from '@/lib/types'
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react'
import { uiTextMK, formatMacedonian } from '@/lib/localization'

interface MarketOverviewProps {
  stocks: Stock[]
  marketStatus: MarketStatusInfo
  lastUpdated: string
}

export function MarketOverview({ stocks }: MarketOverviewProps) {
  const totalStocks = stocks.length
  const gainers = stocks.filter(s => s.changePercent > 0).length
  const losers = stocks.filter(s => s.changePercent < 0).length
  
  const totalVolume = stocks.reduce((sum, stock) => sum + stock.volume, 0)

  const topGainers = [...stocks]
    .filter(s => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5)

  // If no gainers, show "least losers" - stocks that performed best relative to others
  const leastLosers = topGainers.length === 0 ? [...stocks]
    .sort((a, b) => b.changePercent - a.changePercent) // Best performers first
    .slice(0, 5) : []

  const topLosers = [...stocks]
    .filter(s => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5)

  const mostActive = [...stocks]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(2)}%`
  }

  return (
    <div className="space-y-6">
      {/* Market Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Листирани {uiTextMK.companies}</p>
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
              <p className="text-sm font-medium text-slate-600">Вкупен {uiTextMK.volume}</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatMacedonian.volume(totalVolume)}
              </p>
            </div>
            <Activity className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Gainers */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center">
              <TrendingUp className="w-5 h-5 text-emerald-600 mr-2" />
              {topGainers.length > 0 ? `Најголеми ${uiTextMK.gainers}` : 'Најдобри Перформанси'}
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {topGainers.length === 0 && leastLosers.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500">
                {uiTextMK.noGainers} {uiTextMK.today}
              </div>
            ) : (
              (topGainers.length > 0 ? topGainers : leastLosers).map((stock, index) => (
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

        {/* Most Active */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center">
              <Activity className="w-5 h-5 text-indigo-600 mr-2" />
              Најактивни
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {mostActive.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500">
                Нема тргувачка активност
              </div>
            ) : (
              mostActive.map((stock, index) => (
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
                      <div className="text-sm font-semibold text-indigo-600">
                        {formatMacedonian.volume(stock.volume)}
                      </div>
                      <div className={`text-xs font-medium ${
                        stock.changePercent >= 0 ? 'text-emerald-600' : 'text-red-600'
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
      </div>
    </div>
  )
}
