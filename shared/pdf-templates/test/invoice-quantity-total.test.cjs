const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  renderInvoicePaperTemplateHtml,
  renderPackingSlipPaperTemplateHtml,
  formatTotalQuantity,
} = require("../dist/components.umd.js");
const renders = {
  invoice: renderInvoicePaperTemplateHtml,
  packing: renderPackingSlipPaperTemplateHtml,
};
const lines = [
  {
    item: "Cartons",
    quantity: "1,200.00",
    quantityValue: 1200.125,
    rate: "$10.00",
    total: "$12,001.25",
  },
  {
    item: "Cases",
    quantity: "2.50",
    quantityValue: 2.5,
    rate: "$20.00",
    total: "$50.00",
  },
];
const total = (html) =>
  html.match(/<span data-total-quantity-value="true">(.*?)<\/span>/)?.[1];
for (const [name, render] of Object.entries(renders)) {
  for (const layoutMode of ["standard", "designer", "distribution"]) {
    test(`${name} ${layoutMode}: total is opt-in, uses raw quantities and leaves amounts and lines unchanged`, () => {
      const attrs = {
        lines: structuredClone(lines),
        layoutMode,
        subtotal: "$12,051.25",
        total: "$12,051.25",
        dueAmount: "$12,051.25",
      };
      const snapshot = structuredClone(attrs);
      const off = render(attrs),
        on = render({ ...attrs, showTotalQuantity: true });
      assert.equal(total(off), undefined);
      assert.equal(total(on), "1,202.625");
      assert.equal((on.match(/data-quantity-total="true"/g) || []).length, 1);
      assert.ok(on.indexOf("data-quantity-total") > on.indexOf(">Cases<"));
      assert.deepEqual(attrs, snapshot);
      const financialTokens = (html) => html.match(/\$[\d,.]+/g) || [];
      assert.deepEqual(financialTokens(on), financialTokens(off));
      if (name === "packing") assert.deepEqual(financialTokens(on), []);
      assert.equal(
        total(render({ ...attrs, showTotalQuantity: false })),
        undefined,
      );
    });
  }
}
test("total follows the quantity column when it is first, last or the only visible column", () => {
  for (const order of [
    ["quantity", "item", "rate", "total", "discount"],
    ["total", "rate", "item", "discount", "quantity"],
  ]) {
    const html = renderInvoicePaperTemplateHtml({
      lines,
      showTotalQuantity: true,
      lineColumns: order,
      showLineDiscount: true,
      descriptionPlacement: "separate",
    });
    const footer = html.match(/<tfoot.*?<\/tfoot>/)[0];
    assert.equal(total(html), "1,202.625");
    if (order[0] === "quantity") assert.match(footer, /font-size:0.85em/);
    else assert.match(footer, /<td colSpan="5"/);
  }
  assert.equal(
    total(
      renderInvoicePaperTemplateHtml({
        lines,
        showTotalQuantity: true,
        showLineItem: false,
        showLineRate: false,
        showLineTotal: false,
        showLineDescription: false,
      }),
    ),
    "1,202.625",
  );
  assert.equal(
    total(
      renderInvoicePaperTemplateHtml({
        lines,
        showTotalQuantity: true,
        showLineQuantity: false,
      }),
    ),
    undefined,
  );
  assert.equal(
    total(
      renderPackingSlipPaperTemplateHtml({
        lines,
        showTotalQuantity: true,
        showLineQuantity: false,
      }),
    ),
    "1,202.625",
  );
});
test("handles grouped, fractional, zero, empty and invalid quantities without floating point noise", () => {
  assert.equal(
    formatTotalQuantity([
      "1,200.125",
      "2.5",
      0,
      null,
      undefined,
      "",
      NaN,
      Infinity,
      "invalid",
    ]),
    "1,202.625",
  );
  assert.equal(formatTotalQuantity([0.1, 0.2]), "0.3");
  assert.equal(formatTotalQuantity([]), "0");
  assert.equal(
    total(
      renderInvoicePaperTemplateHtml({ lines: [], showTotalQuantity: true }),
    ),
    "0",
  );
});
test("long documents contain exactly one final quantity total and every line", () => {
  for (const render of Object.values(renders)) {
    const html = render({
      showTotalQuantity: true,
      layoutMode: "distribution",
      lines: Array.from({ length: 80 }, (_, i) => ({
        item: `ROW-${i}-END`,
        quantity: "2",
      })),
    });
    assert.equal(total(html), "160");
    assert.equal((html.match(/data-quantity-total="true"/g) || []).length, 1);
    for (let i = 0; i < 80; i++)
      assert.equal(html.split(`ROW-${i}-END`).length - 1, 1);
    assert.match(html, /<tfoot style="display:table-row-group"/);
  }
});
