const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const DOMAIN_PATHS = [
  'js/domains/dashboard.js',
  'js/domains/patients.js',
  'js/domains/professionals.js',
  'js/domains/agenda.js',
  'js/domains/pep.js',
  'js/domains/documents.js',
  'js/domains/finance.js',
  'js/domains/settings.js',
  'js/domains/patient-workspace.js',
  'js/domains/clinical-files.js',
  'js/domains/consents.js',
  'js/domains/labs.js',
  'js/domains/clinical-timeline.js',
  'js/domains/clinical-pending.js',
  'js/domains/imports.js',
  'js/domains/audit-view.js',
  'js/domains/platform-documents.js',
];

const STATIC_CORE_PATHS = [
  'js/core/utils.js',
  'js/core/access-control.js',
  'js/core/clinic.js',
  'js/core/auth.js',
  'js/core/navigation.js',
];

const DYNAMIC_CORE_PATHS = [
  'js/core/clinical-model.js',
  'js/core/migrations.js',
  'js/core/audit.js',
  'js/core/import-model.js',
  'js/core/document-renderer.js',
  'js/core/shell.js',
  'js/core/global-search.js',
];

const NODE_ONLY_PATHS = ['js/core/xlsx-node.js'];

test('renderer keeps bootstrap before static core compatibility modules', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const appIndex = html.indexOf('src="js/app.js"');
  assert.ok(appIndex >= 0, 'renderer bootstrap must be loaded');
  for (const modulePath of STATIC_CORE_PATHS) {
    const moduleIndex = html.indexOf(`src="${modulePath}"`);
    assert.ok(moduleIndex > appIndex, `${modulePath} must load after js/app.js`);
  }
});

test('navigation compatibility shell declares every extracted clinical and platform module', () => {
  const source = fs.readFileSync(path.join(root, 'js/core/navigation.js'), 'utf8');
  for (const modulePath of [...DYNAMIC_CORE_PATHS, ...DOMAIN_PATHS]) {
    assert.ok(source.includes(`'${modulePath}'`), `${modulePath} must be registered in the compatibility loader`);
    assert.ok(fs.existsSync(path.join(root, modulePath)), `${modulePath} must exist`);
  }
  for (const modulePath of NODE_ONLY_PATHS) assert.ok(fs.existsSync(path.join(root, modulePath)), `${modulePath} must exist`);
});

test('navigation loads all dynamic cores before domain scripts synchronously while parsing', () => {
  const writes = [];
  const previousDocument = global.document;
  global.document = { readyState: 'loading', write: value => writes.push(value) };

  const modulePath = require.resolve('../js/core/navigation.js');
  delete require.cache[modulePath];
  require(modulePath);

  const emitted = writes.join('');
  for (const domainPath of DOMAIN_PATHS) assert.ok(emitted.includes(`src="${domainPath}"`), `${domainPath} must be emitted synchronously`);
  const firstDomainIndex = emitted.indexOf(`src="${DOMAIN_PATHS[0]}"`);
  for (const corePath of DYNAMIC_CORE_PATHS) {
    const index = emitted.indexOf(`src="${corePath}"`);
    assert.ok(index >= 0 && index < firstDomainIndex, `${corePath} must load before business domains`);
  }

  delete require.cache[modulePath];
  delete global.PlennusNavigation;
  delete global.setupNavigation;
  delete global.navegar;
  delete global.setupTabs;
  if (previousDocument === undefined) delete global.document;
  else global.document = previousDocument;
});

test('app.js remains only renderer bootstrap and orchestration', () => {
  const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.ok(source.length < 3000, `app.js should stay a small bootstrap, got ${source.length} chars`);
  assert.equal(source.includes('function carregarPacientes'), false);
  assert.equal(source.includes('function salvarAtendimentoPep'), false);
  assert.equal(source.includes('function registrarCaixa'), false);
  assert.equal(source.includes('function carregarAgendaVisual'), false);
});
