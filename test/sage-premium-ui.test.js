const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const platform = read('css/platform.css');
const shell = read('js/core/shell.js');
const dashboard = read('js/domains/dashboard.js');
const patients = read('js/domains/patients.js');
const html = read('index.html');

test('Sage Premium tokens replace the legacy wine brand without changing semantic statuses', () => {
  for (const value of ['#35483C', '#526A5A', '#8FA88F', '#F6F4EE', '#242824', '#667068', '#DDDCD4']) {
    assert.match(platform, new RegExp(value.replace('#', '#'), 'i'));
  }
  assert.match(platform, /--brand-primary/);
  assert.match(platform, /--brand-primary-dark/);
  assert.match(platform, /--surface-app/);
  assert.doesNotMatch(platform, /#7f1526/i);
});

test('premium shell keeps global search and adds a compact contextual profile surface', () => {
  assert.match(shell, /shell-topbar/);
  assert.match(shell, /global-search-input/);
  assert.match(shell, /shell-profile/);
  assert.match(shell, /shell-profile-name/);
  assert.match(shell, /syncShellIdentity/);
});

test('dashboard prioritizes the clinical day before secondary management metrics', () => {
  const focus = dashboard.indexOf('dashboard-focus-grid');
  const metrics = dashboard.indexOf('dashboard-section-label">Indicadores');
  assert.ok(focus >= 0, 'dashboard focus grid must exist');
  assert.ok(metrics > focus, 'secondary metrics must render after the focus area');
  for (const id of ['dashboard-proximos','stat-aguardando','stat-pendencias','stat-exames-pendentes','stat-pacientes','stat-consultas','stat-saldo']) {
    assert.match(dashboard, new RegExp(`id="${id}"`));
  }
});

test('patients page becomes a searchable split workspace while preserving legacy CRUD contracts', () => {
  assert.match(patients, /ensurePatientsUi/);
  assert.match(patients, /patients-page-header/);
  assert.match(patients, /patients-search-input/);
  assert.match(patients, /patient-count/);
  assert.match(patients, /patient-avatar/);
  assert.match(patients, /patient-allergy-badge/);
  for (const id of ['pac-id','pac-nome','pac-cpf','pac-nasc','pac-celular','pac-email','pac-alergias','tabela-pacientes']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const fn of ['salvarPaciente','selecionarPaciente','limparPaciente','excluirPaciente']) {
    assert.match(patients, new RegExp(`function ${fn}\\(`));
  }
});