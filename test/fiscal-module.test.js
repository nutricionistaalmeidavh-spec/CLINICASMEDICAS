const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const corePath = path.join(__dirname, '..', 'js/modules/fiscal/fiscal-core.js');
const focusPath = path.join(__dirname, '..', 'js/modules/fiscal/focus-client.js');

const modulesExist = fs.existsSync(corePath) && fs.existsSync(focusPath);

test('reusable fiscal core and Focus provider modules exist', () => {
  assert.ok(fs.existsSync(corePath), 'fiscal-core.js must exist');
  assert.ok(fs.existsSync(focusPath), 'focus-client.js must exist');
});

if (modulesExist) {
  const core = require(corePath);
  const { createFocusClient } = require(focusPath);

  test('connection validation only accepts Focus and supported environments without exposing token', () => {
    const metadata = core.validateConnection({
      provider: 'focus',
      environment: 'homologation',
      documentType: 'nfsen',
      token: 'token_test_123456'
    });
    assert.deepEqual(metadata, {
      provider: 'focus',
      environment: 'homologation',
      documentType: 'nfsen'
    });
    assert.equal(Object.hasOwn(metadata, 'token'), false);
    assert.throws(() => core.validateConnection({ provider: 'other', environment: 'homologation', token: 'token_test_123456' }), /provider/i);
    assert.throws(() => core.validateConnection({ provider: 'focus', environment: 'custom', token: 'token_test_123456' }), /ambiente/i);
  });

  test('references are restricted to safe alphanumeric identifiers', () => {
    assert.equal(core.validateReference('PLENNUS202609070001'), 'PLENNUS202609070001');
    assert.throws(() => core.validateReference('bad/ref'), /refer/i);
    assert.throws(() => core.validateReference('com espaço'), /refer/i);
  });

  test('national NFSe builder keeps explicit fiscal choices and normalizes taxpayer documents', () => {
    const payload = core.buildNationalNfsePayload({
      dataEmissao: '2026-09-07T18:00:00-03:00',
      dataCompetencia: '2026-09-07',
      codigoMunicipioEmissora: '3543402',
      codigoMunicipioPrestacao: '3543402',
      cnpjPrestador: '12.345.678/0001-90',
      cpfTomador: '123.456.789-09',
      codigoOpcaoSimplesNacional: '1',
      codigoTributacaoNacionalIss: '040101',
      descricaoServico: 'Consulta clínica',
      valorServico: 300,
      tributacaoIss: 1
    });
    assert.equal(payload.cnpj_prestador, '12345678000190');
    assert.equal(payload.cpf_tomador, '12345678909');
    assert.equal(payload.codigo_tributacao_nacional_iss, '040101');
    assert.equal(payload.codigo_opcao_simples_nacional, '1');
    assert.equal(payload.valor_servico, 300);
    assert.equal(payload.tributacao_iss, 1);
  });

  test('municipal NFSe builder does not invent tax rate or service code', () => {
    const payload = core.buildMunicipalNfsePayload({
      dataEmissao: '2026-09-07T18:00:00-03:00',
      naturezaOperacao: 1,
      optanteSimplesNacional: true,
      prestador: { cnpj: '12.345.678/0001-90', inscricaoMunicipal: '12345', codigoMunicipio: '3543402' },
      tomador: { cpf: '123.456.789-09', razaoSocial: 'Paciente Teste' },
      servico: { discriminacao: 'Consulta clínica', valorServicos: 300, itemListaServico: '4.01', aliquota: 2.5, issRetido: false }
    });
    assert.equal(payload.prestador.cnpj, '12345678000190');
    assert.equal(payload.tomador.cpf, '12345678909');
    assert.equal(payload.servico.item_lista_servico, '4.01');
    assert.equal(payload.servico.aliquota, 2.5);
    assert.equal(payload.servico.valor_servicos, 300);
  });

  test('Focus client uses fixed environment hosts and token Basic Auth', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 202,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ status: 'processando_autorizacao' })
      };
    };
    const client = createFocusClient({ fetchImpl });
    await client.emit({
      connection: { provider: 'focus', environment: 'homologation', token: 'token_test_123456' },
      documentType: 'nfsen',
      reference: 'PLENNUS1',
      payload: { valor_servico: 100 }
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/homologacao\.focusnfe\.com\.br\/v2\/nfsen\?ref=PLENNUS1$/);
    assert.match(calls[0].options.headers.Authorization, /^Basic /);
    assert.equal(Buffer.from(calls[0].options.headers.Authorization.slice(6), 'base64').toString('utf8'), 'token_test_123456:');
  });

  test('Focus client cannot be redirected to a renderer supplied host', async () => {
    let captured = '';
    const client = createFocusClient({
      fetchImpl: async (url) => {
        captured = url;
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{}' };
      }
    });
    await client.query({
      connection: { provider: 'focus', environment: 'production', token: 'token_test_123456', baseUrl: 'https://evil.example' },
      documentType: 'nfse',
      reference: 'PLENNUS2'
    });
    assert.match(captured, /^https:\/\/api\.focusnfe\.com\.br\/v2\/nfse\/PLENNUS2$/);
    assert.doesNotMatch(captured, /evil\.example/);
  });
}
