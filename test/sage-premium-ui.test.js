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
const moduleCssPath = path.join(root, 'css', 'sage-premium-modules.css');

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

test('shell activates the shared premium stylesheet and page contracts through Financeiro', () => {
  assert.match(shell, /sage-premium-modules\.css/);
  assert.match(shell, /applyPremiumModuleClasses/);
  for (const value of ['agenda-premium-page','pep-premium-page','odontology-premium-page','finance-premium-page']) {
    assert.match(shell, new RegExp(value));
  }
  assert.ok(fs.existsSync(moduleCssPath), 'premium module stylesheet must exist');
});

test('agenda keeps all scheduling ids while the premium module layer owns its visual workspace', () => {
  for (const id of ['page-agenda','agenda-data-filtro','agenda-filtro-prof','card-novo-agendamento','timeline-slots-container','coluna-agendados','coluna-espera','coluna-atendidos']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  if (fs.existsSync(moduleCssPath)) {
    const css = read('css/sage-premium-modules.css');
    assert.match(css, /Agenda premium workspace/);
    assert.match(css, /\.agenda-premium-page/);
    assert.match(css, /#timeline-slots-container/);
    assert.match(css, /\.espera-board/);
  }
});

test('PEP keeps SOAP field ids and gains a patient-centered premium workspace', () => {
  for (const id of ['page-prontuario','pep-paciente','pep-profissional','pep-patient-card','pep-corpo','pep-subjetivo','pep-pa','pep-peso','pep-cid10','pep-avaliacao','pep-plano','pep-prescricao','pep-timeline']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  if (fs.existsSync(moduleCssPath)) {
    const css = read('css/sage-premium-modules.css');
    assert.match(css, /PEP premium workspace/);
    assert.match(css, /\.pep-premium-page/);
    assert.match(css, /\.soap-section/);
  }
});

test('odontology and finance preserve domain contracts while receiving the premium workspace layer', () => {
  for (const id of ['od-paciente','od-workspace','od-tooth-grid','od-condition-list','od-plan-select','od-plan-items','od-budget-list','od-budget-detail']) {
    assert.match(odontology, new RegExp(`id=\\"${id}\\"`));
  }
  for (const id of ['fin-kpis','fin-tipo','fin-descricao','fin-valor','fin-vencimento','fin-forma','fin-relatorio','fin-filtro-status','fin-filtro-tipo','fin-tabela']) {
    assert.match(finance, new RegExp(`id=\\"${id}\\"`));
  }
  for (const fn of ['registrarLancamento','liquidarLancamento','cancelarLancamento']) {
    assert.match(finance, new RegExp(`function ${fn}\\(`));
  }
  if (fs.existsSync(moduleCssPath)) {
    const css = read('css/sage-premium-modules.css');
    assert.match(css, /Odontology premium workspace/);
    assert.match(css, /Finance premium workspace/);
    assert.match(css, /\.odontology-premium-page/);
    assert.match(css, /\.finance-premium-page/);
  }
});

test('administrative operations receive Sage Premium classes without changing legacy ids', () => {
  for (const value of [
    'professionals-premium-page', 'insurance-premium-page', 'documents-premium-page',
    'cash-premium-page', 'payouts-premium-page'
  ]) assert.match(shell, new RegExp(value));

  for (const id of [
    'page-profissionais','prof-id','prof-nome','prof-esp','prof-crm','prof-tel','prof-perc','tabela-profissionais',
    'page-convenios','conv-id','conv-nome','conv-codigo','conv-tel','conv-contato','proc-nome','proc-valor','tabela-convenios','tabela-procedimentos',
    'page-documentos','doc-tipo','doc-paciente','doc-profissional','doc-editor',
    'page-caixa','cx-entradas','cx-saidas','cx-saldo','cx-tipo','cx-desc','cx-valor','cx-forma','tabela-caixa',
    'page-repasses','rep-prof','rep-inicio','rep-fim','rep-bruto','rep-perc','tabela-repasses'
  ]) assert.match(html, new RegExp(`id="${id}"`));
});

test('admin operations stylesheet defines premium workspaces and responsive behavior', () => {
  assert.ok(fs.existsSync(moduleCssPath), 'premium module stylesheet must exist');
  const css = read('css/sage-premium-modules.css');
  for (const marker of [
    'Administrative operations premium workspace',
    '.professionals-premium-page', '.insurance-premium-page', '.documents-premium-page',
    '.cash-premium-page', '.payouts-premium-page', '.documents-premium-editor',
    '.cash-premium-summary', '.payouts-premium-ledger'
  ]) assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
