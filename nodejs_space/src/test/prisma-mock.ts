import type { PrismaService } from '../prisma/prisma.service';

type DeepJestMocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? jest.Mock<R, A>
    : T[K] extends object
      ? DeepJestMocked<T[K]>
      : T[K];
};

export type MockedPrisma = DeepJestMocked<PrismaService> & PrismaService;
