'use client'

import React, { memo } from 'react'
import { Stock } from '@/lib/types'
import { formatPrice, formatPercent, getChangeColor } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface StockCardProps {
  stock: Stock
  onClick?: () => void
}

function StockCard({ stock, onClick }: StockCardProps) {
  const isPositive = stock.changePercent >= 0
  const isNeutral = stock.changePercent === 0

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0 flex-1 mr-4">
            <h3 className="font-semibold text-lg text-blue-700">{stock.symbol}</h3>
            <p className="text-sm text-gray-700 break-words leading-tight">{stock.name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-lg font-bold text-gray-900">
              {formatPrice(stock.price)} MKD
            </div>
            <div className={`text-sm flex items-center gap-1 justify-end ${getChangeColor(stock.changePercent)}`}>
              {isPositive && <TrendingUp className="w-3 h-3" />}
              {stock.changePercent < 0 && <TrendingDown className="w-3 h-3" />}
              {isNeutral && <Activity className="w-3 h-3" />}
              {formatPercent(stock.changePercent)}
            </div>
          </div>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 font-medium">Волумен: {stock.volume.toLocaleString('mk-MK')}</span>
          <span className={`font-semibold ${getChangeColor(stock.change)}`}>
            {stock.change >= 0 ? '+' : ''}{formatPrice(stock.change)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// Memoize the component for better performance
const MemoizedStockCard = memo(StockCard)

// Export both named and default for compatibility
export { MemoizedStockCard as StockCard }
export default MemoizedStockCard