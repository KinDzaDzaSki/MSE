'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { StockDetail, PricePoint, ApiResponse } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react'
import { formatPrice, formatPercent, getChangeColor } from '@/lib/utils'
import { NewStockChart as StockChart, TimeRange } from '@/components/charts/NewStockChart'

export default function StockDetailPage() {
  const params = useParams()
  const router = useRouter()
  const symbol = params.symbol as string
  
  const [stock, setStock] = useState<StockDetail | null>(null)
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('1M')

  const fetchStockDetail = async () => {
    try {
      setError(null)
      const response = await fetch(`/api/stocks/${symbol}`)
      const result: ApiResponse<StockDetail> = await response.json()

      if (result.success && result.data) {
        setStock(result.data)
        // Generate mock price history for all time ranges
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
    // Generate comprehensive mock data for all time ranges (up to 2 years)
    const history: PricePoint[] = []
    const now = new Date()
    
    // Generate data for different time granularity - use realistic market times
    const today = new Date(now)
    today.setHours(0, 0, 0, 0) // Start of today
    
    // Define opening/closing times and trading days
    const marketOpenHour = 9
    const marketCloseHour = 16
    const isWeekend = today.getDay() === 0 || today.getDay() === 6
    
    // 1. Generate hourly data for the last day (only during market hours)
    if (!isWeekend) {
      // Base price at market open (slightly different from closing price)
      const openingVariation = (Math.random() - 0.5) * 0.02 // ±1%
      let hourlyPrice = stockData.price * (1 + openingVariation)
      const targetPrice = stockData.price // End price should match current price
      
      // Only generate data for market hours
      for (let hour = marketOpenHour; hour <= marketCloseHour; hour++) {
        const date = new Date(today)
        date.setHours(hour, 0, 0, 0)
        
        // Smooth progression to target price
        const progress = (hour - marketOpenHour) / (marketCloseHour - marketOpenHour)
        const baseline = hourlyPrice + (targetPrice - hourlyPrice) * progress
        
        // Add small hourly noise (±0.5%)
        const hourlyNoise = (Math.random() - 0.5) * 0.01
        const actualPrice = baseline * (1 + hourlyNoise)
        
        // More volume at market open and close
        const isOpenOrClose = hour === marketOpenHour || hour === marketCloseHour
        const hourlyVolume = isOpenOrClose
          ? Math.floor(Math.random() * 30000) + 15000
          : Math.floor(Math.random() * 15000) + 5000
        
        history.push({
          timestamp: date.toISOString(),
          price: Math.max(actualPrice, 0.01),
          volume: hourlyVolume
        })
      }
    }
    
    // 2. Generate daily data for the last 90 days - more realistic patterns
    // Create a natural price movement with some volatility but realistic progression
    
    // Start with the current price and work backwards with reasonable volatility
    let dailyPrice = stockData.price
    const volatilityFactor = 0.01 // Base daily volatility (1%)
    
    // Calculate gradual starting price (avoid artificial straight lines)
    // Create a more realistic trend with some seasonal patterns
    // Define trend characteristics (used in price calculation)
    
    // Most MKD stocks have shown modest growth over time
    const dailyCompoundRate = Math.pow(1.15, 1/365) // ~15% annual growth
    
    for (let i = 1; i <= 90; i++) { // Work backwards from current day
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      date.setHours(16, 0, 0, 0) // End of trading day
      
      // Skip weekends - no trading data
      const dayOfWeek = date.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue
      }
      
      // Apply inverse compound growth working backwards
      dailyPrice = dailyPrice / dailyCompoundRate
      
      // Add realistic volatility
      const dayVolatility = volatilityFactor * (0.5 + Math.random())
      const priceMove = (Math.random() - 0.5) * dayVolatility * 2
      dailyPrice = dailyPrice * (1 + priceMove)
      
      // Add some market patterns
      const isMonday = dayOfWeek === 1
      const isFriday = dayOfWeek === 5
      const weekendEffect = isMonday ? 0.998 : (isFriday ? 1.002 : 1) // Slight weekend effect
      dailyPrice = dailyPrice * weekendEffect
      
      // Add some news-based jumps (rare but significant price moves)
      if (Math.random() > 0.95) { // 5% chance of significant news
        const newsImpact = (Math.random() - 0.3) * 0.05 // -1.5% to +3.5% news effect, slightly positive bias
        dailyPrice = dailyPrice * (1 + newsImpact)
      }
      
      // Volume varies based on price movement magnitude and day of week
      const priceMoveFactor = Math.abs(priceMove) * 10
      const baseVolume = Math.floor(20000 + Math.random() * 50000)
      const dayFactor = (isMonday || isFriday) ? 1.3 : 1 // More volume Mondays and Fridays
      const dailyVolume = Math.floor((baseVolume + baseVolume * priceMoveFactor) * dayFactor)
      
      // Add to history if not today (avoid duplication with hourly data)
      if (i > 1) {
        history.push({
          timestamp: date.toISOString(),
          price: Math.max(dailyPrice, 0.01), // Prevent negative prices
          volume: dailyVolume
        })
      }
    }
    
    // 3. Generate weekly data for older history (up to 2 years) with realistic market patterns
    
    // Calculate a realistic starting point (not just arbitrary percentage)
    let weeklyPrice = dailyPrice
    
    // Define multi-year patterns
    const annualGrowthRate = 1.12 // 12% annual growth (realistic for Macedonian market)
    const weeklyGrowthRate = Math.pow(annualGrowthRate, 1/52) // Weekly compound rate
    const marketCycles = []
    
    // Generate several market cycles (bull and bear markets)
    let cycleStart = 0
    while (cycleStart < 104) { // 104 weeks = 2 years
      // Random cycle length (8-24 weeks)
      const cycleLength = Math.floor(Math.random() * 16) + 8
      // Is this a bull (up) or bear (down) market?
      const isBull = Math.random() > 0.35 // 65% chance of bull market
      // Strength of the trend (bull markets tend to be stronger than bear markets)
      const trendStrength = isBull ? 
        1 + (Math.random() * 0.03) : // Bull: 0-3% additional weekly growth
        1 - (Math.random() * 0.02)   // Bear: 0-2% weekly decline
        
      marketCycles.push({
        start: cycleStart,
        end: cycleStart + cycleLength,
        isBull,
        trendStrength
      })
      
      cycleStart += cycleLength
    }
    
    for (let i = 104; i > 12; i--) { // 104 weeks = 2 years, skip recent weeks (covered by daily data)
      // Find where in the market cycles this week falls
      const currentCycle = marketCycles.find(cycle => i <= cycle.start && i > cycle.end) || {
        isBull: true,
        trendStrength: 1.002 // Default slight uptrend
      }
      
      const date = new Date(now)
      date.setDate(date.getDate() - (i * 7))
      date.setHours(16, 0, 0, 0) // End of trading week (Friday)
      
      // Apply cycle trend and weekly growth rate (working backwards)
      weeklyPrice = weeklyPrice / (weeklyGrowthRate * currentCycle.trendStrength)
      
      // Add weekly noise/volatility (2-4%)
      const weeklyVolatility = 0.02 + (Math.random() * 0.02)
      const noiseDirection = Math.random() - 0.5
      weeklyPrice = weeklyPrice * (1 + (noiseDirection * weeklyVolatility))
      
      // Add seasonal effects
      const month = date.getMonth()
      const isWinter = month === 0 || month === 1 || month === 11
      const isSummer = month === 6 || month === 7 
      const isEndOfYear = month === 11 || month === 0 // Dec-Jan
      const isEarningsSeason = month === 3 || month === 4 || month === 10 // Apr, May, Nov
      
      // Seasonal adjustments
      if (isWinter && !isEndOfYear) weeklyPrice *= 0.995 // Winter slowdown
      if (isSummer) weeklyPrice *= 1.003 // Summer rally
      if (isEndOfYear) weeklyPrice *= 1.005 // End of year rally
      if (isEarningsSeason) {
        // More volatility during earnings
        const earningsEffect = (Math.random() - 0.4) * 0.03 // Slight positive bias
        weeklyPrice *= (1 + earningsEffect)
      }
      
      // Weekly volume varies with market sentiment and volatility
      const baseVolume = Math.floor(Math.random() * 300000) + 100000
      const sentimentFactor = currentCycle.isBull ? 1.2 : 0.9
      const weeklyVolume = Math.floor(baseVolume * sentimentFactor * (1 + weeklyVolatility))
      
      history.push({
        timestamp: date.toISOString(),
        price: Math.max(weeklyPrice, 0.01), // Ensure price is positive
        volume: weeklyVolume
      })
    }
    
    // Sort chronologically
    history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    
    // Ensure the last price matches current price
    if (history.length > 0) {
      const lastEntry = history[history.length - 1]
      if (lastEntry) {
        lastEntry.price = stockData.price
      }
    }
    
    setPriceHistory(history)
  }

  const handleTimeRangeChange = (range: TimeRange) => {
    setSelectedTimeRange(range)
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
            <CardTitle className="text-lg">Графикон на цената</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96">
              <StockChart 
                data={priceHistory} 
                selectedTimeRange={selectedTimeRange}
                onTimeRangeChange={handleTimeRangeChange}
              />
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