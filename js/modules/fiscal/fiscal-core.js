(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlennusFiscalCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const PROVIDERS = new Set(['focus']);
  const ENVIRONMENTS = new Set(['homologation', 'production']);
  const DOCUMENT_TYPES = new Set(['nfse', 'nfsen']);

  function digits(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function requiredText(value, label, max = 500) {
    const text = String(value == null ? '' : value).trim();
    if (!text) throw new Error(`${label} é obrigatório.`);
    if (text.length > max) throw new Error(`${label} excede o tamanho permitido.`);
    return text;
  }

  function optionalText(value, max = 500) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return undefined;
    if (text.length > max) throw new Error('Campo textual excede o tamanho permitido.');
    return text;
  }

  function numberValue(value, label, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label} inválido.`);
    if (options.positive && number <= 0) throw new Error(`${label} deve ser maior que zero.`);
    if (options.min != null && number < options.min) throw new Error(`${label} abaixo do mínimo permitido.`);
    if (options.max != null && number > options.max) throw new Error(`${label} acima do máximo permitido.`);
    return number;
  }

  function normalizeDocument(value, type, required = false) {
    const normalized = digits(value);
    if (!normalized && !required) return undefined;
    const expected = type === 'cnpj' ? 14 : 11;
    if (normalized.length !== expected) throw new Error(`${type.toUpperCase()} inválido.`);
    return normalized;
  }

  function validateDocumentType(value) {
    const documentType = String(value || 'nfsen').toLowerCase();
    if (!DOCUMENT_TYPES.has(documentType)) throw new Error('Tipo de documento fiscal não suportado.');
    return documentType;
  }

  function validateConnection(input = {}) {
    const provider = String(input.provider || '').toLowerCase();
    if (!PROVIDERS.has(provider)) throw new Error('Provider fiscal não suportado.');
    const environment = String(input.environment || '').toLowerCase();
    if (!ENVIRONMENTS.has(environment)) throw new Error('Ambiente fiscal inválido.');
    const documentType = validateDocumentType(input.documentType || 'nfsen');
    return { provider, environment, documentType };
  }

  function validateSecretConnection(input = {}) {
    const publicConnection = validateConnection(input);
    const token = requiredText(input.token, 'Token', 512);
    if (token.length < 8) throw new Error('Token fiscal inválido.');
    return { ...publicConnection, token };
  }

  function validateReference(value) {
    const reference = String(value == null ? '' : value).trim();
    if (!/^[A-Za-z0-9]{1,64}$/.test(reference)) throw new Error('Referência fiscal inválida. Use somente letras e números.');
    return reference;
  }

  function buildNationalNfsePayload(input = {}) {
    const payload = {
      data_emissao: requiredText(input.dataEmissao, 'Data de emissão', 40),
      data_competencia: requiredText(input.dataCompetencia, 'Data de competência', 20),
      codigo_municipio_emissora: requiredText(input.codigoMunicipioEmissora, 'Município emissor', 12),
      cnpj_prestador: normalizeDocument(input.cnpjPrestador, 'cnpj', true),
      codigo_opcao_simples_nacional: requiredText(input.codigoOpcaoSimplesNacional, 'Opção do Simples Nacional', 4),
      codigo_municipio_prestacao: requiredText(input.codigoMunicipioPrestacao, 'Município da prestação', 12),
      codigo_tributacao_nacional_iss: requiredText(input.codigoTributacaoNacionalIss, 'Código de tributação nacional do ISS', 20),
      descricao_servico: requiredText(input.descricaoServico, 'Descrição do serviço', 2000),
      valor_servico: numberValue(input.valorServico, 'Valor do serviço', { positive: true }),
      tributacao_iss: numberValue(input.tributacaoIss, 'Tributação do ISS', { min: 0, max: 99 })
    };

    const cpfTomador = normalizeDocument(input.cpfTomador, 'cpf');
    const cnpjTomador = normalizeDocument(input.cnpjTomador, 'cnpj');
    if (cpfTomador && cnpjTomador) throw new Error('Informe CPF ou CNPJ do tomador, não ambos.');
    if (cpfTomador) payload.cpf_tomador = cpfTomador;
    if (cnpjTomador) payload.cnpj_tomador = cnpjTomador;

    const optionalMap = {
      nomeTomador: 'nome_tomador',
      emailTomador: 'email_tomador',
      codigoNbs: 'codigo_nbs',
      informacoesComplementares: 'informacoes_complementares'
    };
    Object.entries(optionalMap).forEach(([source, target]) => {
      const value = optionalText(input[source], source === 'informacoesComplementares' ? 2000 : 300);
      if (value !== undefined) payload[target] = value;
    });

    if (input.aliquotaIss != null && String(input.aliquotaIss).trim() !== '') {
      payload.aliquota_iss = numberValue(input.aliquotaIss, 'Alíquota do ISS', { min: 0, max: 100 });
    }
    return payload;
  }

  function buildMunicipalNfsePayload(input = {}) {
    const prestadorInput = input.prestador || {};
    const tomadorInput = input.tomador || {};
    const servicoInput = input.servico || {};
    const payload = {
      data_emissao: requiredText(input.dataEmissao, 'Data de emissão', 40),
      natureza_operacao: numberValue(input.naturezaOperacao, 'Natureza da operação', { min: 1, max: 99 }),
      optante_simples_nacional: Boolean(input.optanteSimplesNacional),
      prestador: {
        cnpj: normalizeDocument(prestadorInput.cnpj, 'cnpj', true),
        inscricao_municipal: requiredText(prestadorInput.inscricaoMunicipal, 'Inscrição municipal', 40),
        codigo_municipio: requiredText(prestadorInput.codigoMunicipio, 'Município do prestador', 12)
      },
      tomador: {
        razao_social: requiredText(tomadorInput.razaoSocial, 'Nome/Razão social do tomador', 300)
      },
      servico: {
        discriminacao: requiredText(servicoInput.discriminacao, 'Discriminação do serviço', 2000),
        valor_servicos: numberValue(servicoInput.valorServicos, 'Valor dos serviços', { positive: true }),
        item_lista_servico: requiredText(servicoInput.itemListaServico, 'Item da lista de serviço', 30),
        aliquota: numberValue(servicoInput.aliquota, 'Alíquota do ISS', { min: 0, max: 100 }),
        iss_retido: Boolean(servicoInput.issRetido)
      }
    };

    if (input.regimeEspecialTributacao != null && String(input.regimeEspecialTributacao).trim() !== '') {
      payload.regime_especial_tributacao = numberValue(input.regimeEspecialTributacao, 'Regime especial de tributação', { min: 0, max: 99 });
    }

    const cpfTomador = normalizeDocument(tomadorInput.cpf, 'cpf');
    const cnpjTomador = normalizeDocument(tomadorInput.cnpj, 'cnpj');
    if (cpfTomador && cnpjTomador) throw new Error('Informe CPF ou CNPJ do tomador, não ambos.');
    if (cpfTomador) payload.tomador.cpf = cpfTomador;
    if (cnpjTomador) payload.tomador.cnpj = cnpjTomador;

    const tomadorFields = {
      email: 'email', telefone: 'telefone', logradouro: 'logradouro', numero: 'numero',
      complemento: 'complemento', bairro: 'bairro', cep: 'cep', codigoMunicipio: 'codigo_municipio', uf: 'uf'
    };
    Object.entries(tomadorFields).forEach(([source, target]) => {
      let value = optionalText(tomadorInput[source], 300);
      if (value === undefined) return;
      if (source === 'cep' || source === 'telefone') value = digits(value);
      payload.tomador[target] = value;
    });

    const servicoFields = {
      codigoCnae: 'codigo_cnae',
      codigoTributarioMunicipio: 'codigo_tributario_municipio',
      codigoMunicipio: 'codigo_municipio'
    };
    Object.entries(servicoFields).forEach(([source, target]) => {
      const value = optionalText(servicoInput[source], 60);
      if (value !== undefined) payload.servico[target] = value;
    });

    return payload;
  }

  return {
    digits,
    validateConnection,
    validateSecretConnection,
    validateDocumentType,
    validateReference,
    buildNationalNfsePayload,
    buildMunicipalNfsePayload
  };
});
