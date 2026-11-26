export function salesOverviewShares(
  metrics: { baseAmount: number }[],
): number[] {
  const amounts = metrics.map(({ baseAmount }) =>
    Number.isFinite(baseAmount) ? Math.max(0, baseAmount) : 0,
  );
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return amounts.map((amount) => (total > 0 ? (amount / total) * 100 : 0));
}

export function toggleSalesOverviewMetric(
  current: string | undefined,
  next: string,
): string | undefined {
  return current === next ? undefined : next;
}

export function salesOverviewQueryPath(
  query: Record<string, unknown>,
  metric: string,
): string {
  const params = new URLSearchParams({ metric });
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  return `customers?${params.toString()}`;
}
