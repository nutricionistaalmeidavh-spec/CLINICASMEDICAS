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
const odontology = read('js/domains/odontology.js');
const finance = read('js/domains/finance-advanced.js');
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

test('agenda uses the premium day workspace while preserving scheduling contracts', () => {
  assert.match(html, /class="page agenda-premium-page" id="page-agenda"/);
  assert.match(html, /agenda-premium-header/);
  assert.match(html, /agenda-premium-toolbar/);
  assert.match(html, /agenda-premium-tabs/);
  for (const id of ['agenda-data-filtro','agenda-filtro-prof','card-novo-agendamento','timeline-slots-container','coluna-agendados','coluna-espera','coluna-atendidos']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(platform, /Agenda premium workspace/);
  assert.match(platform, /\.agenda-premium-page/);
});

test('PEP gains a patient-centered clinical workspace without changing SOAP field ids', () => {
  assert.match(html, /class="page pep-premium-page" id="page-prontuario"/);
  assert.match(html, /pep-premium-selector/);
  assert.match(html, /pep-premium-workspace/);
  for (const id of ['pep-paciente','pep-profissional','pep-patient-card','pep-corpo','pep-subjetivo','pep-pa','pep-peso','pep-cid10','pep-avaliacao','pep-plano','pep-prescricao','pep-timeline']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(platform, /PEP premium workspace/);
  assert.match(platform, /\.pep-premium-page/);
});

test('odontology keeps all clinical targets inside a premium treatment workspace', () => {
  assert.match(odontology, /odontology-premium-page/);
  assert.match(odontology, /odontology-premium-header/);
  assert.match(odontology, /odontology-premium-patient/);
  assert.match(odontology, /odontology-premium-tabs/);
  for (const id of ['od-paciente','od-workspace','od-tooth-grid','od-condition-list','od-plan-select','od-plan-items','od-budget-list','od-budget-detail']) {
    assert.match(odontology, new RegExp(`id=\\"${id}\\"`));
  }
  assert.match(platform, /Odontology premium workspace/);
});

test('finance becomes a premium operational workspace while keeping settlement contracts untouched', () => {
  assert.match(finance, /finance-premium-page/);
  assert.match(finance, /finance-premium-header/);
  assert.match(finance, /finance-premium-entry/);
  assert.match(finance, /finance-premium-report/);
  assert.match(finance, /finance-premium-ledger/);
  for (const id of ['fin-kpis','fin-tipo','fin-descricao','fin-valor','fin-vencimento','fin-forma','fin-relatorio','fin-filtro-status','fin-filtro-tipo','fin-tabela']) {
    assert.match(finance, new RegExp(`id=\\"${id}\\"`));
  }
  for (const fn of ['registrarLancamento','liquidarLancamento','cancelarLancamento']) {
    assert.match(finance, new RegExp(`function ${fn}\\(`));
  }
  assert.match(platform, /Finance premium workspace/);
});
