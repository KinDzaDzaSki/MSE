'use client'

import { PricePoint } from '@/lib/types'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

interface MiniChartProps {
  data: PricePoint[]
  color?: string
  className?: string
}

export function MiniChart({ data, color = '#3b82f6', className }: MiniChartProps) {
  // Transform data for the mini chart
  const chartData = data.map(point => ({
    value: point.price
  }))

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="w-full h-8 bg-gray-100 rounded"></div>
      </div>
    )
  }

  return (
    <div className={`w-full ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.1}
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}