// Localization utilities for Macedonian locale

// Date formatting
export const formatMacedonian = {
  date: (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('mk-MK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  },

  time: (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleTimeString('mk-MK', {
      hour: '2-digit',
      minute: '2-digit'
    })
  },

  dateTime: (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleString('mk-MK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  },

  // Macedonian number formatting
  number: (value: number, options?: Intl.NumberFormatOptions) => {
    return value.toLocaleString('mk-MK', options)
  },

  currency: (value: number) => {
    return `${value.toLocaleString('mk-MK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} ден.`
  },

  percentage: (value: number) => {
    return `${value.toFixed(2)}%`
  },

  volume: (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}М`
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}К`
    }
    return value.toLocaleString('mk-MK')
  }
}

// Market status translations
export const marketStatusMK = {
  open: 'Отворен',
  closed: 'Затворен',
  pre_market: 'Пред-пазарен',
  after_hours: 'Надвор од работни часови'
} as const

// Day names in Macedonian
export const dayNamesMK = [
  'Недела', 'Понеделник', 'Вторник', 'Среда', 'Четврток', 'Петок', 'Сабота'
]

// Month names in Macedonian
export const monthNamesMK = [
  'Јануари', 'Февруари', 'Март', 'Април', 'Мај', 'Јуни',
  'Јули', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
]

// Common UI text translations
export const uiTextMK = {
  loading: 'Се вчитува...',
  error: 'Грешка',
  retry: 'Обиди се повторно',
  refresh: 'Освежи',
  back: 'Назад',
  search: 'Пребарај',
  filter: 'Филтер',
  sort: 'Сортирај',
  price: 'Цена',
  change: 'Промена',
  volume: 'Волумен',
  marketCap: 'Пазарна капитализација',
  noData: 'Нема податоци',
  lastUpdated: 'Последно ажурирано',
  companies: 'компании',
  stocks: 'акции',
  today: 'денес',
  gainers: 'добитници',
  losers: 'губитници',
  active: 'активни',
  overview: 'преглед',
  details: 'детали'
} as const