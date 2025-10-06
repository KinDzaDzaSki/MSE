'use client'

import { Stock, MarketStatus } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react'

interface MarketOverviewProps {
  stocks: Stock[]
  marketStatus: MarketStatus
  lastUpdated: string
}

export function MarketOverview({ stocks, marketStatus, lastUpdated }: MarketOverviewProps) {
  const totalStocks = stocks.length
  const gainers = stocks.filter(s => s.changePercent > 0).length
  const losers = stocks.filter(s => s.changePercent < 0).length
  const unchanged = stocks.filter(s => s.changePercent === 0).length
  
  const totalVolume = stocks.reduce((sum, stock) => sum + stock.volume, 0)
  const avgChange = stocks.length > 0 
    ? stocks.reduce((sum, stock) => sum + stock.changePercent, 0) / stocks.length 
    : 0

  const topGainers = [...stocks]
    .filter(s => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 3)

  const topLosers = [...stocks]
    .filter(s => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 3)

  const mostActive = [...stocks]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3)

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getMarketStatusColor = (status: MarketStatus) => {
    switch (status) {
      case 'open': return 'text-green-600'
      case 'closed': return 'text-red-600'
      default: return 'text-yellow-600'
    }
  }

  return (
    <div className="space-y-6">
      {/* Market Status and Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Статус на пазарот</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${marketStatus === 'open' ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`font-semibold capitalize ${getMarketStatusColor(marketStatus)}`}>
                {marketStatus === 'open' ? 'Отворен' : marketStatus === 'closed' ? 'Затворен' : marketStatus}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              <Clock className="w-3 h-3" />
              Ажурирано: {formatTime(lastUpdated)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Вкупно акции</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStocks}</div>
            <div className="text-xs text-gray-500">Листирани компании</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Движење на пазарот</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1 text-green-600">
                <TrendingUp className="w-3 h-3" />
                {gainers}
              </div>
              <div className="flex items-center gap-1 text-red-600">
                <TrendingDown className="w-3 h-3" />
                {losers}
              </div>
              <div className="flex items-center gap-1 text-gray-600">
                <Activity className="w-3 h-3" />
                {unchanged}
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Просек: {avgChange.toFixed(2)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Вкупен волумен</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(totalVolume / 1000000).toFixed(1)}М
            </div>
            <div className="text-xs text-gray-500">МКД тргувани</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Gainers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Најголеми добитници
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topGainers.length === 0 ? (
              <p className="text-gray-500 text-sm">Нема добитници денес</p>
            ) : (
              topGainers.map((stock) => (
                <div key={stock.id} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{stock.symbol}</div>
                    <div className="text-sm text-gray-600">{stock.price.toFixed(2)} MKD</div>
                  </div>
                  <div className="text-green-600 font-medium">
                    +{stock.changePercent.toFixed(2)}%
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Top Losers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              Најголеми губитници
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topLosers.length === 0 ? (
              <p className="text-gray-500 text-sm">Нема губитници денес</p>
            ) : (
              topLosers.map((stock) => (
                <div key={stock.id} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{stock.symbol}</div>
                    <div className="text-sm text-gray-600">{stock.price.toFixed(2)} MKD</div>
                  </div>
                  <div className="text-red-600 font-medium">
                    {stock.changePercent.toFixed(2)}%
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Most Active */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              Најактивни
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mostActive.length === 0 ? (
              <p className="text-gray-500 text-sm">Нема тргувачка активност</p>
            ) : (
              mostActive.map((stock) => (
                <div key={stock.id} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{stock.symbol}</div>
                    <div className="text-sm text-gray-600">{stock.price.toFixed(2)} MKD</div>
                  </div>
                  <div className="text-blue-600 font-medium">
                    {(stock.volume / 1000).toFixed(0)}K
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}