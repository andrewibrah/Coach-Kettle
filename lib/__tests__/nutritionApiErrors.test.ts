import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports: any = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../nutrition.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports, Error, TypeError, require: () => ({}),
});
test('only transport failures queue saves, never validation or unknown errors', () => {
  assert.equal(typeof exports.isRetryableNutritionError, 'function');
  assert.equal(exports.isRetryableNutritionError(new TypeError('Network request failed')), true);
  assert.equal(exports.isRetryableNutritionError(new Error('HTTP 400: invalid targets')), false);
  assert.equal(exports.isRetryableNutritionError(new Error('Account changed')), false);
});
