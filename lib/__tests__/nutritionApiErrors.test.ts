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

// SDK 56+ installs expo/fetch as globalThis.fetch. It rejects with its own
// FetchError (a plain Error, "fetch failed: <native reason>"), not RN's
// TypeError, so the offline save queue must recognize that shape too. Load the
// real class so a format change in expo fails here instead of on device.
const expoFetch: any = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../node_modules/expo/src/winter/fetch/FetchErrors.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: expoFetch, Error,
});

test('expo/fetch transport failures queue saves; its cancel/abort does not', () => {
  const { FetchError } = expoFetch;
  assert.equal(exports.isRetryableNutritionError(new FetchError('The Internet connection appears to be offline.')), true);
  assert.equal(exports.isRetryableNutritionError(FetchError.createFromError(new Error('The request timed out.'))), true);
  assert.equal(exports.isRetryableNutritionError(new FetchError('Fetch request has been canceled')), false);
  assert.equal(exports.isRetryableNutritionError(new FetchError('The operation was aborted.')), false);
});
