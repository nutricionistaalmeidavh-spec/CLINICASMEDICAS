const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAllowedRoles,
  canViewMenuItem,
  canNavigateToPage,
  getLandingPage,
  getRoleMeta,
  canManageClinicSettings,
  canManageUsers,
  canManageBackups,
  canManagePayouts,
  canEditClinicalData,
} = require('../js/core/access-control.js');

test('parses menu role declarations and preserves the default role set', () => {
  assert.deepEqual(parseAllowedRoles('admin, medico'), ['admin', 'medico']);
  assert.deepEqual(parseAllowedRoles(), ['admin', 'medico', 'recepcao']);
});

test('checks menu visibility using the existing data-roles contract', () => {
  assert.equal(canViewMenuItem('medico', 'admin,medico'), true);
  assert.equal(canViewMenuItem('recepcao', 'admin,medico'), false);
  assert.equal(canViewMenuItem('recepcao'), true);
});

test('keeps current role landing pages', () => {
  assert.equal(getLandingPage('admin'), 'dashboard');
  assert.equal(getLandingPage('medico'), 'agenda');
  assert.equal(getLandingPage('recepcao'), 'agenda');
});

test('keeps role labels and badge classes used by the current UI', () => {
  assert.deepEqual(getRoleMeta('admin'), { label: 'Administrador', className: 'badge-admin' });
  assert.deepEqual(getRoleMeta('medico'), { label: 'Médico / Profissional', className: 'badge-medico' });
});

test('page permission matrix blocks direct navigation to privileged modules', () => {
  assert.equal(canNavigateToPage('medico', 'prontuario'), true);
  assert.equal(canNavigateToPage('recepcao', 'prontuario'), false);
  assert.equal(canNavigateToPage('recepcao', 'financeiro'), true);
  assert.equal(canNavigateToPage('medico', 'financeiro'), false);
  assert.equal(canNavigateToPage('recepcao', 'repasses'), false);
  assert.equal(canNavigateToPage('admin', 'repasses'), true);
  assert.equal(canNavigateToPage('medico', 'auditoria'), false);
  assert.equal(canNavigateToPage('admin', 'auditoria'), true);
  assert.equal(canNavigateToPage('admin', 'pagina-inexistente'), false);
});

test('administrative capabilities remain admin-only while clinical edits stay with professionals', () => {
  for (const capability of [canManageClinicSettings, canManageUsers, canManageBackups, canManagePayouts]) {
    assert.equal(capability('admin'), true);
    assert.equal(capability('medico'), false);
    assert.equal(capability('recepcao'), false);
  }
  assert.equal(canEditClinicalData('admin'), true);
  assert.equal(canEditClinicalData('medico'), true);
  assert.equal(canEditClinicalData('recepcao'), false);
});
