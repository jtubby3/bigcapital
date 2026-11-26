const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(__dirname + '/pageGroups.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'module', compiled)(mod.exports, mod);
const { parsePageGroups } = mod.exports;
assert.deepEqual(parsePageGroups('1, 2\n3\n4,5', 5), [[1, 2], [3], [4, 5]]);
assert.deepEqual(parsePageGroups('3,1\n2', 3), [[1, 3], [2]]);
for (const value of [
  '1,2\n2,3',
  '1\n3',
  '0,1,2,3',
  '1.5,2,3',
  '1,2,4',
  '1,2\n',
  '',
  '1,,2,3',
  '1e0,2,3',
]) {
  assert.throws(() => parsePageGroups(value, 3), undefined, value);
}
assert.throws(() => parsePageGroups('1', 0));
console.log(
  'Page grouping checks passed: complete partitions, sorted pages, duplicates/missing/invalid pages rejected.',
);
