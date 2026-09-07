const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const isolation = require('../js/core/local-data-isolation-main.js');

test('clinical files are rooted under the authenticated professional directory', () => {
  const userData = path.join(os.tmpdir(), 'plennus-test');
  const dir = isolation.professionalFilesDirectoryForIdentity(userData, 'prof-001');
  assert.equal(dir, path.join(userData, 'data', 'professionals', 'prof-001', 'files'));
});

test('managed professional path accepts only files owned by that professional', () => {
  const userData = path.join(os.tmpdir(), 'plennus-test');
  const own = path.join(userData, 'data', 'professionals', 'prof-a', 'files', 'file.pdf');
  const foreign = path.join(userData, 'data', 'professionals', 'prof-b', 'files', 'file.pdf');
  const legacy = path.join(userData, 'clinical-files', 'file.pdf');

  assert.equal(isolation.isManagedProfessionalClinicalPath(userData, 'prof-a', own), true);
  assert.equal(isolation.isManagedProfessionalClinicalPath(userData, 'prof-a', foreign), false);
  assert.equal(isolation.isManagedProfessionalClinicalPath(userData, 'prof-a', legacy), false);
  assert.equal(isolation.isManagedProfessionalClinicalPath(userData, 'prof-a', '../../etc/passwd'), false);
});

test('legacy clinical path is recognized separately and is never inferred as professional ownership', () => {
  const userData = path.join(os.tmpdir(), 'plennus-test');
  const legacy = path.join(userData, 'clinical-files', 'legacy.pdf');
  assert.equal(isolation.isLegacyManagedClinicalPath(userData, legacy), true);
  assert.equal(isolation.isManagedProfessionalClinicalPath(userData, 'prof-a', legacy), false);
});
