'use client'

import { useState, useEffect } from 'react'
import { PricePoint } from '@/lib/types'
import dynamic from 'next/dynamic'

// Dynamically import Recharts components
const AreaChart = dynamic(() => import('recharts').then(mod => mod.AreaChart), { ssr: false })
const Area = dynamic(() => import('recharts').then(mod => mod.Area), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false })

interface MiniChartProps {
  data: PricePoint[]
  color?: string
  className?: string
}

export function MiniChart({ data, color = '#3b82f6', className }: MiniChartProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Get dynamic color based on price trend
  const getDynamicColor = () => {
    if (data.length < 2) return color
    
    const firstPrice = data[0]?.price || 0
    const lastPrice = data[data.length - 1]?.price || 0
    
    if (lastPrice > firstPrice) return '#16a34a' // Green for positive
    if (lastPrice < firstPrice) return '#dc2626' // Red for negative
    return '#3b82f6' // Blue for neutral
  }

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

  if (!mounted) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="w-full h-8 bg-gray-100 rounded animate-pulse"></div>
      </div>
    )
  }

  const chartColor = getDynamicColor()

  return (
    <div className={`w-full ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={chartColor}
            fill={chartColor}
            fillOpacity={0.1}
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}