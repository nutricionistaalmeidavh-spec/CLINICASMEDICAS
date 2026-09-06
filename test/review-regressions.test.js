const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dashboard = require('../js/domains/dashboard.js');
const search = require('../js/core/global-search.js');

test('dashboard runtime layout contains all operational shell targets', () => {
  assert.equal(typeof dashboard.dashboardLayoutMarkup, 'function');
  const html = dashboard.dashboardLayoutMarkup();
  for (const id of [
    'stat-pacientes', 'stat-consultas', 'stat-aguardando', 'stat-pendencias',
    'stat-exames-pendentes', 'stat-saldo', 'dashboard-proximos',
    'dashboard-espera', 'dashboard-clinico'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('bootstrap composes the administrative audit page before navigation binding', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const auditIndex = source.indexOf('PlennusAuditView?.ensureAuditUi()');
  const navigationIndex = source.indexOf('setupNavigation()');
  assert.ok(auditIndex >= 0, 'audit UI must be composed at startup');
  assert.ok(auditIndex < navigationIndex, 'audit menu must exist before navigation listeners are bound');
});

test('opening a clinical search result navigates first and then selects the requested patient', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'core', 'global-search.js'), 'utf8');
  assert.match(source, /navegar\('prontuario'\)[\s\S]{0,220}selecionarPacientePep\(patientId\)/);
});

test('patient name search uses an accent-insensitive SQL expression', () => {
  assert.equal(typeof search.patientNameSearchExpression, 'function');
  const expression = search.patientNameSearchExpression('nome');
  assert.match(expression, /REPLACE/i);
  assert.match(expression, /nome/i);
  const built = search.buildPatientSearchSql('Jose');
  assert.ok(built.sql.includes(expression));
});
