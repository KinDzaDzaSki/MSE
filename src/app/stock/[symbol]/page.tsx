'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { StockDetail, PricePoint, ApiResponse } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react'
import { formatPrice, formatPercent, getChangeColor } from '@/lib/utils'
import { StockChart } from '@/components/charts/StockChart'

export default function StockDetailPage() {
  const params = useParams()
  const router = useRouter()
  const symbol = params.symbol as string
  
  const [stock, setStock] = useState<StockDetail | null>(null)
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchStockDetail = async () => {
    try {
      setError(null)
      const response = await fetch(`/api/stocks/${symbol}`)
      const result: ApiResponse<StockDetail> = await response.json()

      if (result.success && result.data) {
        setStock(result.data)
        // Generate mock price history for now
        generateMockPriceHistory(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch stock details')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      console.error('Error fetching stock details:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const generateMockPriceHistory = (stockData: StockDetail) => {
    // Generate 30 days of mock price history
    const history: PricePoint[] = []
    let currentPrice = stockData.price
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      
      // Add some random variation
      const variation = (Math.random() - 0.5) * 0.1 // ±5% variation
      currentPrice = currentPrice * (1 + variation)
      
      history.push({
        timestamp: date.toISOString(),
        price: Math.max(currentPrice, 0.01), // Ensure positive price
        volume: Math.floor(Math.random() * 100000) + 10000
      })
    }
    
    // Ensure the last price matches current price
    if (history.length > 0) {
      history[history.length - 1].price = stockData.price
    }
    
    setPriceHistory(history)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchStockDetail()
    setIsRefreshing(false)
  }

  useEffect(() => {
    if (symbol) {
      fetchStockDetail()
    }
  }, [symbol])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Се вчитуваат деталите за акцијата...</p>
        </div>
      </div>
    )
  }

  if (error || !stock) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Грешка: {error || 'Акцијата не е пронајдена'}</p>
          <div className="space-x-2">
            <Button onClick={() => router.back()} variant="outline">
              Врати се назад
            </Button>
            <Button onClick={handleRefresh}>
              Обиди се повторно
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isPositive = stock.changePercent >= 0
  const isNeutral = stock.changePercent === 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{stock.symbol}</h1>
                <p className="text-sm text-gray-600">{stock.name}</p>
              </div>
            </div>
            
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
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stock Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Price Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Тековна цена</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">
                {formatPrice(stock.price)} MKD
              </div>
              <div className={`flex items-center gap-2 ${getChangeColor(stock.changePercent)}`}>
                {isPositive && <TrendingUp className="w-4 h-4" />}
                {stock.changePercent < 0 && <TrendingDown className="w-4 h-4" />}
                {isNeutral && <Activity className="w-4 h-4" />}
                <span className="font-medium">
                  {stock.change >= 0 ? '+' : ''}{formatPrice(stock.change)}
                </span>
                <span className="font-medium">
                  ({formatPercent(stock.changePercent)})
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-2">
                Last updated: {new Date(stock.lastUpdated).toLocaleTimeString()}
              </div>
            </CardContent>
          </Card>

          {/* Volume Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Тргувачки волумен</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-2">
                {stock.volume.toLocaleString('mk-MK')}
              </div>
              <div className="text-sm text-gray-500">
                Тргувани акции денес
              </div>
            </CardContent>
          </Card>

          {/* Market Cap Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Пазарни информации</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stock.marketCap && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Пазарна кап.:</span>
                    <span className="font-medium">
                      {(stock.marketCap / 1000000).toFixed(1)}М ден.
                    </span>
                  </div>
                )}
                {stock.isin && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">ISIN:</span>
                    <span className="font-medium">{stock.isin}</span>
                  </div>
                )}
                {stock.sector && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Сектор:</span>
                    <span className="font-medium">{stock.sector}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Price Chart */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Графикон на цената (30 дена)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <StockChart data={priceHistory} />
            </div>
          </CardContent>
        </Card>

        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Информации за компанијата</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">За компанијата</h3>
                <p className="text-gray-600 text-sm">
                  {stock.description || `${stock.name} е компанија листирана на Македонската берза.`}
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Детали</h3>
                <div className="space-y-2 text-sm">
                  {stock.website && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Веб страна:</span>
                      <a 
                        href={stock.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Посети
                      </a>
                    </div>
                  )}
                  {stock.pe && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">П/Е однос:</span>
                      <span>{stock.pe.toFixed(2)}</span>
                    </div>
                  )}
                  {stock.pb && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">П/Б однос:</span>
                      <span>{stock.pb.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}