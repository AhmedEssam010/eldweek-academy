export function formatEgp(amount: number): string {
  return `${amount.toLocaleString("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ج.م`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("ar-EG");
}
