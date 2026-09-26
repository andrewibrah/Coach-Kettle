import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports: any = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../nutrition.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports, Error, TypeError, require: () => ({}),
});

// The "couldn't analyze" copy must not conflate a downed provider (OpenAI
// non-2xx/timeout -> the function's 502) or no network, an unreadable meal
// (the function's 400/413/422), and a missing deployment (platform 404) into
// one message.
test('classifies a downed provider as unavailable', () => {
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 502: {"error":"Nutrition analysis failed"}')), 'unavailable');
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 503: {"error":"Nutrition analysis is unavailable"}')), 'unavailable');
});

test('classifies the function rejecting malformed input/output as unreadable', () => {
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 400: {"error":"unsupported or invalid image data URL"}')), 'unreadable');
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 413: {"error":"image exceeds 6 MB"}')), 'unreadable');
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 422: {"error":"Could not read that meal"}')), 'unreadable');
});

test('classifies a platform 404 (function not deployed) as not_deployed', () => {
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 404: not found')), 'not_deployed');
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 404: {"code":"NOT_FOUND","message":"Requested function was not found"}')), 'not_deployed');
});

// Weak gym signal is the common case: offline, a fetch timeout, or an abort
// must say "check your connection", never "update the app".
test('classifies offline, timeout and abort as unavailable, not not_deployed', () => {
  assert.equal(exports.classifyNutritionAnalysisError(new TypeError('Network request failed')), 'unavailable');
  assert.equal(exports.classifyNutritionAnalysisError(new TypeError('Network request timed out')), 'unavailable');
  const abort = new Error('Aborted');
  abort.name = 'AbortError';
  assert.equal(exports.classifyNutritionAnalysisError(abort), 'unavailable');
  assert.match(exports.nutritionAnalysisErrorMessage(new TypeError('Network request failed'), 'text'), /temporarily unavailable.*connection/);
});

test('a 404 carrying the function\'s own JSON error body is not read as a missing deployment', () => {
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 404: {"error":"Analysis not found"}')), 'other');
});

test('falls back to other for anything unrecognized', () => {
  assert.equal(exports.classifyNutritionAnalysisError(new Error('HTTP 401: Unauthorized')), 'other');
  assert.equal(exports.classifyNutritionAnalysisError(new Error('boom')), 'other');
});

test('nutritionAnalysisErrorMessage gives a distinct, honest message per class', () => {
  const unavailable = exports.nutritionAnalysisErrorMessage(new Error('HTTP 502: x'), 'text');
  const unreadable = exports.nutritionAnalysisErrorMessage(new Error('HTTP 422: x'), 'text');
  const notDeployed = exports.nutritionAnalysisErrorMessage(new Error('HTTP 404: not found'), 'text');
  assert.notEqual(unavailable, unreadable);
  assert.notEqual(unavailable, notDeployed);
  assert.notEqual(unreadable, notDeployed);
});

// The 'other' fallback (e.g. a bare 401) is the one case with no honest class
// of its own; it must keep saying which capture mode failed, matching the
// mode-specific copy this replaced.
test('the other fallback restores per-mode wording', () => {
  const textMessage = exports.nutritionAnalysisErrorMessage(new Error('HTTP 401: nope'), 'text');
  const photoMessage = exports.nutritionAnalysisErrorMessage(new Error('HTTP 401: nope'), 'photo');
  assert.match(textMessage, /description/);
  assert.match(photoMessage, /photo/);
  assert.notEqual(textMessage, photoMessage);
});

// Confirm-branch failures (analysis-ID or catalog-exact) are a different
// shape from analyze failures: expired/already-confirmed, a conflicting RPC
// rejection, and the function's own validation must not collapse into one
// generic message, and a 404 from the function's "Analysis not found" body
// must read differently than a platform 404 for a missing deployment.
test('classifies an expired or already-confirmed analysis session', () => {
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 404: {"error":"Analysis not found"}')), 'expired');
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 410: {"error":"Analysis expired"}')), 'expired');
});

test('classifies a platform 404 (missing deployment) differently from the function\'s own not-found body', () => {
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 404: Cannot POST /functions/v1/nutrition-analyze')), 'not_deployed');
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 404: {"code":"NOT_FOUND","message":"Requested function was not found"}')), 'not_deployed');
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 404: {"error":"Something else"}')), 'other');
});

test('classifies confirm offline, timeout and abort as unavailable, not not_deployed', () => {
  assert.equal(exports.classifyNutritionConfirmError(new TypeError('Network request failed')), 'unavailable');
  assert.equal(exports.classifyNutritionConfirmError(new TypeError('Network request timed out')), 'unavailable');
  const abort = new Error('Aborted');
  abort.name = 'AbortError';
  assert.equal(exports.classifyNutritionConfirmError(abort), 'unavailable');
  assert.match(exports.nutritionConfirmErrorMessage(new TypeError('Network request failed')), /connection/);
});

test('classifies a confirm RPC conflict and the function\'s own validation separately', () => {
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 409: {"error":"Confirmation failed"}')), 'conflict');
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 400: {"error":"Invalid confirmation"}')), 'invalid');
});

test('classifies confirm infra trouble as unavailable, distinct from every other class', () => {
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 500: {"error":"Confirmation failed"}')), 'unavailable');
  assert.equal(exports.classifyNutritionConfirmError(new Error('HTTP 503: {"error":"Confirmation unavailable"}')), 'unavailable');
});

test('nutritionConfirmErrorMessage gives a distinct, honest message per class', () => {
  const messages = [
    exports.nutritionConfirmErrorMessage(new Error('HTTP 404: {"error":"Analysis not found"}')),
    exports.nutritionConfirmErrorMessage(new Error('HTTP 409: {"error":"Confirmation failed"}')),
    exports.nutritionConfirmErrorMessage(new Error('HTTP 400: {"error":"Invalid confirmation"}')),
    exports.nutritionConfirmErrorMessage(new Error('HTTP 500: x')),
    exports.nutritionConfirmErrorMessage(new Error('HTTP 404: {"code":"NOT_FOUND","message":"Requested function was not found"}')),
    exports.nutritionConfirmErrorMessage(new Error('HTTP 401: nope')),
  ];
  assert.equal(new Set(messages).size, messages.length, 'every confirm class must read differently');
});

// SDK 56+ global fetch is expo/fetch: offline and cancel reject with its
// FetchError ("fetch failed: <reason>"), which must still read as unavailable.
const expoFetch: any = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../node_modules/expo/src/winter/fetch/FetchErrors.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: expoFetch, Error,
});

test('classifies expo/fetch offline and cancel failures as unavailable', () => {
  const { FetchError } = expoFetch;
  assert.equal(exports.classifyNutritionAnalysisError(new FetchError('The Internet connection appears to be offline.')), 'unavailable');
  assert.equal(exports.classifyNutritionAnalysisError(new FetchError('Fetch request has been canceled')), 'unavailable');
  assert.equal(exports.classifyNutritionAnalysisError(new FetchError('The operation was aborted.')), 'unavailable');
  assert.equal(exports.classifyNutritionAnalysisError(new FetchError('The request timed out.')), 'unavailable');
  assert.equal(exports.classifyNutritionConfirmError(new FetchError('The request timed out.')), 'unavailable');
});
