const TOKEN_DECIMALS = 6n;
const TOKEN_SCALAR = 10n ** TOKEN_DECIMALS;

export function formatAddress(value: string): string {
  if (!value) return '';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatDateTime(timestampInSeconds: number): string {
  if (!timestampInSeconds) return 'Unknown time';
  const date = new Date(timestampInSeconds * 1000);
  return date.toLocaleString();
}

export function parseAmountInput(rawValue: string): bigint {
  const value = rawValue.trim();
  if (!value) {
    throw new Error('Amount required');
  }
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Invalid amount');
  }
  const [wholePart, fractionPart = ''] = value.split('.');
  const normalizedFraction = (fractionPart + '000000').slice(0, Number(TOKEN_DECIMALS));
  return BigInt(wholePart) * TOKEN_SCALAR + BigInt(normalizedFraction);
}

export function formatTokenAmount(input: string | bigint): string {
  const value = typeof input === 'bigint' ? input : BigInt(input);
  const whole = value / TOKEN_SCALAR;
  const fraction = (value % TOKEN_SCALAR).toString().padStart(Number(TOKEN_DECIMALS), '0');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}
