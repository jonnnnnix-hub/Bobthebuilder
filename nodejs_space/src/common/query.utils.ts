import { BadRequestException } from '@nestjs/common';

export function parseBooleanQuery(
  value: string | undefined,
  fieldName: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new BadRequestException(`${fieldName} must be "true" or "false"`);
}

export function parseIntegerQuery(
  value: string | undefined,
  fieldName: string,
  defaultValue: number,
  options?: { min?: number; max?: number },
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!/^-?\d+$/.test(value)) {
    throw new BadRequestException(`${fieldName} must be an integer`);
  }

  const parsed = Number.parseInt(value, 10);
  if (options?.min !== undefined && parsed < options.min) {
    throw new BadRequestException(
      `${fieldName} must be at least ${options.min}`,
    );
  }
  if (options?.max !== undefined && parsed > options.max) {
    throw new BadRequestException(
      `${fieldName} must be at most ${options.max}`,
    );
  }

  return parsed;
}

export function parseDateQuery(
  value: string | undefined,
  fieldName: string,
): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${fieldName} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid date`);
  }

  return parsed;
}

export function parseEnumQuery<T extends string>(
  value: string | undefined,
  fieldName: string,
  allowedValues: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (allowedValues.includes(value as T)) {
    return value as T;
  }

  throw new BadRequestException(
    `${fieldName} must be one of: ${allowedValues.join(', ')}`,
  );
}
