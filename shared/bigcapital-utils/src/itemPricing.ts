export interface ItemPricingValues {
  costPrice?: number | string | null;
  sellPrice?: number | string | null;
  markupPercentage?: number | string | null;
  autoIncreaseSellPrice?: boolean | number | string;
  sellable?: boolean | number;
  purchasable?: boolean | number;
}

function numberValue(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundPrice(value: number): number {
  return Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
}

export function isAutoPricingEnabled(value: unknown): boolean {
  return (
    value == null ||
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

export function deriveItemMarkup(cost: unknown, sell: unknown): number | null {
  const costValue = numberValue(cost);
  const sellValue = numberValue(sell);
  return costValue != null &&
    costValue > 0 &&
    sellValue != null &&
    sellValue >= 0
    ? Math.round((sellValue / costValue - 1) * 100 * 1e8) / 1e8
    : null;
}

/** Preserve the target through automatic cost changes, including cost decreases. */
export function getItemPricingUpdate(
  previous: ItemPricingValues,
  next: ItemPricingValues,
  masterEnabled: boolean,
): { markupPercentage: number | null; sellPrice?: number } {
  const oldCost = numberValue(previous.costPrice);
  const oldSell = numberValue(previous.sellPrice);
  const cost = numberValue(
    next.costPrice === undefined ? previous.costPrice : next.costPrice,
  );
  const manualSell = numberValue(next.sellPrice);
  const suppliedMarkup = numberValue(next.markupPercentage);
  const oldMarkup =
    numberValue(previous.markupPercentage) ??
    deriveItemMarkup(oldCost, oldSell);
  const priceChanged =
    manualSell != null && manualSell >= 0 && manualSell !== oldSell;
  const target =
    suppliedMarkup ??
    (priceChanged ? deriveItemMarkup(cost, manualSell) : oldMarkup);
  const result: { markupPercentage: number | null; sellPrice?: number } = {
    markupPercentage: target,
  };
  if (
    priceChanged ||
    cost == null ||
    cost < 0 ||
    target == null ||
    target < -100
  )
    return result;

  const manualMarkupChanged =
    suppliedMarkup != null && suppliedMarkup !== oldMarkup;
  const enabled =
    masterEnabled &&
    isAutoPricingEnabled(
      next.autoIncreaseSellPrice ?? previous.autoIncreaseSellPrice,
    ) &&
    isAutoPricingEnabled(next.sellable ?? previous.sellable) &&
    isAutoPricingEnabled(next.purchasable ?? previous.purchasable);
  const costIncreased = oldCost != null && oldCost > 0 && cost > oldCost;
  if (manualMarkupChanged || (enabled && costIncreased)) {
    const price = roundPrice(cost * (1 + target / 100));
    if (Number.isFinite(price))
      result.sellPrice = manualMarkupChanged
        ? price
        : Math.max(oldSell ?? 0, price);
  }
  return result;
}
