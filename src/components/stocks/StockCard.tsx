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
          <div>
            <h3 className="font-semibold text-lg">{stock.symbol}</h3>
            <p className="text-sm text-gray-600 truncate">{stock.name}</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">
              {formatPrice(stock.price)} MKD
            </div>
            <div className={`text-sm flex items-center gap-1 ${getChangeColor(stock.changePercent)}`}>
              {isPositive && <TrendingUp className="w-3 h-3" />}
              {stock.changePercent < 0 && <TrendingDown className="w-3 h-3" />}
              {isNeutral && <Activity className="w-3 h-3" />}
              {formatPercent(stock.changePercent)}
            </div>
          </div>
        </div>
        
        <div className="flex justify-between text-sm text-gray-500">
          <span>Волумен: {stock.volume.toLocaleString('mk-MK')}</span>
          <span className={getChangeColor(stock.change)}>
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