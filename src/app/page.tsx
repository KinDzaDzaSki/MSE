'use client'

import { useState, useEffect, useRef } from 'react'
import { Stock } from '@/lib/types'
import { useStocks } from '@/hooks/useStocks'
import { EnhancedStockList } from '@/components/stocks/EnhancedStockList'
import { MarketOverview } from '@/components/market/MarketOverview'
import { Button } from '@/components/ui/button'
import { RefreshCw, Menu, TrendingUp } from 'lucide-react'
import { uiTextMK } from '@/lib/localization'
import { announceToScreenReader, createLiveRegion, updateLiveRegion } from '@/lib/accessibility'

export default function HomePage() {
  const { stocks, marketStatus, lastUpdated, isLoading, error, refetch } = useStocks()
  const [view, setView] = useState<'overview' | 'list'>('overview')
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside (but not when hovering)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle click outside for mobile menu
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false)
      }
    }

    if (showMobileMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    
    return undefined
  }, [showMobileMenu])

  // Create live region for stock updates
  useEffect(() => {
    createLiveRegion('stock-updates', 'polite')
  }, [])

  // Announce stock updates to screen readers
  useEffect(() => {
    if (stocks.length > 0 && !isLoading) {
      const message = `Податоците за акциите се ажурирани. ${stocks.length} листирани компании.`
      updateLiveRegion('stock-updates', message)
    }
  }, [stocks, isLoading])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    announceToScreenReader('Се освежуваат податоците за акциите...')
    await refetch()
    setIsRefreshing(false)
    announceToScreenReader('Податоците за акциите се успешно освежени.')
  }

  const handleStockClick = (stock: Stock) => {
    window.location.href = `/stock/${stock.symbol}`
  }

  const handleViewChange = (newView: 'overview' | 'list') => {
    setView(newView)
    const message = newView === 'overview' 
      ? 'Прегледот на пазарот е активен' 
      : 'Листата со сите акции е активна'
    announceToScreenReader(message)
  }
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Skip to main content link for keyboard users */}
      <a 
        href="#main-content" 
        className="skip-link"
        onFocus={() => announceToScreenReader('Користете Enter за да прескокнете до главната содржина')}
      >
        Скокни до главната содржина
      </a>

      {/* MSE Header with proper semantic structure */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm" role="banner">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between h-16 px-4">
            {/* Logo and Navigation */}
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <div 
                  className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"
                  role="img"
                  aria-label="Лого на Македонската берза"
                >
                  <TrendingUp className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <h1 className="text-xl font-bold text-slate-900">{uiTextMK.stockExchange}</h1>
              </div>
              
              <nav className="hidden md:flex space-x-8" role="navigation" aria-label="Главна навигација">
                <button 
                  onClick={() => handleViewChange('overview')}
                  className={`text-sm font-medium transition-colors btn-accessible ${
                    view === 'overview' 
                      ? 'text-indigo-600 border-b-2 border-indigo-600 pb-4' 
                      : 'text-slate-700 hover:text-indigo-600'
                  }`}
                  aria-pressed={view === 'overview'}
                  aria-describedby="overview-description"
                >
                  {uiTextMK.marketOverview}
                </button>
                <div id="overview-description" className="sr-only">
                  Прикажува преглед на пазарот со најважни статистики и трендови
                </div>

                {/* All Companies Button */}
                <button 
                  onClick={() => handleViewChange('list')}
                  className={`text-sm font-medium transition-colors btn-accessible ${
                    view === 'list'
                      ? 'text-indigo-600 border-b-2 border-indigo-600 pb-4' 
                      : 'text-slate-700 hover:text-indigo-600'
                  }`}
                  aria-pressed={view === 'list'}
                  aria-describedby="all-companies-description"
                >
                  Сите компании
                </button>
                <div id="all-companies-description" className="sr-only">
                  Прикажува комплетен директориум на сите компании листирани на МСЕ
                </div>
              </nav>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-4">
              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center space-x-2 text-sm btn-accessible border-slate-300 text-slate-700 hover:bg-slate-50"
                aria-describedby="refresh-help"
                aria-live="polite"
                aria-label={isRefreshing ? 'Се освежуваат податоците...' : 'Освежи ги податоците за акциите'}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">{uiTextMK.refresh}</span>
              </Button>
              <div id="refresh-help" className="sr-only">
                Освежува ги податоците за акциите од Македонската берза
              </div>

              {/* Mobile Menu */}
              <div className="relative md:hidden" ref={mobileMenuRef}>
                <button 
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="p-2 btn-accessible"
                  aria-label="Отвори мобилно мени"
                  aria-expanded={showMobileMenu}
                >
                  <Menu className="w-5 h-5 text-slate-700" aria-hidden="true" />
                </button>

                {/* Mobile Menu Dropdown */}
                {showMobileMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                    <div className="py-2">
                      <button
                        onClick={() => {
                          handleViewChange('overview')
                          setShowMobileMenu(false)
                        }}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors ${
                          view === 'overview' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'
                        }`}
                      >
                        📊 {uiTextMK.marketOverview}
                      </button>
                      
                      <button
                        onClick={() => {
                          handleViewChange('list')
                          setShowMobileMenu(false)
                        }}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors ${
                          view === 'list' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'
                        }`}
                      >
                        🏢 Сите компании
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Market Status Bar with accessibility */}
      <section className="bg-white border-b border-slate-200" role="region" aria-label="Статус на пазарот">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <div 
                  className={`w-2 h-2 rounded-full ${
                    marketStatus.isOpen ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  role="img"
                  aria-label={marketStatus.isOpen ? 'Пазарот е отворен' : 'Пазарот е затворен'}
                />
                <span className="text-sm font-medium text-slate-900">
                  {marketStatus.isOpen ? uiTextMK.marketOpen : uiTextMK.marketClosed}
                </span>
              </div>
              
              {lastUpdated && (
                <div className="text-sm text-slate-600" aria-live="polite">
                  <span className="sr-only">Податоците се </span>
                  {uiTextMK.lastUpdated}: <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleTimeString('mk-MK')}</time>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content with landmark */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-6" role="main">
        {/* Error Message with accessibility */}
        {error && (
          <div 
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between"
            role="alert"
            aria-live="assertive"
          >
            <div>
              <h3 className="text-sm font-medium text-red-800">
                {uiTextMK.errorOccurred} при вчитувањето на податоците
              </h3>
              <p className="text-sm text-red-700 mt-1" id="error-message">
                {error}
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              className="text-red-700 border-red-300 hover:bg-red-50 btn-accessible"
              aria-describedby="error-message"
            >
              {uiTextMK.tryAgain}
            </Button>
          </div>
        )}

        {/* Loading State with accessibility */}
        {isLoading && stocks.length === 0 ? (
          <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" aria-hidden="true" />
              <p className="text-gray-600">{uiTextMK.dataUpdating}</p>
              <span className="sr-only">Се вчитуваат податоците за акциите, ве молиме почекајте</span>
            </div>
          </div>
        ) : (
          <>
            {view === 'overview' ? (
              <section aria-label="Преглед на пазарот">
                <h2 className="sr-only">Преглед на пазарот</h2>
                <MarketOverview
                  stocks={stocks}
                  marketStatus={marketStatus}
                  lastUpdated={lastUpdated || new Date().toISOString()}
                />
              </section>
            ) : (
              <section aria-label="Сите компании">
                <div className="space-y-6">
                  <div className="bg-white rounded-lg shadow-sm border p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">
                      Сите компании на МСЕ
                    </h2>
                    <p className="text-sm text-gray-600">
                      Преглед на комплетниот МСЕ директориум со сите {stocks.length} листирани {uiTextMK.companies}
                    </p>
                  </div>
                  
                  <EnhancedStockList
                    onStockClick={handleStockClick}
                    initialViewMode="all"
                  />
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Footer with proper semantic structure */}
      <footer className="bg-white border-t border-gray-200 mt-12" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-sm text-gray-500">
            <p className="mb-2">
              © 2025 MSE Stock Tracker. Податоци преземени од {uiTextMK.stockExchange}.
            </p>
            <p>
              Оваа апликација не е поврзана со МСЕ. Изградено со Next.js и TypeScript.
            </p>
          </div>
        </div>
      </footer>

      {/* Live region for announcements */}
      <div id="stock-updates" aria-live="polite" aria-atomic="true" className="sr-only"></div>
    </div>
  )
}