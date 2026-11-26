/** Display-only sum; raw quantities avoid rounding each line before adding. */
export function formatTotalQuantity(
  quantities: readonly (number | string | null | undefined)[],
): string {
  const total = quantities.reduce<number>((sum, value) => {
    const quantity =
      typeof value === "string" ? Number(value.replace(/,/g, "")) : value;
    return typeof quantity === "number" && Number.isFinite(quantity)
      ? sum + quantity
      : sum;
  }, 0);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(
    total,
  );
}
