const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_DATABASE_BYTES,
  hashPassword,
  sanitizeSegment,
  validateDatabaseArray,
} = require('../js/core/local-data-isolation-main.js');

test('uses the existing SHA-256 password contract for local authentication', () => {
  assert.equal(
    hashPassword('123'),
    'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'
  );
});

test('sanitizes professional storage directory identifiers', () => {
  assert.equal(sanitizeSegment('prof-001'), 'prof-001');
  assert.equal(sanitizeSegment('../prof 001/../../../'), 'prof001');
  assert.throws(() => sanitizeSegment('../../..'), /inválido/i);
});

test('rejects invalid local database payloads before disk persistence', () => {
  assert.deepEqual(validateDatabaseArray([83, 81, 76, 105, 116, 101]), [83, 81, 76, 105, 116, 101]);
  assert.throws(() => validateDatabaseArray([]), /inválido/i);
  assert.throws(() => validateDatabaseArray([256]), /inválido/i);
  assert.throws(() => validateDatabaseArray('not-an-array'), /inválido/i);
  assert.equal(MAX_DATABASE_BYTES, 128 * 1024 * 1024);
});