'use client'

import { PricePoint } from '@/lib/types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatPrice } from '@/lib/utils'

interface StockChartProps {
  data: PricePoint[]
  className?: string
}

export function StockChart({ data, className }: StockChartProps) {
  // Transform data for Recharts
  const chartData = data.map(point => ({
    date: new Date(point.timestamp).toLocaleDateString('mk-MK', { 
      month: 'short', 
      day: 'numeric' 
    }),
    price: point.price,
    volume: point.volume || 0,
    timestamp: point.timestamp
  }))

  // Calculate price range for better Y-axis scaling
  const prices = data.map(d => d.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice
  const yAxisMin = Math.max(0, minPrice - priceRange * 0.1)
  const yAxisMax = maxPrice + priceRange * 0.1

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          <p className="text-blue-600">
            Price: {formatPrice(data.price)} MKD
          </p>
          {data.volume > 0 && (
            <p className="text-gray-600 text-sm">
              Volume: {data.volume.toLocaleString()}
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
        <p className="text-gray-500">No chart data available</p>
      </div>
    )
  }

  return (
    <div className={`w-full h-full ${className}`}>
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
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ 
              r: 4, 
              fill: '#3b82f6',
              stroke: '#ffffff',
              strokeWidth: 2
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}