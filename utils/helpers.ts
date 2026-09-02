
import { CURRENCY_SYMBOLS, EXCHANGE_RATES } from '../constants';
import { Currency } from '../types/entities';

/**
 * Rounds a number to two decimal places.
 * @param value - The number to round.
 * @returns The rounded number.
 */
export const roundToTwoDecimals = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/**
 * Formats a USD value into a specified currency with its symbol.
 * @param amountUsd - The amount in USD.
 * @param currency - The target currency.
 * @param showSymbol - Whether to include the currency symbol.
 * @returns The formatted currency string.
 */
export const formatCurrency = (amountUsd: number, currency: Currency, showSymbol: boolean = true): string => {
  const rate = EXCHANGE_RATES[currency];
  const convertedAmount = roundToTwoDecimals(amountUsd * rate);
  const symbol = showSymbol ? CURRENCY_SYMBOLS[currency] : '';
  
  return `${symbol}${convertedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Generates a unique identifier.
 * @returns A UUID string.
 */
export const generateUUID = (): string => {
    return crypto.randomUUID();
};
   