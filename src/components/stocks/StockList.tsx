'use client'

import { Stock } from '@/lib/types'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { memo } from 'react'

interface StockListProps {
  stocks: Stock[]
  onStockClick?: (stock: Stock) => void
  isLoading?: boolean
}

function StockList({ stocks, onStockClick, isLoading }: StockListProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('mk-MK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(2)}%`
  }

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}М`
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}К`
    }
    return volume.toString()
  }

  const handleStockClick = (stock: Stock) => {
    if (onStockClick) {
      onStockClick(stock)
    }
  }

  if (isLoading && stocks.length === 0) {
    return (
      <div className="bg-white rounded-lg overflow-hidden">
        <div className="animate-pulse">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="flex items-center space-x-8">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (stocks.length === 0) {
    return (
      <div className="bg-white rounded-lg p-8 text-center">
        <p className="text-gray-500">Нема достапни податоци за акции.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden">
      {/* Table Header */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div className="col-span-4">Симбол / Компанија</div>
          <div className="col-span-2 text-right">Цена</div>
          <div className="col-span-2 text-right">Промена</div>
          <div className="col-span-2 text-right">Промена %</div>
          <div className="col-span-2 text-right">Волумен</div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-gray-100">
        {stocks.map((stock, index) => (
          <div
            key={stock.id}
            onClick={() => handleStockClick(stock)}
            className={`px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${
              index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
            }`}
          >
            <div className="grid grid-cols-12 gap-4 items-center">
              {/* Symbol and Company */}
              <div className="col-span-4">
                <div className="flex items-center space-x-3">
                  <div>
                    <div className="font-semibold text-blue-600 hover:text-blue-800">
                      {stock.symbol}
                    </div>
                    <div className="text-sm text-gray-600 truncate max-w-48">
                      {stock.name}
                    </div>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="col-span-2 text-right">
                <div className="font-semibold text-gray-900">
                  {formatPrice(stock.price)} ден
                </div>
              </div>

              {/* Change Amount */}
              <div className="col-span-2 text-right">
                <div className={`font-medium ${
                  stock.change >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stock.change >= 0 ? '+' : ''}{formatPrice(stock.change)}
                </div>
              </div>

              {/* Change Percentage */}
              <div className="col-span-2 text-right">
                <div className={`flex items-center justify-end space-x-1 ${
                  stock.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stock.changePercent >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span className="font-medium">
                    {formatChange(stock.changePercent)}
                  </span>
                </div>
              </div>

              {/* Volume */}
              <div className="col-span-2 text-right">
                <div className="text-gray-900 font-medium">
                  {formatVolume(stock.volume)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {stocks.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Прикажани {stocks.length} акции
          </div>
        </div>
      )}
    </div>
  )
}

export const MemoizedStockList = memo(StockList)
export { MemoizedStockList as StockList }
export default MemoizedStockList