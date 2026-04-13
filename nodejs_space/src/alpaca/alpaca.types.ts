export interface AlpacaOrderRequest {
  symbol: string;
  qty?: string;
  notional?: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  time_in_force: 'day' | 'gtc';
  limit_price?: string;
  client_order_id?: string;
}

export interface StrategySelection {
  strategy:
    | 'long_call'
    | 'long_put'
    | 'short_call'
    | 'short_put'
    | 'straddle'
    | 'strangle';
  score: number;
  breakdown: Record<string, number>;
}
