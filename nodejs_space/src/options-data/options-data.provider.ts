import { DataFreshnessTier, OptionsProviderSnapshotResult } from './types.js';

export interface OptionsDataProvider {
  readonly source: 'polygon' | 'orats';

  isConfigured(): boolean;

  fetchSnapshot(params: {
    symbol: string;
    asOf: Date;
    tier: DataFreshnessTier;
  }): Promise<OptionsProviderSnapshotResult>;
}
