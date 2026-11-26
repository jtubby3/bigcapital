const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = `${__dirname}/statementForm.ts`;
const compiled = ts.transpileModule(
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '',
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  },
).outputText;
const helpers = { exports: {} };
new Function('exports', 'require', 'module', compiled)(
  helpers.exports,
  require,
  helpers,
);
const {
  statementDates,
  statementPeriod,
  statementRecipients,
  validateStatementForm,
  statementTotals,
  customerStatementReturnTo,
  sendUnsentStatements,
} = helpers.exports;
assert.equal(
  typeof statementRecipients,
  'function',
  'Draft recipients normalize explicit per-statement email overrides',
);
assert.deepEqual(
  statementRecipients([2, 1, 3], {
    1: ' user@example.com ',
    2: ' ',
    4: 'unselected@example.com',
  }),
  [
    { customerId: 2, email: '' },
    { customerId: 1, email: 'user@example.com' },
    { customerId: 3, email: '' },
  ],
  'Clearing a statement email must override rather than restore the profile email',
);
assert.equal(
  typeof statementDates,
  'function',
  'Local statement date defaults must exist',
);
assert.deepEqual(statementDates(new Date(2026, 2, 31, 23, 30)), {
  statementDate: '2026-03-31',
  fromDate: '2026-02-28',
  toDate: '2026-03-31',
});
assert.deepEqual(statementDates(new Date(2024, 2, 31)), {
  statementDate: '2024-03-31',
  fromDate: '2024-02-29',
  toDate: '2024-03-31',
});
assert.equal(
  typeof statementPeriod,
  'function',
  'Statement type determines the effective date range',
);
const retainedRange = {
  statementDate: '2026-11-15',
  fromDate: '2026-09-01',
  toDate: '2026-10-31',
};
assert.deepEqual(
  statementPeriod('open-item', retainedRange),
  {
    statementDate: '2026-11-15',
    fromDate: '2026-11-15',
    toDate: '2026-11-15',
  },
  'Open Item uses statement date rather than a previously entered range',
);
for (const type of ['balance-forward', 'transaction']) {
  assert.deepEqual(
    statementPeriod(type, retainedRange),
    {
      statementDate: '2026-11-15',
      fromDate: '2026-09-01',
      toDate: '2026-10-31',
    },
    `${type} retains its entered period when switching back from Open Item`,
  );
}
assert.deepEqual(
  retainedRange,
  {
    statementDate: '2026-11-15',
    fromDate: '2026-09-01',
    toDate: '2026-10-31',
  },
  'Selecting Open Item must not overwrite retained range state',
);
assert.equal(
  validateStatementForm({
    ...statementPeriod('open-item', {
      statementDate: '2026-11-15',
      fromDate: '',
      toDate: 'invalid',
    }),
    recipients: [{ customerId: 1, email: '' }],
  }),
  undefined,
  'Hidden invalid range fields must not block Open Item actions',
);
const valid = {
  statementDate: '2026-11-15',
  fromDate: '2026-10-15',
  toDate: '2026-11-15',
  recipients: [{ customerId: 1, email: '' }],
};
assert.equal(
  validateStatementForm(valid),
  undefined,
  'Saving accepts missing email',
);
assert.match(
  validateStatementForm(valid, true),
  /email/i,
  'Sending requires recipient email',
);
assert.equal(
  validateStatementForm(
    { ...valid, recipients: [{ customerId: 1, email: ' valid@example.com ' }] },
    true,
  ),
  undefined,
);
assert.match(
  validateStatementForm({ ...valid, fromDate: '2026-11-16' }),
  /start/i,
);
assert.match(
  validateStatementForm({ ...valid, toDate: '2026-02-30' }),
  /date/i,
);
assert.match(validateStatementForm({ ...valid, recipients: [] }), /customer/i);
assert.match(
  validateStatementForm({
    ...valid,
    recipients: [{ customerId: 1, email: 'bad email' }],
  }),
  /email/i,
  'Nonblank invalid email is rejected before preview or save',
);
assert.match(
  validateStatementForm({
    ...valid,
    recipients: Array.from({ length: 101 }, (_, index) => ({
      customerId: index + 1,
    })),
  }),
  /100/,
  'Batch size respects the server limit',
);
assert.deepEqual(
  statementTotals([
    { currencyCode: 'USD', closingBalance: 10.25 },
    { currencyCode: 'CAD', closingBalance: 20 },
    { currencyCode: 'USD', closingBalance: -2.25 },
  ]),
  [
    { currencyCode: 'CAD', amount: 20 },
    { currencyCode: 'USD', amount: 8 },
  ],
);
const origin = {
  pathname: '/customers/12',
  search: '?tab=statements',
  state: { tab: 'statements' },
};
assert.equal(
  customerStatementReturnTo(origin),
  origin,
  'Origin customer state is preserved',
);
for (const pathname of [
  '//evil.example',
  '/invoices/1',
  '/customers/../admin',
  'https://evil.example',
  '/customers/new',
]) {
  assert.equal(customerStatementReturnTo({ pathname }), undefined);
}
(async () => {
  const attempts = [];
  const saved = [
    { id: 1, status: 'sent' },
    { id: 2, status: 'saved' },
    { id: 3, status: 'saved' },
  ];
  const result = await sendUnsentStatements(saved, async (id) => {
    attempts.push(id);
    if (id === 2) throw new Error('Mail unavailable');
    return { id, status: 'sent' };
  });
  assert.deepEqual(
    attempts,
    [2, 3],
    'Already delivered statements must never be resent',
  );
  assert.deepEqual(result.statements, [
    { id: 1, status: 'sent' },
    { id: 2, status: 'saved' },
    { id: 3, status: 'sent' },
  ]);
  assert.deepEqual(result.failedIds, [2]);
  const retried = await sendUnsentStatements(result.statements, async (id) => ({
    id,
    status: 'sent',
  }));
  assert.deepEqual(retried.failedIds, []);
  assert.equal(
    retried.statements.filter((item) => item.status === 'sent').length,
    3,
  );
  assert.equal(
    saved[2].status,
    'saved',
    'Delivery leaves original snapshot batch immutable',
  );
  console.log(
    'Statement form: local dates, validation, separate currencies, safe origin, and partial-send retry pass.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
