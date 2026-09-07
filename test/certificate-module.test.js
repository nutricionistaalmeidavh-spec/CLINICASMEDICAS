const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'js/modules/certificate-digital/certificate-digital.js');
const exists = fs.existsSync(modulePath);

test('reusable certificate module exists', () => {
  assert.ok(exists, 'certificate-digital.js must exist');
});

if (exists) {
  const source = fs.readFileSync(modulePath, 'utf8');

  test('default UTW provider points to ArtiSys store and exposes current prices', () => {
    const sandbox = { window: {}, globalThis: {} };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    const api = sandbox.window.PlennusCertificateDigital || sandbox.globalThis.PlennusCertificateDigital;
    assert.ok(api);
    const provider = api.getDefaultProvider();
    assert.equal(provider.id, 'utw');
    assert.equal(provider.storeUrl, 'https://emitircertificadodigital.org/artisys');
    assert.deepEqual(Array.from(provider.products, product => ({ code: product.code, price: product.price })), [
      { code: 'ecnpj-a1', price: 157 },
      { code: 'ecpf-a1', price: 157 }
    ]);
  });

  test('outbound certificate action uses only configured store URL without customer query data', () => {
    assert.doesNotMatch(source, /cpf=.*\+|cnpj=.*\+|patient|paciente/i);
    assert.match(source, /openExternal/);
    assert.match(source, /storeUrl/);
  });
}
