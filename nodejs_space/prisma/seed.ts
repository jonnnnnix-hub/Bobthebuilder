import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UNIVERSE_SYMBOLS = [
  // Mega-cap Tech (15)
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Technology' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology' },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology' },
  { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Technology' },
  { symbol: 'ORCL', name: 'Oracle Corporation', sector: 'Technology' },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology' },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Technology' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology' },
  { symbol: 'QCOM', name: 'Qualcomm Inc.', sector: 'Technology' },

  // Financials (12)
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Financials' },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'Financials' },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financials' },
  { symbol: 'WFC', name: 'Wells Fargo', sector: 'Financials' },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'Financials' },
  { symbol: 'BLK', name: 'BlackRock Inc.', sector: 'Financials' },
  { symbol: 'SCHW', name: 'Charles Schwab', sector: 'Financials' },
  { symbol: 'AXP', name: 'American Express', sector: 'Financials' },
  { symbol: 'USB', name: 'U.S. Bancorp', sector: 'Financials' },
  { symbol: 'PNC', name: 'PNC Financial Services', sector: 'Financials' },
  { symbol: 'COF', name: 'Capital One Financial', sector: 'Financials' },

  // Healthcare (10)
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare' },
  { symbol: 'MRK', name: 'Merck & Co.', sector: 'Healthcare' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare' },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Healthcare' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb', sector: 'Healthcare' },
  { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'Healthcare' },
  { symbol: 'GILD', name: 'Gilead Sciences', sector: 'Healthcare' },
  { symbol: 'MDT', name: 'Medtronic plc', sector: 'Healthcare' },

  // Consumer (10)
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer' },
  { symbol: 'COST', name: 'Costco Wholesale', sector: 'Consumer' },
  { symbol: 'HD', name: 'Home Depot', sector: 'Consumer' },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', sector: 'Consumer' },
  { symbol: 'NKE', name: 'Nike Inc.', sector: 'Consumer' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', sector: 'Consumer' },
  { symbol: 'TGT', name: 'Target Corporation', sector: 'Consumer' },
  { symbol: 'LOW', name: 'Lowe\'s Companies', sector: 'Consumer' },
  { symbol: 'DIS', name: 'Walt Disney Company', sector: 'Consumer' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer' },

  // Energy (8)
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy' },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy' },
  { symbol: 'SLB', name: 'Schlumberger', sector: 'Energy' },
  { symbol: 'EOG', name: 'EOG Resources', sector: 'Energy' },
  { symbol: 'MPC', name: 'Marathon Petroleum', sector: 'Energy' },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'Energy' },
  { symbol: 'VLO', name: 'Valero Energy', sector: 'Energy' },

  // Industrials (8)
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials' },
  { symbol: 'BA', name: 'Boeing Company', sector: 'Industrials' },
  { symbol: 'DE', name: 'Deere & Company', sector: 'Industrials' },
  { symbol: 'UPS', name: 'United Parcel Service', sector: 'Industrials' },
  { symbol: 'HON', name: 'Honeywell International', sector: 'Industrials' },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials' },
  { symbol: 'RTX', name: 'RTX Corporation', sector: 'Industrials' },
  { symbol: 'LMT', name: 'Lockheed Martin', sector: 'Industrials' },

  // ETFs - Broad Market (12)
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', sector: 'ETF-Broad' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', sector: 'ETF-Broad' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', sector: 'ETF-Broad' },
  { symbol: 'DIA', name: 'SPDR Dow Jones ETF', sector: 'ETF-Broad' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', sector: 'ETF-Broad' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', sector: 'ETF-Broad' },
  { symbol: 'RSP', name: 'Invesco S&P 500 Equal Weight ETF', sector: 'ETF-Broad' },
  { symbol: 'MDY', name: 'SPDR S&P MidCap 400 ETF', sector: 'ETF-Broad' },
  { symbol: 'SPYG', name: 'SPDR Portfolio S&P 500 Growth ETF', sector: 'ETF-Broad' },
  { symbol: 'SPYV', name: 'SPDR Portfolio S&P 500 Value ETF', sector: 'ETF-Broad' },
  { symbol: 'VTV', name: 'Vanguard Value ETF', sector: 'ETF-Broad' },
  { symbol: 'VUG', name: 'Vanguard Growth ETF', sector: 'ETF-Broad' },

  // ETFs - Sector (10)
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR', sector: 'ETF-Sector' },
  { symbol: 'XLC', name: 'Communication Services Select Sector SPDR', sector: 'ETF-Sector' },

  // ETFs - Volatility/Leveraged (8)
  { symbol: 'VXX', name: 'iPath Series B S&P 500 VIX Short-Term Futures ETN', sector: 'ETF-Volatility' },
  { symbol: 'UVXY', name: 'ProShares Ultra VIX Short-Term Futures ETF', sector: 'ETF-Volatility' },
  { symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ', sector: 'ETF-Volatility' },
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ', sector: 'ETF-Volatility' },
  { symbol: 'SPXS', name: 'Direxion Daily S&P 500 Bear 3X Shares', sector: 'ETF-Volatility' },
  { symbol: 'SPXL', name: 'Direxion Daily S&P 500 Bull 3X Shares', sector: 'ETF-Volatility' },
  { symbol: 'TZA', name: 'Direxion Daily Small Cap Bear 3X Shares', sector: 'ETF-Volatility' },
  { symbol: 'TNA', name: 'Direxion Daily Small Cap Bull 3X Shares', sector: 'ETF-Volatility' },

  // Commodities/Other (8)
  { symbol: 'GLD', name: 'SPDR Gold Shares', sector: 'Commodities' },
  { symbol: 'SLV', name: 'iShares Silver Trust', sector: 'Commodities' },
  { symbol: 'USO', name: 'United States Oil Fund', sector: 'Commodities' },
  { symbol: 'GDX', name: 'VanEck Gold Miners ETF', sector: 'Commodities' },
  { symbol: 'BITO', name: 'ProShares Bitcoin Strategy ETF', sector: 'Commodities' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', sector: 'Commodities' },
  { symbol: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', sector: 'Commodities' },
  { symbol: 'LQD', name: 'iShares iBoxx Investment Grade Corporate Bond ETF', sector: 'Commodities' },

  // Additional High-Volume (7)
  { symbol: 'COIN', name: 'Coinbase Global', sector: 'Other' },
  { symbol: 'MARA', name: 'Marathon Digital', sector: 'Other' },
  { symbol: 'RIOT', name: 'Riot Platforms', sector: 'Other' },
  { symbol: 'SQ', name: 'Block Inc.', sector: 'Other' },
  { symbol: 'PYPL', name: 'PayPal Holdings', sector: 'Other' },
  { symbol: 'ROKU', name: 'Roku Inc.', sector: 'Other' },
  { symbol: 'SNAP', name: 'Snap Inc.', sector: 'Other' },
];

const DEFAULT_CONFIG = [
  { key: 'top_n_candidates', value: '5', description: 'Number of top signal candidates to select' },
  { key: 'vrp_threshold_percentile', value: '95', description: 'VRP20 percentile threshold for signal generation' },
  { key: 'iv_z_threshold_percentile', value: '92.5', description: 'IV z-score percentile threshold for signal generation' },
];

async function main() {
  console.log(`Seeding ${UNIVERSE_SYMBOLS.length} universe symbols...`);
  for (const sym of UNIVERSE_SYMBOLS) {
    await prisma.universe.upsert({
      where: { symbol: sym.symbol },
      update: { name: sym.name, sector: sym.sector, active: true },
      create: { symbol: sym.symbol, name: sym.name, sector: sym.sector, active: true },
    });
  }
  console.log(`Seeded ${UNIVERSE_SYMBOLS.length} symbols.`);

  console.log('Seeding default configuration...');
  for (const cfg of DEFAULT_CONFIG) {
    await prisma.configuration.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value, description: cfg.description },
      create: { key: cfg.key, value: cfg.value, description: cfg.description },
    });
  }
  console.log(`Seeded ${DEFAULT_CONFIG.length} config entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
