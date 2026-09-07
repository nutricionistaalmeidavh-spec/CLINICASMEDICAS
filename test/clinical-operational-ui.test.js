const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const shell = read('js/core/shell.js');
const formUx = read('js/core/form-ux.js');
const app = read('js/app.js');
const agenda = read('js/domains/agenda.js');
const workspace = read('js/domains/patient-workspace.js');
const pep = read('js/domains/pep.js');
const platform = read('css/platform.css');
const html = read('index.html');
const operationalCssPath = path.join(root, 'css', 'clinical-operational.css');
const formUxCssPath = path.join(root, 'css', 'form-ux.css');

test('clinical operational refinement preserves the active Sage palette', () => {
  for (const value of ['#35483C', '#526A5A', '#8FA88F', '#F6F4EE']) {
    assert.match(platform, new RegExp(value, 'i'));
  }
  assert.doesNotMatch(shell, /#245B65/i);
  assert.doesNotMatch(formUx, /#245B65/i);
});

test('shell loads the compact clinical operational override layer', () => {
  assert.ok(fs.existsSync(operationalCssPath), 'clinical-operational.css must exist');
  assert.match(shell, /clinical-operational\.css/);
  if (!fs.existsSync(operationalCssPath)) return;
  const css = read('css/clinical-operational.css');
  assert.match(css, /--ops-sidebar-width:\s*218px/);
  assert.match(css, /--ops-control-height:\s*38px/);
  assert.match(css, /--ops-radius-sm:\s*6px/);
  assert.match(css, /--ops-radius-md:\s*8px/);
  assert.match(css, /--ops-radius-lg:\s*10px/);
});

test('shell exposes clinic context and an accessible mobile navigation drawer', () => {
  for (const marker of [
    'shell-clinic-name', 'shell-mobile-menu', 'sidebar-menu', 'shell-menu-backdrop',
    'toggleMobileSidebar', 'closeMobileSidebar', 'aria-expanded', 'aria-controls'
  ]) assert.match(shell, new RegExp(marker));
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(shell, /focus\(\)/);
});

test('navigation emojis are replaced at runtime by Lucide-style inline svg icons', () => {
  assert.match(shell, /NAV_ICONS/);
  assert.match(shell, /decorateNavigationIcons/);
  assert.match(shell, /<svg/);
  assert.match(shell, /stroke="currentColor"/);
  assert.match(shell, /aria-hidden="true"/);
});

test('agenda patient name opens an in-place patient sheet without changing agenda filters', () => {
  for (const marker of [
    'openAgendaPatientSheet', 'closeAgendaPatientSheet', 'agenda-patient-trigger',
    'agenda-patient-sheet', 'agenda-patient-sheet-backdrop', 'agenda-data-filtro', 'agenda-filtro-prof'
  ]) assert.match(agenda, new RegExp(marker));
  assert.match(agenda, /canAccessPatientClinicalWorkspace/);
  assert.match(agenda, /currentUser/);
});

test('operational layer provides overlay focus, scroll lock and reduced-motion accessibility', () => {
  if (!fs.existsSync(operationalCssPath)) return;
  const css = read('css/clinical-operational.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /body\.overlay-open/);
  assert.match(css, /body\.sidebar-drawer-open/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.agenda-patient-sheet/);
  assert.match(css, /\.pep-premium-patient/);
});

test('workspace preserves unsaved field values while alternating among the eight patient sections', () => {
  assert.match(workspace, /const TABS = \[/);
  assert.equal((workspace.match(/\{ id:/g) || []).length, 8);
  for (const marker of ['workspaceDrafts', 'captureWorkspaceDraft', 'restoreWorkspaceDraft', 'input, select, textarea']) {
    assert.match(workspace, new RegExp(marker));
  }
});

test('shared form refinement marks required controls and exposes inline validation messages', () => {
  assert.ok(fs.existsSync(formUxCssPath), 'form-ux.css must exist');
  for (const marker of ['markRequiredControls', 'bindInlineValidation', 'aria-required', 'aria-invalid', 'form-validation-message', 'ACTION_REQUIRED_CONTROLS']) {
    assert.match(formUx, new RegExp(marker));
  }
  assert.match(formUx, /css\/form-ux\.css/);
  assert.match(app, /js\/core\/form-ux\.js/);
  assert.match(app, /PlennusFormUX/);
  if (!fs.existsSync(formUxCssPath)) return;
  const css = read('css/form-ux.css');
  assert.match(css, /\.form-validation-message/);
  assert.match(css, /:has\([^)]*\[required\]/);
});

test('direct PEP entry points retain the centralized clinical access boundary', () => {
  assert.match(pep, /canAccessPatientClinicalWorkspace/);
  assert.match(pep, /abrirProntuarioPaciente/);
  assert.match(pep, /abrirProntuarioDaAgenda/);
  assert.match(pep, /Acesso clínico restrito/);
});

test('existing role and page contracts remain in place', () => {
  for (const marker of [
    'data-page="agenda" data-roles="admin,medico,recepcao"',
    'data-page="prontuario" data-roles="admin,medico"',
    'id="page-agenda"', 'id="page-prontuario"', 'id="page-pacientes"'
  ]) assert.ok(html.includes(marker), `missing legacy contract: ${marker}`);
});
