const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(`${__dirname}/salesOverview.ts`, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const helpers = { exports: {} };
new Function('exports', 'require', 'module', compiled)(
  helpers.exports,
  require,
  helpers,
);
const {
  salesOverviewShares,
  toggleSalesOverviewMetric,
  salesOverviewQueryPath,
} = helpers.exports;
assert.deepEqual(
  salesOverviewShares([
    { baseAmount: 300 },
    { baseAmount: 100 },
    { baseAmount: 0 },
  ]),
  [75, 25, 0],
);
assert.deepEqual(
  salesOverviewShares([{ baseAmount: -20 }, { baseAmount: 100 }]),
  [0, 100],
);
assert.deepEqual(
  salesOverviewShares([{ baseAmount: 0 }, { baseAmount: 0 }]),
  [0, 0],
);
assert.deepEqual(
  salesOverviewShares([{ baseAmount: NaN }, { baseAmount: Infinity }]),
  [0, 0],
);
assert.equal(toggleSalesOverviewMetric(undefined, 'overdue'), 'overdue');
assert.equal(toggleSalesOverviewMetric('overdue', 'overdue'), undefined);
assert.equal(toggleSalesOverviewMetric('overdue', 'paid'), 'paid');
const query = {
  page: 3,
  page_size: 20,
  inactive_mode: true,
  stringified_filter_roles: '[{"field":"name","value":"A & B"}]',
};
const params = new URLSearchParams(
  salesOverviewQueryPath(query, 'overdue').split('?')[1],
);
assert.equal(params.get('metric'), 'overdue');
assert.equal(params.get('page'), '3');
assert.equal(params.get('inactive_mode'), 'true');
assert.equal(
  params.get('stringified_filter_roles'),
  query.stringified_filter_roles,
);
assert.deepEqual(query, {
  page: 3,
  page_size: 20,
  inactive_mode: true,
  stringified_filter_roles: '[{"field":"name","value":"A & B"}]',
});
console.log(
  'Sales overview: amount proportions, empty/negative totals, metric toggles, and preserved query filters pass.',
);
