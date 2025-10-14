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

// Market status translations (from official MSE)
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

// Comprehensive UI text translations (matching official MSE terminology)
export const uiTextMK = {
  // Navigation & Main Menu
  marketOverview: 'Преглед на пазарот',
  allStocks: 'Сите акции',
  stockExchange: 'Македонска Берза',
  home: 'Почетна',
  news: 'Вести',
  indices: 'Индекси',
  
  // Search & Actions
  search: 'Пребарај',
  searchStocks: 'Пребарај акции...',
  refresh: 'Освежи',
  loading: 'Се вчитува...',
  retry: 'Обиди се повторно',
  
  // Stock Data Terms (matching MSE.mk)
  symbol: 'Симбол',
  price: 'Цена',
  change: 'Промена',
  changePercent: '% промена',
  volume: 'Волумен',
  marketCap: 'Пазарна капитализација',
  lastTrade: 'Последна трансакција',
  
  // Market Statistics
  mostTraded: 'Најтргувани',
  gainers: 'Добитници',
  losers: 'Губитници',
  noGainers: 'Нема добитници',
  noLosers: 'Нема губитници',
  marketData: 'Пазарни податоци',
  
  // Time & Status
  lastUpdated: 'Последно ажурирано',
  today: 'денес',
  asOf: 'состојба на',
  currentPrice: 'Тековна цена',
  
  // Company Information
  companies: 'компании',
  totalCompanies: 'Вкупно компании',
  activeCompanies: 'Активни компании',
  allCompanies: 'Сите компании',
  companyDetails: 'Детали за компанијата',
  
  // Navigation modes
  showActive: 'Прикажи активни',
  showAll: 'Прикажи сите',
  switchToActive: 'Премини на активни',
  switchToAll: 'Премини на сите',
  
  // Data States
  noData: 'Нема податоци',
  noResults: 'Нема резултати',
  error: 'Грешка',
  errorOccurred: 'Се случи грешка',
  tryAgain: 'Обиди се повторно',
  networkError: 'Мрежна грешка',
  
  // Filters & Sorting
  filter: 'Филтер',
  sort: 'Сортирај',
  sortBy: 'Сортирај по',
  ascending: 'Растечки',
  descending: 'Опаѓачки',
  
  // Chart & Analysis Terms
  chart: 'Графикон',
  priceChart: 'Графикон на цената',
  historicalData: 'Историски податоци',
  trend: 'Тренд',
  analysis: 'Анализа',
  
  // Numbers & Formatting
  thousands: 'илјади',
  millions: 'милиони',
  billions: 'милијарди',
  currency: 'ден.',
  
  // Time periods
  day: 'ден',
  week: 'недела',
  month: 'месец',
  year: 'година',
  
  // Status messages
  marketOpen: 'Пазарот е отворен',
  marketClosed: 'Пазарот е затворен',
  dataUpdating: 'Податоците се ажурираат...',
  connectionIssue: 'Проблем со конекцијата',
  
  // Common actions
  back: 'Назад',
  next: 'Следно',
  previous: 'Претходно',
  close: 'Затвори',
  open: 'Отвори',
  save: 'Зачувај',
  cancel: 'Откажи',
  confirm: 'Потврди',
  
  // Additional MSE specific terms
  mbi10: 'МБИ10',
  stockIndex: 'Берзански индекс',
  tradingVolume: 'Промет',
  sessionData: 'Податоци од седницата',
  dailyReport: 'Дневен извештај',
  
  // Stats and numbers
  min: 'Мин.',
  max: 'Макс.',
  avg: 'Просек',
  total: 'Вкупно',
  
  // Responsive design labels
  desktop: 'Десктоп',
  mobile: 'Мобилен',
  tablet: 'Таблет'
} as const

// Stock sector translations (common MSE sectors)
export const sectorMK = {
  banking: 'Банкарство',
  insurance: 'Осигурување',
  telecommunications: 'Телекомуникации',
  energy: 'Енергетика',
  manufacturing: 'Производство',
  retail: 'Трговија на мало',
  construction: 'Градежништво',
  transportation: 'Транспорт',
  agriculture: 'Земјоделство',
  technology: 'Технологија',
  pharmaceuticals: 'Фармацевтика',
  textiles: 'Текстил',
  chemicals: 'Хемиска индустрија',
  metals: 'Метали',
  food: 'Храна и пијалаци',
  other: 'Останато'
} as const

// Exchange specific terms
export const exchangeMK = {
  macedonianStockExchange: 'Македонска Берза',
  mse: 'МСЕ',
  officialMarket: 'Официјален пазар',
  freeMarket: 'Слободен пазар',
  bondMarket: 'Пазар на обврзници',
  listing: 'Котација',
  delisting: 'Исклучување од котација',
  suspension: 'Суспензија',
  tradingSession: 'Берзанска седница',
  openingPrice: 'Отворачка цена',
  closingPrice: 'Затворачка цена',
  tradingHours: 'Работни часови'
} as const