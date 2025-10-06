# MSE Stock Tracker

A modern, real-time stock tracking application for the Macedonian Stock Exchange (MSE) that provides a superior alternative to the official mse.mk website.

## 🚀 Features

- **Real-time Stock Data** - Live prices, changes, and trading volumes
- **Modern UI/UX** - Clean, responsive design that works on all devices
- **Advanced Charts** - Interactive price charts with multiple timeframes
- **Search & Filter** - Find stocks quickly by symbol or company name
- **Market Overview** - Comprehensive dashboard with market statistics
- **Mobile Optimized** - Fully responsive design for mobile trading

## 🛠️ Technology Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, PostgreSQL, Redis
- **Charts:** Recharts/Chart.js
- **Data Source:** Web scraping from MSE website
- **Deployment:** Vercel

## 📊 Data Sources

Since MSE doesn't provide a public API, we use web scraping to collect data from:
- Main MSE page: Real-time stock prices and market data
- Individual stock pages: Detailed company information
- Historical data endpoints: Price history and trading statistics
- Daily reports: Excel files with comprehensive market data

## 🏃‍♂️ Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL database
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/mse-stock-tracker.git
   cd mse-stock-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure your environment variables:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/mse_tracker
   REDIS_URL=redis://localhost:6379
   CRON_SECRET=your-secret-key
   ```

4. **Set up the database**
   ```bash
   npm run db:setup
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000`

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run db:setup` - Set up database schema
- `npm run scrape` - Manual data scraping

### Project Structure

```
├── app/                    # Next.js 14 app directory
│   ├── page.tsx           # Homepage
│   ├── stock/             # Stock detail pages
│   ├── api/               # API routes
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/                # Base UI components
│   ├── charts/            # Chart components
│   └── stocks/            # Stock-related components
├── lib/                   # Utility libraries
│   ├── database.ts        # Database utilities
│   ├── scraper.ts         # Web scraping logic
│   └── types.ts           # TypeScript types
├── docs/                  # Project documentation
│   ├── PRD.md             # Product Requirements Document
│   ├── TECHNICAL_SPEC.md  # Technical Specification
│   ├── MVP.md             # MVP Specification
│   └── SCRAPING_STRATEGY.md # Data Scraping Strategy
└── hooks/                 # Custom React hooks
```

## 📈 API Endpoints

- `GET /api/stocks` - Get all stocks with current prices
- `GET /api/stocks/[symbol]` - Get detailed stock information
- `GET /api/stocks/[symbol]/history` - Get historical price data
- `GET /api/market/overview` - Get market overview and statistics
- `POST /api/cron/scrape` - Trigger data scraping (internal)

## 🔒 Data Scraping Ethics

We follow ethical scraping practices:
- **Rate Limiting:** Maximum 1 request per 2 seconds
- **Respectful Hours:** Reduced frequency outside market hours
- **robots.txt Compliance:** Respects website guidelines
- **Fair Use:** Data used only for our application
- **No Redistribution:** Original data remains with MSE

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect to Vercel**
   ```bash
   npx vercel
   ```

2. **Configure environment variables**
   Set up your environment variables in Vercel dashboard

3. **Deploy**
   ```bash
   npx vercel --prod
   ```

### Self-Hosting

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the production server**
   ```bash
   npm run start
   ```

## 📋 Roadmap

### Phase 1 - MVP (Current)
- [x] Real-time stock data display
- [x] Basic search and filtering
- [x] Responsive design
- [x] Web scraping implementation
- [ ] Simple price charts

### Phase 2 - Enhanced Features
- [ ] Advanced charting with technical indicators
- [ ] Watchlist functionality
- [ ] Historical data views
- [ ] Dark theme support
- [ ] Performance optimizations

### Phase 3 - Advanced Features
- [ ] User accounts and authentication
- [ ] Portfolio tracking
- [ ] Price alerts and notifications
- [ ] News integration
- [ ] Mobile app

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use Tailwind CSS for styling
- Write tests for new features
- Follow conventional commit messages
- Update documentation for API changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This application is an independent project and is not affiliated with the Macedonian Stock Exchange (MSE). The data is scraped from publicly available sources and is provided for informational purposes only. Always verify important financial information with official sources.

## 📞 Support

If you encounter any issues or have questions:

1. Check the [documentation](./docs/)
2. Search existing [issues](https://github.com/yourusername/mse-stock-tracker/issues)
3. Create a new issue if needed

## 🙏 Acknowledgments

- Macedonian Stock Exchange for providing public market data
- Open source community for excellent tools and libraries
- Contributors who help improve this project

---

**Built with ❤️ for the Macedonian investment community**