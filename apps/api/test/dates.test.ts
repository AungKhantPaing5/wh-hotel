import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStay } from '../src/dates';

test('rejects impossible calendar dates', () => {
  assert.throws(() => validateStay('2099-02-30', '2099-03-02'));
});
test('rejects checkout before or equal to checkin', () => {
  assert.throws(() => validateStay('2099-02-20', '2099-02-20'));
  assert.throws(() => validateStay('2099-02-21', '2099-02-20'));
});
test('accepts adjacent stay dates', () => {
  assert.deepEqual(validateStay('2099-02-20', '2099-02-21'), ['2099-02-20', '2099-02-21']);
});
test('rejects excessive length and past dates', () => {
  assert.throws(() => validateStay('2099-01-01', '2099-03-01'));
  assert.throws(() => validateStay('2000-01-01', '2000-01-02'));
});
