import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UNIVERSE_SYMBOLS = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', sector: 'ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', sector: 'ETF' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', sector: 'ETF' },
  { symbol: 'DIA', name: 'SPDR Dow Jones ETF', sector: 'ETF' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', sector: 'ETF' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', sector: 'ETF' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', sector: 'ETF' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR', sector: 'ETF' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', sector: 'ETF' },
  { symbol: 'SLV', name: 'iShares Silver Trust', sector: 'ETF' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', sector: 'ETF' },
  { symbol: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', sector: 'ETF' },
  { symbol: 'USO', name: 'United States Oil Fund', sector: 'ETF' },
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology' },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication Services' },
  { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Technology' },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology' },
  { symbol: 'ORCL', name: 'Oracle Corporation', sector: 'Technology' },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology' },
  { symbol: 'QCOM', name: 'Qualcomm Inc.', sector: 'Technology' },
  { symbol: 'TXN', name: 'Texas Instruments', sector: 'Technology' },
  { symbol: 'MU', name: 'Micron Technology', sector: 'Technology' },
  { symbol: 'AMAT', name: 'Applied Materials', sector: 'Technology' },
  { symbol: 'LRCX', name: 'Lam Research', sector: 'Technology' },
  { symbol: 'KLAC', name: 'KLA Corporation', sector: 'Technology' },
  { symbol: 'SNPS', name: 'Synopsys Inc.', sector: 'Technology' },
  { symbol: 'PANW', name: 'Palo Alto Networks', sector: 'Technology' },
  { symbol: 'NOW', name: 'ServiceNow Inc.', sector: 'Technology' },
  { symbol: 'SHOP', name: 'Shopify Inc.', sector: 'Technology' },
  { symbol: 'SQ', name: 'Block Inc.', sector: 'Financials' },
  { symbol: 'PYPL', name: 'PayPal Holdings', sector: 'Financials' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financials' },
  { symbol: 'MA', name: 'Mastercard Inc.', sector: 'Financials' },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Financials' },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'Financials' },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financials' },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'Financials' },
  { symbol: 'WFC', name: 'Wells Fargo', sector: 'Financials' },
  { symbol: 'BLK', name: 'BlackRock Inc.', sector: 'Financials' },
  { symbol: 'SCHW', name: 'Charles Schwab', sector: 'Financials' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare' },
  { symbol: 'MRK', name: 'Merck & Co.', sector: 'Healthcare' },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Healthcare' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific', sector: 'Healthcare' },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb', sector: 'Healthcare' },
  { symbol: 'GILD', name: 'Gilead Sciences', sector: 'Healthcare' },
  { symbol: 'MRNA', name: 'Moderna Inc.', sector: 'Healthcare' },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Staples' },
  { symbol: 'COST', name: 'Costco Wholesale', sector: 'Consumer Staples' },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples' },
  { symbol: 'KO', name: 'Coca-Cola Company', sector: 'Consumer Staples' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Staples' },
  { symbol: 'HD', name: 'Home Depot', sector: 'Consumer Discretionary' },
  { symbol: 'LOW', name: 'Lowe\'s Companies', sector: 'Consumer Discretionary' },
  { symbol: 'NKE', name: 'Nike Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', sector: 'Consumer Discretionary' },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', sector: 'Consumer Discretionary' },
  { symbol: 'DIS', name: 'Walt Disney Company', sector: 'Communication Services' },
  { symbol: 'CMCSA', name: 'Comcast Corporation', sector: 'Communication Services' },
  { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication Services' },
  { symbol: 'VZ', name: 'Verizon Communications', sector: 'Communication Services' },
  { symbol: 'BA', name: 'Boeing Company', sector: 'Industrials' },
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials' },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials' },
  { symbol: 'UPS', name: 'United Parcel Service', sector: 'Industrials' },
  { symbol: 'RTX', name: 'RTX Corporation', sector: 'Industrials' },
  { symbol: 'HON', name: 'Honeywell International', sector: 'Industrials' },
  { symbol: 'DE', name: 'Deere & Company', sector: 'Industrials' },
  { symbol: 'LMT', name: 'Lockheed Martin', sector: 'Industrials' },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy' },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy' },
  { symbol: 'SLB', name: 'Schlumberger', sector: 'Energy' },
  { symbol: 'NEE', name: 'NextEra Energy', sector: 'Utilities' },
  { symbol: 'DUK', name: 'Duke Energy', sector: 'Utilities' },
  { symbol: 'SO', name: 'Southern Company', sector: 'Utilities' },
  { symbol: 'AMT', name: 'American Tower', sector: 'Real Estate' },
  { symbol: 'PLD', name: 'Prologis Inc.', sector: 'Real Estate' },
  { symbol: 'CCI', name: 'Crown Castle', sector: 'Real Estate' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway B', sector: 'Financials' },
  { symbol: 'COIN', name: 'Coinbase Global', sector: 'Financials' },
  { symbol: 'MARA', name: 'Marathon Digital', sector: 'Technology' },
  { symbol: 'RIOT', name: 'Riot Platforms', sector: 'Technology' },
  { symbol: 'PLTR', name: 'Palantir Technologies', sector: 'Technology' },
  { symbol: 'SOFI', name: 'SoFi Technologies', sector: 'Financials' },
  { symbol: 'UBER', name: 'Uber Technologies', sector: 'Technology' },
  { symbol: 'ABNB', name: 'Airbnb Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'SNOW', name: 'Snowflake Inc.', sector: 'Technology' },
  { symbol: 'DKNG', name: 'DraftKings Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'ROKU', name: 'Roku Inc.', sector: 'Communication Services' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings', sector: 'Technology' },
  { symbol: 'ZS', name: 'Zscaler Inc.', sector: 'Technology' },
  { symbol: 'MSTR', name: 'MicroStrategy', sector: 'Technology' },
  { symbol: 'ARM', name: 'Arm Holdings', sector: 'Technology' },
  { symbol: 'SMCI', name: 'Super Micro Computer', sector: 'Technology' },
];

const DEFAULT_CONFIG = [
  { key: 'top_n_candidates', value: '5', description: 'Number of top signal candidates to select' },
  { key: 'vrp_threshold_percentile', value: '94', description: 'VRP20 percentile threshold for signal generation, tuned from live diagnostics' },
  { key: 'iv_z_threshold_percentile', value: '91.5', description: 'IV z-score percentile threshold for signal generation, tuned from live diagnostics' },
  { key: 'portfolio_size', value: '100000', description: 'Reference portfolio size in USD' },
  { key: 'holding_period_days', value: '20', description: 'Theoretical holding period in days' },
];

async function main() {
  console.log('Seeding universe symbols...');
  await prisma.universe.createMany({
    data: UNIVERSE_SYMBOLS.map(sym => ({
      symbol: sym.symbol,
      name: sym.name,
      sector: sym.sector,
      active: true,
    })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${UNIVERSE_SYMBOLS.length} symbols.`);

  console.log('Seeding default configuration...');
  await prisma.configuration.createMany({
    data: DEFAULT_CONFIG,
    skipDuplicates: true,
  });
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
