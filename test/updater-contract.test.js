const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function loadUpdaterService() {
  const servicePath = path.join(root, 'js/core/updater-service.js');
  assert.equal(fs.existsSync(servicePath), true, 'o serviço de atualização deve existir');
  return require(servicePath);
}

function createFakeAutoUpdater() {
  const emitter = new EventEmitter();
  emitter.checkCalls = 0;
  emitter.downloadCalls = 0;
  emitter.installCalls = 0;
  emitter.checkForUpdates = async () => { emitter.checkCalls += 1; };
  emitter.downloadUpdate = async () => { emitter.downloadCalls += 1; };
  emitter.quitAndInstall = () => { emitter.installCalls += 1; };
  return emitter;
}

test('declara electron-updater como dependencia de runtime', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.dependencies?.['electron-updater'], '^6.6.2');
});

test('configura GitHub Releases como provedor do electron-builder', () => {
  const pkg = readJson('package.json');
  assert.deepEqual(pkg.build?.publish?.[0], {
    provider: 'github',
    owner: 'nutricionistaalmeidavh-spec',
    repo: 'CLINICASMEDICAS',
    releaseType: 'release'
  });
});

test('atualizador é suportado somente no Windows empacotado', () => {
  const { createUpdaterService } = loadUpdaterService();
  const autoUpdater = createFakeAutoUpdater();
  const app = { isPackaged: true, getVersion: () => '1.0.7' };
  const service = createUpdaterService({ app, autoUpdater, platform: 'win32' });
  assert.equal(service.state().supported, true);
  assert.equal(service.state().currentVersion, '1.0.7');

  const unsupported = createUpdaterService({ app, autoUpdater: createFakeAutoUpdater(), platform: 'darwin' });
  assert.equal(unsupported.state().supported, false);
});

test('acompanha disponibilidade, progresso e download concluído', () => {
  const { createUpdaterService } = loadUpdaterService();
  const autoUpdater = createFakeAutoUpdater();
  const app = { isPackaged: true, getVersion: () => '1.0.7' };
  const service = createUpdaterService({ app, autoUpdater, platform: 'win32' });

  autoUpdater.emit('update-available', { version: '1.0.8' });
  assert.equal(service.state().status, 'available');
  assert.equal(service.state().availableVersion, '1.0.8');

  autoUpdater.emit('download-progress', { percent: 41.6 });
  assert.equal(service.state().status, 'downloading');
  assert.equal(service.state().progress, 42);

  autoUpdater.emit('update-downloaded', { version: '1.0.8' });
  assert.equal(service.state().status, 'downloaded');
  assert.equal(service.state().progress, 100);
});

test('não instala antes do download e instala somente quando pronto', () => {
  const { createUpdaterService } = loadUpdaterService();
  const autoUpdater = createFakeAutoUpdater();
  const app = { isPackaged: true, getVersion: () => '1.0.7' };
  const service = createUpdaterService({ app, autoUpdater, platform: 'win32' });

  assert.throws(() => service.install(), /ainda não terminou/i);
  autoUpdater.emit('update-downloaded', { version: '1.0.8' });
  assert.equal(service.install(), true);
  assert.equal(autoUpdater.installCalls, 1);
});

test('main, preload e configurações expõem somente o contrato restrito do updater', () => {
  const main = read('main.js');
  const preload = read('preload.js');
  const settings = read('js/domains/settings.js');

  for (const channel of ['updater:state', 'updater:check', 'updater:download', 'updater:install']) {
    assert.match(main, new RegExp(channel.replace(':', '\\:')));
  }
  assert.match(preload, /updater:\s*\{/);
  assert.match(preload, /onStateChanged/);
  assert.match(settings, /desktop-updater-settings/);
  assert.match(settings, /Reiniciar e instalar/);
});

test('workflow de release valida exe, blockmap e latest.yml antes de publicar', () => {
  const workflowPath = path.join(root, '.github/workflows/desktop-release.yml');
  assert.equal(fs.existsSync(workflowPath), true, 'workflow de release desktop deve existir');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /latest\.yml/);
  assert.match(workflow, /\.blockmap/);
  assert.match(workflow, /gh release/);
  assert.match(workflow, /refs\/heads\/main/);
});
