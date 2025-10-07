'use client'

import { useState, useEffect } from 'react'
import { PricePoint } from '@/lib/types'
import { formatPrice } from '@/lib/utils'
import dynamic from 'next/dynamic'

// Dynamically import Recharts with ssr: false
const ResponsiveContainer = dynamic(() => 
  import('recharts').then((mod) => mod.ResponsiveContainer), 
  { ssr: false }
)
const LineChart = dynamic(() => 
  import('recharts').then((mod) => mod.LineChart), 
  { ssr: false }
)
const Line = dynamic(() => 
  import('recharts').then((mod) => mod.Line), 
  { ssr: false }
)
const XAxis = dynamic(() => 
  import('recharts').then((mod) => mod.XAxis), 
  { ssr: false }
)
const YAxis = dynamic(() => 
  import('recharts').then((mod) => mod.YAxis), 
  { ssr: false }
)
const CartesianGrid = dynamic(() => 
  import('recharts').then((mod) => mod.CartesianGrid), 
  { ssr: false }
)
const Tooltip = dynamic(() => 
  import('recharts').then((mod) => mod.Tooltip), 
  { ssr: false }
)

export type TimeRange = '1D' | '7D' | '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface StockChartProps {
  data: PricePoint[]
  className?: string
  onTimeRangeChange?: (range: TimeRange) => void
  selectedTimeRange?: TimeRange
}

export function NewStockChart({ 
  data, 
  className = '', 
  onTimeRangeChange,
  selectedTimeRange = '1M'
}: StockChartProps) {
  // Client-side rendering check
  const [mounted, setMounted] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>(selectedTimeRange)
  const [filteredData, setFilteredData] = useState<PricePoint[]>([])
  
  // Available time ranges with labels
  const timeRanges: {value: TimeRange, label: string}[] = [
    { value: '1D', label: '1Д' },
    { value: '7D', label: '7Д' },
    { value: '1M', label: '1М' },
    { value: '3M', label: '3М' },
    { value: '6M', label: '6М' },
    { value: '1Y', label: '1Г' },
    { value: 'ALL', label: 'Сè' },
  ]
  
  // Set mounted state on client
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Update filtered data when time range or data changes
  useEffect(() => {
    if (!data || data.length === 0) {
      setFilteredData([])
      return
    }
    
    const now = new Date()
    let startDate: Date = new Date()
    
    // Calculate start date based on selected time range
    switch (timeRange) {
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
      case 'ALL':
      default:
        // Use all data for 'ALL' range
        setFilteredData(data)
        return
    }
    
    // Filter data based on startDate
    const filtered = data.filter(point => {
      const pointDate = new Date(point.timestamp)
      return pointDate >= startDate
    })
    
    // Use all data if filtered data is empty (fallback)
    if (filtered.length === 0) {
      setFilteredData(data.slice(-30)) // Use last 30 data points as fallback
    } else {
      setFilteredData(filtered)
    }
  }, [timeRange, data])
  
  // Handle time range button click
  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range)
    if (onTimeRangeChange) {
      onTimeRangeChange(range)
    }
  }
  
  // Format date for chart display based on time range
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    
    switch (timeRange) {
      case '1D':
        return date.toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' })
      case '7D':
        return date.toLocaleDateString('mk-MK', { weekday: 'short', day: 'numeric' })
      case '1M':
      case '3M':
        return date.toLocaleDateString('mk-MK', { day: 'numeric', month: 'short' })
      case '6M':
      case '1Y':
        return date.toLocaleDateString('mk-MK', { month: 'short', year: '2-digit' })
      case 'ALL':
      default:
        return date.toLocaleDateString('mk-MK', { month: 'short', year: 'numeric' })
    }
  }

  // Calculate price change for the period
  const getPriceChange = () => {
    if (filteredData.length < 2) return null
    
    const firstPoint = filteredData[0]
    const lastPoint = filteredData[filteredData.length - 1]
    
    if (!firstPoint || !lastPoint) return null
    
    const firstPrice = firstPoint.price
    const lastPrice = lastPoint.price
    const change = lastPrice - firstPrice
    const percentChange = (change / firstPrice) * 100
    
    return {
      change,
      percentChange,
      isPositive: change >= 0
    }
  }
  
  const priceChange = getPriceChange()
  
  // Determine chart color based on price trend
  const getChartColor = () => {
    if (!priceChange) return '#3b82f6' // Default blue
    return priceChange.isPositive ? '#16a34a' : '#dc2626' // Green for positive, red for negative
  }
  
  // Prepare chart data with formatted dates
  const chartData = filteredData.map(point => ({
    date: formatDate(point.timestamp),
    price: point.price,
    volume: point.volume || 0,
    timestamp: point.timestamp
  }))
  
  // If not mounted yet (server-side), show loading
  if (!mounted) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-gray-500">Се вчитува графикон...</p>
      </div>
    )
  }
  
  // If no data available
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-gray-500">Нема податоци за графикон</p>
      </div>
    )
  }

  // Custom tooltip component for the chart
  const CustomTooltip = (props: any) => {
    const { active, payload, label } = props
    
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload
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
  
  // Calculate Y-axis domain with outlier detection for better visualization
  const prices = filteredData.map(d => d.price)
  
  // Calculate basic price range
  const rawMinPrice = Math.min(...prices)
  const rawMaxPrice = Math.max(...prices)
  
  // Initialize bounds
  let lowerBound = rawMinPrice
  let upperBound = rawMaxPrice
  
  // Only perform advanced outlier detection with enough data points
  if (prices.length >= 10) {
    // Handle outliers using statistical methods
    const sortedPrices = [...prices].sort((a, b) => a - b)
    
    const q1Index = Math.floor(sortedPrices.length * 0.25)
    const q3Index = Math.floor(sortedPrices.length * 0.75)
    
    // Get quartile values safely
    const q1 = sortedPrices[q1Index] 
    const q3 = sortedPrices[q3Index]
    
    if (q1 !== undefined && q3 !== undefined) {
      const iqr = q3 - q1
      
      // Define upper and lower bounds for outliers
      lowerBound = q1 - (iqr * 1.5)
      upperBound = q3 + (iqr * 1.5)
    }
  }
  
  // Filter out outliers for Y-axis calculation but keep them in the dataset
  const filteredPrices = prices.filter(price => price >= lowerBound && price <= upperBound)
  
  // Use filtered prices for min/max calculation if enough data points
  // Otherwise fall back to all prices
  const useFilteredPrices = filteredPrices.length > prices.length * 0.8
  
  const effectiveMinPrice = useFilteredPrices && filteredPrices.length > 0
    ? Math.min(...filteredPrices)
    : rawMinPrice
  
  const effectiveMaxPrice = useFilteredPrices && filteredPrices.length > 0
    ? Math.max(...filteredPrices)
    : rawMaxPrice
  
  // Add padding for visualization
  const priceRange = effectiveMaxPrice - effectiveMinPrice
  const paddingFactor = priceRange < 5 ? 0.2 : 0.1 // More padding for small ranges
  
  const yAxisMin = Math.max(0, effectiveMinPrice - priceRange * paddingFactor)
  const yAxisMax = effectiveMaxPrice + priceRange * paddingFactor
  
  // Log any detected outliers for debugging
  const outliers = prices.filter(price => price < lowerBound || price > upperBound)
  if (outliers.length > 0) {
    console.log(`Chart outliers detected: ${outliers.length}/${prices.length} points outside range ${lowerBound.toFixed(2)}-${upperBound.toFixed(2)}`)
  }
  
  return (
    <div className={`w-full ${className}`}>
      {/* Time Range Selector */}
      <div className="flex items-center justify-between mb-4">
        {/* Period Change Display */}
        <div className="flex items-center">
          {priceChange && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Промена:</span>
              <span className={`text-sm font-semibold ${priceChange.isPositive ? 'text-green-700' : 'text-red-700'}`}>
                {priceChange.isPositive ? '+' : ''}{formatPrice(priceChange.change)} ден
                ({priceChange.isPositive ? '+' : ''}{priceChange.percentChange.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        
        {/* Time Range Buttons */}
        <div className="flex bg-gray-50 rounded-lg p-1">
          <div className="flex space-x-1">
            {timeRanges.map(option => (
              <button
                key={option.value}
                onClick={() => handleTimeRangeChange(option.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  timeRange === option.value
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
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 10,
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
              height={50}
              interval="preserveStartEnd"
              tickCount={5}
              minTickGap={30}
              tickFormatter={(value) => {
                // Adaptive formatting based on data density and time range
                if (chartData.length > 60 && timeRange === 'ALL') {
                  // For long ranges with many points, simplify to year or quarter
                  if (value.includes('20')) { 
                    return value.split(' ')[1] // Show just year
                  }
                  return value // Otherwise show as is
                }
                
                if (timeRange === '1D' && value.includes(':')) {
                  // For 1D view, simplify time format
                  return value.replace(':00', 'ч')
                }
                
                return value
              }}
            />
            <YAxis 
              domain={[yAxisMin, yAxisMax]}
              stroke="#666"
              fontSize={12}
              tick={{ fill: '#666' }}
              tickFormatter={(value) => formatPrice(value)}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="price"
              stroke={getChartColor()}
              strokeWidth={2}
              dot={false}
              activeDot={{ 
                r: 4, 
                fill: getChartColor(),
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