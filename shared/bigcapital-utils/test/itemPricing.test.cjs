const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getItemPricingUpdate: update,
  deriveItemMarkup: markup,
  isAutoPricingEnabled,
} = require("../dist/index.js");
const item = {
  costPrice: 10,
  sellPrice: 12,
  markupPercentage: 20,
  autoIncreaseSellPrice: true,
  sellable: true,
  purchasable: true,
};
const nextItem = (old, next, master = true) => ({
  ...old,
  ...next,
  ...update(old, next, master),
});

test("raises $12 to $16.80 when cost rises $10 to $14, preserving 20%", () => {
  assert.deepEqual(update(item, { costPrice: 14 }, true), {
    markupPercentage: 20,
    sellPrice: 16.8,
  });
});
for (const master of [true, false])
  for (const enabled of [true, false]) {
    test(`master=${master}, item=${enabled}: require both switches`, () => {
      const result = nextItem(
        { ...item, autoIncreaseSellPrice: enabled },
        { costPrice: 14 },
        master,
      );
      assert.equal(result.sellPrice, master && enabled ? 16.8 : 12);
      assert.equal(result.costPrice, 14);
      assert.equal(result.markupPercentage, 20);
    });
  }
test("equal or falling cost holds selling price and target markup", () => {
  assert.deepEqual(update(item, { costPrice: 10 }, true), {
    markupPercentage: 20,
  });
  assert.deepEqual(update(item, { costPrice: 8 }, true), {
    markupPercentage: 20,
  });
});
test("fall then rise uses saved target and never lowers the held selling price", () => {
  const low = nextItem(item, { costPrice: 8 });
  const rebound = nextItem(low, { costPrice: 9 });
  assert.equal(rebound.sellPrice, 12);
  assert.equal(rebound.markupPercentage, 20);
  assert.equal(nextItem(rebound, { costPrice: 14 }).sellPrice, 16.8);
});
test("switching on does not retroactively reprice", () => {
  assert.deepEqual(
    update(
      { ...item, costPrice: 14, autoIncreaseSellPrice: false },
      { autoIncreaseSellPrice: true },
      true,
    ),
    { markupPercentage: 20 },
  );
});
test("explicit selling-price override remains available while master off", () => {
  const result = nextItem(item, { costPrice: 14, sellPrice: 21 }, false);
  assert.equal(result.sellPrice, 21);
  assert.equal(result.markupPercentage, 50);
});
test("unchanged selling price in a full payload is not a manual override", () => {
  assert.deepEqual(update(item, { ...item, costPrice: 14 }, true), {
    markupPercentage: 20,
    sellPrice: 16.8,
  });
});
test("explicit markup edit reprices manually even while master is off", () => {
  assert.deepEqual(update(item, { markupPercentage: 50 }, false), {
    markupPercentage: 50,
    sellPrice: 15,
  });
});
test("explicit saved percentage is not rederived from a rounded price", () => {
  assert.equal(
    update(
      item,
      { costPrice: 0.03, sellPrice: 0.04, markupPercentage: 20 },
      true,
    ).markupPercentage,
    20,
  );
});
test("zero cost cannot infer a target or automatically reprice", () => {
  assert.equal(markup(0, 12), null);
  assert.deepEqual(
    update(
      { ...item, costPrice: 0, markupPercentage: null },
      { costPrice: 14 },
      true,
    ),
    { markupPercentage: null },
  );
});
test("legacy items derive a target and missing switches default to enabled", () => {
  assert.deepEqual(
    update(
      { costPrice: "10", sellPrice: "12", sellable: 1, purchasable: 1 },
      { costPrice: "14" },
      true,
    ),
    { markupPercentage: 20, sellPrice: 16.8 },
  );
});
test("database false values are not truthy switches", () => {
  for (const value of [false, 0, "0", "false"]) {
    assert.equal(isAutoPricingEnabled(value), false);
    assert.equal(
      update({ ...item, autoIncreaseSellPrice: value }, { costPrice: 14 }, true)
        .sellPrice,
      undefined,
    );
  }
});
test("rounds half cents to cents", () => {
  assert.equal(
    update(
      { ...item, costPrice: 0.5, sellPrice: 0.6, markupPercentage: 0 },
      { costPrice: 1.005 },
      true,
    ).sellPrice,
    1.01,
  );
});
test("invalid costs never generate an automatic price", () => {
  for (const value of [null, "", -1, NaN, Infinity])
    assert.equal(update(item, { costPrice: value }, true).sellPrice, undefined);
});
test("non-purchasable or non-sellable items never automatically reprice", () => {
  assert.equal(
    update({ ...item, sellable: false }, { costPrice: 14 }, true).sellPrice,
    undefined,
  );
  assert.equal(
    update({ ...item, purchasable: false }, { costPrice: 14 }, true).sellPrice,
    undefined,
  );
});
