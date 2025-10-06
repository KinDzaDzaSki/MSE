# MVP Specification Document
## MSE Stock Tracker - Minimum Viable Product

### 1. MVP Overview

**Goal:** Create a functional, modern alternative to mse.mk that provides real-time stock data visualization with a superior user experience.

**Timeline:** 4-6 weeks  
**Target Launch:** November 15, 2025  

### 2. Core MVP Features

#### 2.1 Essential Features (Must Have)

**Dashboard & Stock Listing:**
- Real-time stock prices for all MSE-listed companies
- Current price, change amount, and change percentage
- Trading volume display
- Market status indicator (open/closed)
- Last updated timestamp

**Search & Navigation:**
- Stock symbol and company name search
- Alphabetical sorting
- Basic filtering (gainers/losers/most active)
- Individual stock detail pages

**Data Visualization:**
- Simple line charts for price movement (daily view)
- Basic market overview with summary statistics
- Responsive design for mobile and desktop

**Real-time Updates:**
- Automatic data refresh every 30 seconds during market hours
- Visual indicators for data freshness
- Loading states and error handling

#### 2.2 Nice-to-Have Features (Phase 2)

- Candlestick charts
- Historical data views (7D, 1M, 3M)
- Watchlist functionality
- Dark/light theme toggle
- Stock comparison tools

#### 2.3 Features NOT in MVP

- User authentication/accounts
- Portfolio tracking
- Price alerts
- News integration
- Advanced technical indicators
- Export functionality

### 3. Technical MVP Requirements

#### 3.1 Frontend MVP Stack

```json
{
  "framework": "Next.js 14",
  "language": "TypeScript",
  "styling": "Tailwind CSS",
  "components": "shadcn/ui (minimal set)",
  "charts": "Recharts",
  "state": "React useState/useEffect (no complex state management)",
  "data-fetching": "Native fetch with custom hooks"
}
```

#### 3.2 Backend MVP Stack

```json
{
  "api": "Next.js API Routes",
  "database": "PostgreSQL (Supabase free tier)",
  "caching": "In-memory caching (no Redis initially)",
  "scraping": "Puppeteer",
  "scheduling": "Vercel Cron Jobs",
  "hosting": "Vercel"
}
```

#### 3.3 MVP Database Schema (Simplified)

```sql
-- Companies table
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Current stock prices (single record per stock)
CREATE TABLE current_prices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) UNIQUE,
  price DECIMAL(15,4) NOT NULL,
  change_amount DECIMAL(15,4),
  change_percent DECIMAL(8,4),
  volume BIGINT DEFAULT 0,
  timestamp TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Daily price history (for charts)
CREATE TABLE daily_prices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  date DATE NOT NULL,
  open_price DECIMAL(15,4),
  close_price DECIMAL(15,4),
  high_price DECIMAL(15,4),
  low_price DECIMAL(15,4),
  volume BIGINT DEFAULT 0,
  UNIQUE(company_id, date)
);
```

### 4. MVP User Stories

#### 4.1 Primary User Stories

**As a stock investor, I want to:**

1. **View all MSE stocks in one place**
   - See current prices, changes, and volumes
   - Identify gainers and losers quickly
   - Access information on both desktop and mobile

2. **Search for specific stocks**
   - Find stocks by symbol (e.g., "ALK")
   - Find stocks by company name (e.g., "Alkaloid")
   - Get instant search results

3. **See detailed stock information**
   - View individual stock pages
   - See basic price charts
   - Access current trading data

4. **Monitor real-time changes**
   - See live price updates
   - Know when data was last refreshed
   - Understand market status

#### 4.2 Acceptance Criteria

**Homepage:**
- [ ] Displays all MSE stocks in a table/grid format
- [ ] Shows symbol, name, current price, change, volume
- [ ] Updates automatically every 30 seconds
- [ ] Loads in under 3 seconds
- [ ] Works on mobile devices

**Search Functionality:**
- [ ] Search box in header
- [ ] Filters results as user types
- [ ] Searches both symbol and company name
- [ ] Shows "no results" message when appropriate

**Stock Detail Page:**
- [ ] Accessible via clicking on stock in main list
- [ ] Shows company information
- [ ] Displays basic line chart of daily price movement
- [ ] Shows current trading statistics

**Real-time Updates:**
- [ ] Data refreshes without page reload
- [ ] Shows loading indicators during updates
- [ ] Displays last updated timestamp
- [ ] Handles offline/error states gracefully

### 5. MVP Architecture

#### 5.1 Simplified Data Flow

```
MSE Website → Puppeteer Scraper → PostgreSQL → Next.js API → React Frontend
     ↓              ↓               ↓             ↓            ↓
   HTML Pages → Data Extraction → Database → JSON API → User Interface
```

#### 5.2 MVP File Structure

```
mse-tracker/
├── app/                    # Next.js 14 app directory
│   ├── page.tsx           # Homepage (stock listing)
│   ├── stock/
│   │   └── [symbol]/
│   │       └── page.tsx   # Stock detail page
│   ├── api/
│   │   ├── stocks/
│   │   │   ├── route.ts   # GET all stocks
│   │   │   └── [symbol]/
│   │   │       └── route.ts  # GET single stock
│   │   └── scrape/
│   │       └── route.ts   # Scraping endpoint (cron)
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                # Basic UI components
│   ├── StockList.tsx      # Main stock listing
│   ├── StockCard.tsx      # Individual stock display
│   ├── StockChart.tsx     # Simple line chart
│   └── SearchBar.tsx      # Search functionality
├── lib/
│   ├── database.ts        # Database utilities
│   ├── scraper.ts         # MSE scraping logic
│   └── types.ts           # TypeScript interfaces
├── hooks/
│   ├── useStocks.ts       # Stock data fetching
│   └── useSearch.ts       # Search functionality
└── utils/
    ├── formatters.ts      # Number/date formatting
    └── constants.ts       # App constants
```

### 6. MVP Implementation Plan

#### Week 1: Project Setup & Core Infrastructure

**Days 1-2: Project Initialization**
- [ ] Create Next.js project with TypeScript
- [ ] Set up Tailwind CSS and basic UI components
- [ ] Configure Supabase database
- [ ] Set up basic project structure

**Days 3-4: Database & Scraping**
- [ ] Create database schema
- [ ] Implement MSE scraper with Puppeteer
- [ ] Create API endpoints for data ingestion
- [ ] Test scraping and data storage

**Days 5-7: Basic API Development**
- [ ] Implement `/api/stocks` endpoint
- [ ] Implement `/api/stocks/[symbol]` endpoint
- [ ] Add basic error handling
- [ ] Test API responses

#### Week 2: Frontend Development

**Days 8-10: Main Interface**
- [ ] Create homepage layout
- [ ] Implement stock listing component
- [ ] Add search functionality
- [ ] Style with Tailwind CSS

**Days 11-12: Stock Detail Pages**
- [ ] Create dynamic stock detail pages
- [ ] Implement basic line charts
- [ ] Add navigation between pages

**Days 13-14: Real-time Updates**
- [ ] Implement polling for real-time data
- [ ] Add loading states and error handling
- [ ] Test update functionality

#### Week 3: Integration & Testing

**Days 15-17: End-to-End Integration**
- [ ] Connect frontend with API
- [ ] Implement search with API integration
- [ ] Add proper error boundaries
- [ ] Test complete user flows

**Days 18-19: Mobile Optimization**
- [ ] Ensure responsive design
- [ ] Optimize for mobile performance
- [ ] Test on various devices

**Days 20-21: Performance & Polish**
- [ ] Optimize loading times
- [ ] Add proper meta tags for SEO
- [ ] Improve visual design

#### Week 4: Testing & Deployment

**Days 22-24: Testing**
- [ ] Manual testing of all features
- [ ] Cross-browser testing
- [ ] Performance testing
- [ ] Fix critical bugs

**Days 25-26: Deployment Preparation**
- [ ] Set up Vercel deployment
- [ ] Configure environment variables
- [ ] Set up domain (if applicable)
- [ ] Configure Vercel Cron for scraping

**Days 27-28: Launch & Monitoring**
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Gather initial user feedback
- [ ] Plan Phase 2 features

### 7. MVP Success Metrics

#### 7.1 Technical Metrics

- **Page Load Time:** < 3 seconds
- **Data Freshness:** Updated every 30 seconds during market hours
- **Uptime:** > 99% during market hours
- **Mobile Performance:** Lighthouse score > 80

#### 7.2 User Experience Metrics

- **Bounce Rate:** < 50%
- **Session Duration:** > 2 minutes average
- **Search Usage:** > 30% of sessions include search
- **Mobile Traffic:** > 50% of total traffic

#### 7.3 Launch Goals (First Month)

- **Unique Visitors:** 100+ per day
- **Daily Active Users:** 20+
- **Page Views per Session:** 3+
- **Error Rate:** < 5%

### 8. MVP Constraints & Limitations

#### 8.1 Known Limitations

- **Historical Data:** Limited to current day only
- **Charts:** Basic line charts only
- **User Features:** No accounts or personalization
- **Alerts:** No price notifications
- **API Rate Limiting:** Basic rate limiting only

#### 8.2 Technical Constraints

- **Database:** Supabase free tier (500MB storage)
- **Hosting:** Vercel hobby plan
- **Scraping:** Single instance, no redundancy
- **Caching:** In-memory only, no Redis

#### 8.3 Content Limitations

- **Data Source:** MSE website only
- **Languages:** English only initially
- **Market Coverage:** MSE stocks only
- **News:** No news integration

### 9. Post-MVP Roadmap

#### Phase 2 Enhancements (Weeks 5-8)
- Historical data and advanced charts
- Watchlist functionality
- Dark theme support
- Performance optimizations

#### Phase 3 Features (Weeks 9-12)
- User accounts and authentication
- Portfolio tracking
- Price alerts
- News integration

#### Future Considerations
- Mobile app development
- API for third-party developers
- Advanced analytics and insights
- Multi-language support

---

**Document Version:** 1.0  
**Last Updated:** October 6, 2025  
**Next Review:** October 13, 2025