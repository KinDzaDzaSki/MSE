'use client'

import { useState, useEffect } from 'react'
import { PricePoint } from '@/lib/types'
import { formatPrice } from '@/lib/utils'
import dynamic from 'next/dynamic'

// Dynamically import Recharts to avoid SSR issues
const LineChart = dynamic(() => import('recharts').then((mod) => mod.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then((mod) => mod.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((mod) => mod.ResponsiveContainer), { ssr: false })

export type TimeRange = '1D' | '7D' | '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface StockChartProps {
  data: PricePoint[]
  className?: string
  onTimeRangeChange?: (range: TimeRange) => void
  selectedTimeRange?: TimeRange
}

export function StockChart({ 
  data, 
  className, 
  onTimeRangeChange,
  selectedTimeRange = '1M'
}: StockChartProps) {
  const [localTimeRange, setLocalTimeRange] = useState<TimeRange>(selectedTimeRange)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: '1D', label: '1Д' },
    { value: '7D', label: '7Д' },
    { value: '1M', label: '1М' },
    { value: '3M', label: '3М' },
    { value: '6M', label: '6М' },
    { value: '1Y', label: '1Г' },
    { value: 'ALL', label: 'Сè' }
  ]

  const handleTimeRangeChange = (range: TimeRange) => {
    setLocalTimeRange(range)
    onTimeRangeChange?.(range)
  }

  // Filter data based on selected time range
  const getFilteredData = () => {
    if (!data.length) return []
    
    // For debugging, let's just return the data for now and check if the chart works
    if (localTimeRange === 'ALL') {
      return data
    }
    
    const now = new Date()
    let startDate: Date
    
    switch (localTimeRange) {
      case '1D':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7D':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '1M':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '3M':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '6M':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        break
      case '1Y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        return data
    }
    
    const filtered = data.filter(point => new Date(point.timestamp) >= startDate)
    console.log(`Filtering from ${startDate.toISOString()} to ${now.toISOString()}`)
    console.log(`Original data: ${data.length}, Filtered: ${filtered.length}`)
    
    // If filtered data is empty, return the last 30 days as fallback
    if (filtered.length === 0) {
      const fallbackStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      return data.filter(point => new Date(point.timestamp) >= fallbackStart)
    }
    
    return filtered
  }

  const filteredData = getFilteredData()

  // Debug: Log the data to see what's happening
  console.log('StockChart data:', data.length, 'filtered:', filteredData.length, 'timeRange:', localTimeRange)
  
  if (data.length > 0) {
    console.log('Sample data point:', data[0])
    console.log('Sample filtered data point:', filteredData[0])
  }

  // Transform data for Recharts with appropriate date formatting
  const getDateFormat = () => {
    switch (localTimeRange) {
      case '1D':
        return { hour: '2-digit', minute: '2-digit' } as const
      case '7D':
        return { weekday: 'short', day: 'numeric' } as const
      case '1M':
      case '3M':
        return { month: 'short', day: 'numeric' } as const
      case '6M':
      case '1Y':
        return { month: 'short', year: '2-digit' } as const
      default:
        return { month: 'short', year: 'numeric' } as const
    }
  }

  // Get chart stroke color based on price trend
  const getChartColor = () => {
    if (filteredData.length < 2) return '#3b82f6'
    
    const firstPrice = filteredData[0]?.price || 0
    const lastPrice = filteredData[filteredData.length - 1]?.price || 0
    
    if (lastPrice > firstPrice) return '#16a34a' // Green for positive
    if (lastPrice < firstPrice) return '#dc2626' // Red for negative
    return '#3b82f6' // Blue for neutral
  }

  const chartColor = getChartColor()

  // Calculate percentage change for the selected period
  const getPeriodChange = () => {
    if (filteredData.length < 2) return null
    
    const firstPrice = filteredData[0]?.price || 0
    const lastPrice = filteredData[filteredData.length - 1]?.price || 0
    const change = lastPrice - firstPrice
    const changePercent = (change / firstPrice) * 100
    
    return { change, changePercent, isPositive: change >= 0 }
  }

  const periodChange = getPeriodChange()

  const chartData = filteredData.map(point => ({
    date: new Date(point.timestamp).toLocaleDateString('mk-MK', getDateFormat()),
    price: point.price,
    volume: point.volume || 0,
    timestamp: point.timestamp
  }))

  // Calculate price range for better Y-axis scaling
  const prices = filteredData.map(d => d.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice
  const yAxisMin = Math.max(0, minPrice - priceRange * 0.1)
  const yAxisMax = maxPrice + priceRange * 0.1

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: Array<{
      payload: {
        date: string
        price: number
        volume: number
        timestamp: string
      }
    }>
    label?: string
  }) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0]?.payload
      if (!data) return null
      
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-700">{label}</p>
          <p className="text-blue-600 font-semibold">
            Цена: {formatPrice(data.price)} ден
          </p>
          {data.volume > 0 && (
            <p className="text-gray-600 text-sm">
              Волумен: {data.volume.toLocaleString('mk-MK')}
            </p>
          )}
        </div>
      )
    }
    return null
  }

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-gray-500">Нема податоци за графикон</p>
      </div>
    )
  }

  if (!isClient) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-gray-500">Се вчитува графикон...</p>
      </div>
    )
  }

  if (filteredData.length === 0) {
    return (
      <div className={`w-full h-full ${className}`}>
        {/* Time Range Selector */}
        <div className="flex items-center justify-center mb-4 bg-gray-50 rounded-lg p-1">
          <div className="flex space-x-1">
            {timeRangeOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleTimeRangeChange(option.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  localTimeRange === option.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Нема податоци за избраниот период</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full h-full ${className}`}>
      {/* Time Range Selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          {/* Period Change Display */}
          {periodChange && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Промена за период:</span>
              <span className={`text-sm font-semibold ${
                periodChange.isPositive ? 'text-green-700' : 'text-red-700'
              }`}>
                {periodChange.isPositive ? '+' : ''}{formatPrice(periodChange.change)} ден
              </span>
              <span className={`text-sm font-semibold ${
                periodChange.isPositive ? 'text-green-700' : 'text-red-700'
              }`}>
                ({periodChange.isPositive ? '+' : ''}{periodChange.changePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center bg-gray-50 rounded-lg p-1">
          <div className="flex space-x-1">
            {timeRangeOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleTimeRangeChange(option.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  localTimeRange === option.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 20,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              stroke="#666"
              fontSize={12}
              tick={{ fill: '#666' }}
            />
            <YAxis 
              domain={[yAxisMin, yAxisMax]}
              stroke="#666"
              fontSize={12}
              tick={{ fill: '#666' }}
              tickFormatter={(value) => formatPrice(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="price"
              stroke={chartColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ 
                r: 4, 
                fill: chartColor,
                stroke: '#ffffff',
                strokeWidth: 2
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}