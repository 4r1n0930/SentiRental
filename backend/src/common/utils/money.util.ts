export function toMoneyString(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

export function addMoney(a: unknown, b: unknown): string {
  return (Number(toMoneyString(a)) + Number(toMoneyString(b))).toFixed(2);
}

export function isPositiveMoney(value: unknown): boolean {
  return Number(toMoneyString(value)) > 0;
}

export function isNonNegativeMoney(value: unknown): boolean {
  return Number(toMoneyString(value)) >= 0;
}
