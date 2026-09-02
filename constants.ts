
import { Currency } from './types/entities';

export const EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.9,
  GBP: 0.8,
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export const STORAGE_KEYS = {
  USERS: 'surgero_users',
  CURRENT_USER: 'surgero_currentUser',
  TREATMENTS: 'surgero_treatments',
  ADDONS: 'surgero_addons',
  QUOTES: 'surgero_quotes',
  DOCTORS: 'surgero_doctors',
};
