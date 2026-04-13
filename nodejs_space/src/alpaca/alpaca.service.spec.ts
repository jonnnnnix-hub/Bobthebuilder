import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AlpacaService } from './alpaca.service';

const axiosInstanceMock = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
};

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => axiosInstanceMock),
  },
}));

describe('AlpacaService', () => {
  const prismaMock = {
    alpaca_account: {
      upsert: jest.fn(),
    },
  } as unknown as jest.Mocked<PrismaService>;

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'ALPACA_API_KEY') return 'key';
      if (key === 'ALPACA_API_SECRET') return 'secret';
      if (key === 'ALPACA_PAPER_BASE_URL')
        return 'https://paper-api.alpaca.markets';
      return null;
    }),
  } as unknown as jest.Mocked<ConfigService>;

  let service: AlpacaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AlpacaService(configMock, prismaMock);
  });

  it('is configured when credentials exist', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('upserts account details on getAccount', async () => {
    axiosInstanceMock.get.mockResolvedValue({
      data: {
        id: 'acct-1',
        status: 'ACTIVE',
        currency: 'USD',
        equity: '100000',
        cash: '50000',
        buying_power: '200000',
      },
    });

    const account = await service.getAccount();
    expect(account.id).toBe('acct-1');
    expect(prismaMock.alpaca_account.upsert).toHaveBeenCalledTimes(1);
  });
});
