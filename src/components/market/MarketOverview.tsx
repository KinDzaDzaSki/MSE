'use client'

import { Stock, MarketStatus } from '@/lib/types'
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react'

interface MarketOverviewProps {
  stocks: Stock[]
  marketStatus: MarketStatus
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

  const topLosers = [...stocks]
    .filter(s => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5)

  const mostActive = [...stocks]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('mk-MK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(2)}%`
  }

  return (
    <div className="space-y-6">
      {/* Market Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Листирани компании</p>
              <p className="text-2xl font-bold text-gray-900">{totalStocks}</p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Добитници</p>
              <p className="text-2xl font-bold text-green-600">{gainers}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Губитници</p>
              <p className="text-2xl font-bold text-red-600">{losers}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Вкупен волумен</p>
              <p className="text-2xl font-bold text-gray-900">
                {(totalVolume / 1000000).toFixed(1)}М
              </p>
            </div>
            <Activity className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Gainers */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 text-green-600 mr-2" />
              Најголеми добитници
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {topGainers.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                Нема добитници денес
              </div>
            ) : (
              topGainers.map((stock, index) => (
                <div key={stock.id} className="px-6 py-3 hover:bg-gray-50 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-xs text-gray-500 w-4">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{stock.symbol}</div>
                        <div className="text-sm text-gray-600 truncate max-w-32">
                          {stock.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        {formatPrice(stock.price)} ден
                      </div>
                      <div className="text-sm font-medium text-green-600">
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
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
              Најголеми губитници
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {topLosers.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                Нема губитници денес
              </div>
            ) : (
              topLosers.map((stock, index) => (
                <div key={stock.id} className="px-6 py-3 hover:bg-gray-50 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-xs text-gray-500 w-4">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{stock.symbol}</div>
                        <div className="text-sm text-gray-600 truncate max-w-32">
                          {stock.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        {formatPrice(stock.price)} ден
                      </div>
                      <div className="text-sm font-medium text-red-600">
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
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Activity className="w-5 h-5 text-purple-600 mr-2" />
              Најактивни
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {mostActive.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                Нема тргувачка активност
              </div>
            ) : (
              mostActive.map((stock, index) => (
                <div key={stock.id} className="px-6 py-3 hover:bg-gray-50 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-xs text-gray-500 w-4">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{stock.symbol}</div>
                        <div className="text-sm text-gray-600 truncate max-w-32">
                          {stock.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        {formatPrice(stock.price)} ден
                      </div>
                      <div className="text-sm font-medium text-blue-600">
                        {(stock.volume / 1000).toFixed(0)}K
                      </div>
                      <div className="text-xs text-gray-500">
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