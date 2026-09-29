// Crypto symbols and names the sentence parser recognises (architecture 5.3). A symbol not listed here is read as a stock ticker
// unless it is part of a pair the user typed with a slash whose quote is a crypto or fiat code; the confirm step always shows the
// market and lets the user change it, so a missing symbol costs one tap, not a wrong figure.
export const CRYPTO_BASES = Object.freeze(new Set([
  'BTC', 'XBT', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'XDG', 'BNB', 'DOT', 'AVAX', 'LINK', 'LTC', 'BCH', 'MATIC', 'POL', 'ATOM', 'TRX', 'XLM', 'ETC', 'NEAR',
  'UNI', 'AAVE', 'ARB', 'OP', 'APT', 'SUI', 'INJ', 'FIL', 'ALGO', 'XMR', 'SHIB', 'PEPE', 'TON', 'HBAR', 'USDT', 'USDC',
]));

export const CRYPTO_NAMES = Object.freeze({
  bitcoin: 'BTC', ethereum: 'ETH', ether: 'ETH', solana: 'SOL', ripple: 'XRP', cardano: 'ADA', dogecoin: 'DOGE', litecoin: 'LTC', polkadot: 'DOT', chainlink: 'LINK',
});

export const FIAT = Object.freeze(new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNH', 'CNY']));
export const CRYPTO_QUOTES = Object.freeze(new Set(['USDT', 'USDC', 'BTC', 'ETH']));

// Symbols also accepted in lower case ("bought 0,2 eth at 2410"). Short symbols that are English words (link, dot, near, ton, uni, op)
// are accepted in capitals only.
export const LOWERCASE_OK = Object.freeze(new Set(['BTC', 'XBT', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'XDG', 'BNB', 'LTC', 'AVAX', 'MATIC', 'TRX', 'XLM', 'BCH', 'SHIB', 'USDT', 'USDC']));
