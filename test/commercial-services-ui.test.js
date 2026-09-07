const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fiscalUiPath = path.join(__dirname, '..', 'js/modules/fiscal/fiscal-ui.js');
const adapterPath = path.join(__dirname, '..', 'js/domains/commercial-services.js');
const appPath = path.join(__dirname, '..', 'js/app.js');

const filesExist = fs.existsSync(fiscalUiPath) && fs.existsSync(adapterPath);

test('fiscal renderer and Plennus commercial-services adapter exist', () => {
  assert.ok(fs.existsSync(fiscalUiPath), 'fiscal-ui.js must exist');
  assert.ok(fs.existsSync(adapterPath), 'commercial-services.js must exist');
});

if (filesExist) {
  const fiscalUi = fs.readFileSync(fiscalUiPath, 'utf8');
  const adapter = fs.readFileSync(adapterPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');

  test('app loads commercial services after core initialization', () => {
    assert.match(app, /commercial-services\.js/);
    assert.match(app, /ensureCommercialServices/);
  });

  test('adapter mounts certificate in settings and fiscal controls in settings and finance', () => {
    assert.match(adapter, /PlennusCertificateDigital/);
    assert.match(adapter, /PlennusFiscal/);
    assert.match(adapter, /page-configuracoes/);
    assert.match(adapter, /page-financeiro/);
  });

  test('renderer never reads or stores provider token directly', () => {
    assert.doesNotMatch(adapter, /localStorage.*token|INSERT.*token|configuracoes.*token/i);
    assert.doesNotMatch(fiscalUi, /localStorage.*token/i);
    assert.match(fiscalUi, /saveConnection/);
    assert.match(fiscalUi, /type="password"/);
  });

  test('fiscal UI explains that the provider account is optional and paid by the clinic', () => {
    assert.match(fiscalUi, /opcional/i);
    assert.match(fiscalUi, /sua conta/i);
    assert.match(fiscalUi, /Focus NFe/);
  });
}
