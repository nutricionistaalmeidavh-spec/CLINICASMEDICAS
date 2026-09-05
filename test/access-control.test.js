const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAllowedRoles,
  canViewMenuItem,
  getLandingPage,
  getRoleMeta,
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
