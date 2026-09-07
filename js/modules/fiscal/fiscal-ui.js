(function (root) {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function localDate() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function localIsoWithOffset() {
    const now = new Date();
    const pad = value => String(Math.abs(value)).padStart(2, '0');
    const offsetMinutes = -now.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;
    const base = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
    return `${base}${sign}${pad(hours)}:${pad(minutes)}`;
  }

  function setMessage(target, text, kind = 'info') {
    if (!target) return;
    target.textContent = text || '';
    target.className = `fiscal-message fiscal-message-${kind}`;
  }

  function connectionLabel(status) {
    if (!status?.configured) return 'Não conectado';
    const environment = status.environment === 'production' ? 'Produção' : 'Homologação';
    const type = status.documentType === 'nfsen' ? 'NFS-e Nacional' : 'NFS-e municipal';
    return `Conectado • Focus NFe • ${environment} • ${type}`;
  }

  function buildSettingsMarkup() {
    return `
      <div class="card commercial-service-card fiscal-settings-card">
        <div class="card-title">Emissão Fiscal <span class="operations-status status-muted">Opcional</span></div>
        <p class="text-muted">Conecte sua conta Focus NFe para emitir NFS-e pelo sistema. A contratação e a cobrança do provedor fiscal ficam na sua conta.</p>
        <div class="form-row">
          <div class="form-group"><label>Provedor</label><input value="Focus NFe" disabled></div>
          <div class="form-group"><label>Ambiente</label><select data-fiscal-connection="environment"><option value="homologation">Homologação</option><option value="production">Produção</option></select></div>
          <div class="form-group"><label>Documento</label><select data-fiscal-connection="documentType"><option value="nfsen">NFS-e Nacional</option><option value="nfse">NFS-e municipal</option></select></div>
          <div class="form-group" style="flex:2"><label>Token da sua conta</label><input data-fiscal-connection="token" type="password" autocomplete="off" placeholder="Token Focus NFe"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-primary btn-sm" data-fiscal-action="save-connection">Conectar conta</button>
          <button type="button" class="btn btn-secondary btn-sm" data-fiscal-action="test-connection">Testar conexão</button>
          <button type="button" class="btn btn-secondary btn-sm" data-fiscal-action="remove-connection">Desconectar</button>
        </div>
        <p class="text-muted" data-fiscal-status>Verificando conexão...</p>
        <div class="fiscal-message" data-fiscal-settings-message></div>
      </div>
      <div class="card fiscal-profile-card">
        <div class="card-title">Perfil fiscal da clínica</div>
        <p class="text-muted">Preencha conforme orientação da sua contabilidade. O Plennus não escolhe códigos tributários nem alíquotas automaticamente.</p>
        <div class="form-row">
          <div class="form-group"><label>CNPJ do prestador</label><input data-fiscal-profile="cnpjPrestador" placeholder="00.000.000/0001-00"></div>
          <div class="form-group"><label>Inscrição municipal</label><input data-fiscal-profile="inscricaoMunicipal"></div>
          <div class="form-group"><label>Município IBGE do prestador</label><input data-fiscal-profile="codigoMunicipioIbge" inputmode="numeric" placeholder="7 dígitos"></div>
          <div class="form-group"><label>Município IBGE da prestação</label><input data-fiscal-profile="codigoMunicipioPrestacao" inputmode="numeric" placeholder="7 dígitos"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Item da lista de serviço (municipal)</label><input data-fiscal-profile="itemListaServico" placeholder="Ex.: 4.01"></div>
          <div class="form-group"><label>Código tributário municipal</label><input data-fiscal-profile="codigoTributarioMunicipio"></div>
          <div class="form-group"><label>Código tributação nacional ISS</label><input data-fiscal-profile="codigoTributacaoNacionalIss"></div>
          <div class="form-group"><label>Alíquota ISS (%)</label><input data-fiscal-profile="aliquotaIss" type="number" min="0" max="100" step="0.01"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Natureza da operação</label><input data-fiscal-profile="naturezaOperacao" type="number" min="1" max="99"></div>
          <div class="form-group"><label>Tributação ISS (Nacional)</label><input data-fiscal-profile="tributacaoIss" type="number" min="0" max="99"></div>
          <div class="form-group"><label>Opção Simples Nacional (código)</label><input data-fiscal-profile="codigoOpcaoSimplesNacional" maxlength="4"></div>
          <div class="form-group"><label>Optante do Simples (municipal)</label><select data-fiscal-profile="optanteSimplesNacional"><option value="false">Não</option><option value="true">Sim</option></select></div>
        </div>
        <div class="form-actions"><button type="button" class="btn btn-primary btn-sm" data-fiscal-action="save-profile">Salvar perfil fiscal</button></div>
        <div class="fiscal-message" data-fiscal-profile-message></div>
      </div>`;
  }

  function buildFinanceMarkup() {
    return `
      <div class="card fiscal-issuance-card">
        <div class="card-title">Emissão Fiscal <span class="operations-status status-muted">Opcional</span></div>
        <p class="text-muted" data-fiscal-finance-status>Verificando conexão...</p>
        <div class="form-row">
          <div class="form-group" style="flex:2"><label>Paciente / tomador</label><select data-fiscal-issue="patientId"><option value="">Selecione</option></select></div>
          <div class="form-group"><label>CPF/CNPJ do tomador</label><input data-fiscal-issue="document" placeholder="CPF ou CNPJ"></div>
          <div class="form-group" style="flex:2"><label>Nome do tomador</label><input data-fiscal-issue="name"></div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:3"><label>Descrição do serviço</label><input data-fiscal-issue="description" placeholder="Descrição que constará na NFS-e"></div>
          <div class="form-group"><label>Valor</label><input data-fiscal-issue="amount" type="number" min="0.01" step="0.01"></div>
          <div class="form-group"><label>Competência</label><input data-fiscal-issue="competence" type="date"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-primary btn-sm" data-fiscal-action="emit">Emitir NFS-e</button>
          <button type="button" class="btn btn-secondary btn-sm" data-fiscal-action="query" disabled>Consultar última emissão</button>
          <button type="button" class="btn btn-secondary btn-sm" data-fiscal-action="cancel" disabled>Cancelar última emissão</button>
        </div>
        <div class="fiscal-message" data-fiscal-issue-message></div>
        <div data-fiscal-result></div>
      </div>`;
  }

  function readFields(container, attribute) {
    const result = {};
    container.querySelectorAll(`[${attribute}]`).forEach(control => {
      result[control.getAttribute(attribute)] = control.value;
    });
    return result;
  }

  function writeFields(container, attribute, values = {}) {
    container.querySelectorAll(`[${attribute}]`).forEach(control => {
      const key = control.getAttribute(attribute);
      if (values[key] != null) control.value = String(values[key]);
    });
  }

  function createReference() {
    return `PLENNUS${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, '').replace(/^/, 'PLENNUS').slice(0, 64);
  }

  async function mount({ settingsContainer, financeContainer, api, hostAdapter = {} } = {}) {
    if (!api) throw new Error('API fiscal indisponível.');
    const core = root.PlennusFiscalCore;
    if (!core) throw new Error('Núcleo fiscal não carregado.');
    let lastIssue = null;
    let cachedPatients = [];

    async function refreshStatus() {
      const status = await api.status();
      const text = status?.ok === false ? (status.error || 'Falha ao consultar conexão.') : connectionLabel(status);
      settingsContainer?.querySelector('[data-fiscal-status]')?.replaceChildren(document.createTextNode(text));
      financeContainer?.querySelector('[data-fiscal-finance-status]')?.replaceChildren(document.createTextNode(
        status?.configured ? `${text}. A emissão usa sua conta do provedor.` : 'Emissão opcional: conecte sua conta Focus NFe em Configurações para habilitar.'
      ));
      if (settingsContainer && status?.configured) {
        const env = settingsContainer.querySelector('[data-fiscal-connection="environment"]');
        const type = settingsContainer.querySelector('[data-fiscal-connection="documentType"]');
        if (env) env.value = status.environment;
        if (type) type.value = status.documentType;
      }
      return status;
    }

    if (settingsContainer) {
      settingsContainer.innerHTML = buildSettingsMarkup();
      const profile = await Promise.resolve(hostAdapter.loadFiscalProfile?.() || {});
      writeFields(settingsContainer, 'data-fiscal-profile', profile);

      settingsContainer.querySelector('[data-fiscal-action="save-connection"]').addEventListener('click', async () => {
        const fields = readFields(settingsContainer, 'data-fiscal-connection');
        const message = settingsContainer.querySelector('[data-fiscal-settings-message]');
        if (!fields.token.trim()) return setMessage(message, 'Informe o token da sua conta Focus NFe.', 'error');
        setMessage(message, 'Conectando...', 'info');
        const result = await api.saveConnection({ provider: 'focus', environment: fields.environment, documentType: fields.documentType, token: fields.token.trim() });
        settingsContainer.querySelector('[data-fiscal-connection="token"]').value = '';
        setMessage(message, result?.ok ? 'Conta fiscal conectada com segurança.' : (result?.error || 'Não foi possível conectar.'), result?.ok ? 'success' : 'error');
        await refreshStatus();
      });

      settingsContainer.querySelector('[data-fiscal-action="test-connection"]').addEventListener('click', async () => {
        const message = settingsContainer.querySelector('[data-fiscal-settings-message]');
        setMessage(message, 'Testando conexão...', 'info');
        const result = await api.testConnection();
        setMessage(message, result?.ok ? 'Autenticação com o provedor confirmada.' : (result?.error || 'Falha ao validar a conta.'), result?.ok ? 'success' : 'error');
      });

      settingsContainer.querySelector('[data-fiscal-action="remove-connection"]').addEventListener('click', async () => {
        const message = settingsContainer.querySelector('[data-fiscal-settings-message]');
        const result = await api.removeConnection();
        setMessage(message, result?.ok ? 'Conta fiscal desconectada.' : (result?.error || 'Não foi possível desconectar.'), result?.ok ? 'success' : 'error');
        await refreshStatus();
      });

      settingsContainer.querySelector('[data-fiscal-action="save-profile"]').addEventListener('click', async () => {
        const fields = readFields(settingsContainer, 'data-fiscal-profile');
        const profileMessage = settingsContainer.querySelector('[data-fiscal-profile-message]');
        try {
          await Promise.resolve(hostAdapter.saveFiscalProfile?.(fields));
          setMessage(profileMessage, 'Perfil fiscal salvo. Confirme os dados com sua contabilidade antes da primeira emissão.', 'success');
        } catch (error) {
          setMessage(profileMessage, error?.message || 'Não foi possível salvar o perfil fiscal.', 'error');
        }
      });
    }

    if (financeContainer) {
      financeContainer.innerHTML = buildFinanceMarkup();
      const issueFields = key => financeContainer.querySelector(`[data-fiscal-issue="${key}"]`);
      issueFields('competence').value = localDate();
      cachedPatients = await Promise.resolve(hostAdapter.listPatients?.() || []);
      const patientSelect = issueFields('patientId');
      cachedPatients.forEach(item => {
        const option = document.createElement('option');
        option.value = String(item.id);
        option.textContent = item.cpf ? `${item.nome} • ${item.cpf}` : item.nome;
        patientSelect.appendChild(option);
      });
      patientSelect.addEventListener('change', () => {
        const selected = cachedPatients.find(item => String(item.id) === patientSelect.value);
        if (!selected) return;
        issueFields('document').value = selected.cnpj || selected.cpf || '';
        issueFields('name').value = selected.nome || '';
      });

      const queryButton = financeContainer.querySelector('[data-fiscal-action="query"]');
      const cancelButton = financeContainer.querySelector('[data-fiscal-action="cancel"]');
      const resultTarget = financeContainer.querySelector('[data-fiscal-result]');
      const issueMessage = financeContainer.querySelector('[data-fiscal-issue-message]');

      function renderResult(result) {
        if (!result) { resultTarget.innerHTML = ''; return; }
        const status = result?.data?.status || result?.data?.status_sefaz || result?.data?.mensagem || (result.ok ? 'Solicitação enviada' : 'Falha');
        resultTarget.innerHTML = `<div class="operations-inline-detail"><strong>Status:</strong> ${escapeHtml(status)}${lastIssue ? `<br><span class="text-muted">Referência: ${escapeHtml(lastIssue.reference)}</span>` : ''}</div>`;
      }

      financeContainer.querySelector('[data-fiscal-action="emit"]').addEventListener('click', async () => {
        setMessage(issueMessage, '', 'info');
        const status = await api.status();
        if (!status?.configured) return setMessage(issueMessage, 'Conecte sua conta Focus NFe em Configurações antes de emitir.', 'error');
        const profile = await Promise.resolve(hostAdapter.loadFiscalProfile?.() || {});
        const selected = cachedPatients.find(item => String(item.id) === patientSelect.value) || {};
        const document = issueFields('document').value.trim();
        const name = issueFields('name').value.trim();
        const description = issueFields('description').value.trim();
        const amount = Number(issueFields('amount').value);
        const competence = issueFields('competence').value || localDate();
        if (!document || !name || !description || !Number.isFinite(amount) || amount <= 0) {
          return setMessage(issueMessage, 'Preencha tomador, documento, descrição e valor antes de emitir.', 'error');
        }
        const digits = core.digits(document);
        const taxpayer = digits.length === 14 ? { cnpjTomador: digits } : { cpfTomador: digits };
        const reference = createReference();
        try {
          let payload;
          if (status.documentType === 'nfsen') {
            payload = core.buildNationalNfsePayload({
              dataEmissao: localIsoWithOffset(), dataCompetencia: competence,
              codigoMunicipioEmissora: profile.codigoMunicipioIbge,
              codigoMunicipioPrestacao: profile.codigoMunicipioPrestacao || profile.codigoMunicipioIbge,
              cnpjPrestador: profile.cnpjPrestador,
              codigoOpcaoSimplesNacional: profile.codigoOpcaoSimplesNacional,
              codigoTributacaoNacionalIss: profile.codigoTributacaoNacionalIss,
              descricaoServico: description, valorServico: amount,
              tributacaoIss: profile.tributacaoIss, aliquotaIss: profile.aliquotaIss,
              nomeTomador: name, emailTomador: selected.email, ...taxpayer
            });
          } else {
            const tomadorDocument = digits.length === 14 ? { cnpj: digits } : { cpf: digits };
            payload = core.buildMunicipalNfsePayload({
              dataEmissao: localIsoWithOffset(), naturezaOperacao: profile.naturezaOperacao,
              optanteSimplesNacional: String(profile.optanteSimplesNacional) === 'true',
              prestador: { cnpj: profile.cnpjPrestador, inscricaoMunicipal: profile.inscricaoMunicipal, codigoMunicipio: profile.codigoMunicipioIbge },
              tomador: {
                ...tomadorDocument, razaoSocial: name, email: selected.email, telefone: selected.celular || selected.telefone,
                logradouro: selected.logradouro, numero: selected.numero, bairro: selected.bairro, cep: selected.cep,
                codigoMunicipio: selected.codigo_municipio || undefined, uf: selected.uf
              },
              servico: {
                discriminacao: description, valorServicos: amount, itemListaServico: profile.itemListaServico,
                aliquota: profile.aliquotaIss, issRetido: false, codigoTributarioMunicipio: profile.codigoTributarioMunicipio,
                codigoMunicipio: profile.codigoMunicipioPrestacao || profile.codigoMunicipioIbge
              }
            });
          }
          setMessage(issueMessage, 'Enviando NFS-e ao provedor...', 'info');
          const result = await api.emit({ documentType: status.documentType, reference, payload });
          lastIssue = { reference, documentType: status.documentType };
          queryButton.disabled = false;
          cancelButton.disabled = !result?.ok;
          setMessage(issueMessage, result?.ok ? 'Solicitação de emissão enviada.' : (result?.error || result?.data?.mensagem || 'A emissão foi rejeitada.'), result?.ok ? 'success' : 'error');
          renderResult(result);
          await Promise.resolve(hostAdapter.onFiscalResult?.({ action: 'emit', reference, documentType: status.documentType, result }));
        } catch (error) {
          setMessage(issueMessage, error?.message || 'Dados fiscais incompletos.', 'error');
        }
      });

      queryButton.addEventListener('click', async () => {
        if (!lastIssue) return;
        setMessage(issueMessage, 'Consultando emissão...', 'info');
        const result = await api.query(lastIssue);
        setMessage(issueMessage, result?.ok ? 'Consulta atualizada.' : (result?.error || 'Falha na consulta.'), result?.ok ? 'success' : 'error');
        renderResult(result);
        await Promise.resolve(hostAdapter.onFiscalResult?.({ action: 'query', ...lastIssue, result }));
      });

      cancelButton.addEventListener('click', async () => {
        if (!lastIssue) return;
        const justification = root.prompt?.('Justificativa do cancelamento (15 a 255 caracteres):', '') || '';
        if (justification.trim().length < 15) return setMessage(issueMessage, 'Informe uma justificativa com pelo menos 15 caracteres.', 'error');
        const result = await api.cancel({ ...lastIssue, justification: justification.trim() });
        setMessage(issueMessage, result?.ok ? 'Cancelamento solicitado.' : (result?.error || 'Falha ao cancelar.'), result?.ok ? 'success' : 'error');
        renderResult(result);
        await Promise.resolve(hostAdapter.onFiscalResult?.({ action: 'cancel', ...lastIssue, result }));
      });
    }

    await refreshStatus();
    return { refreshStatus };
  }

  root.PlennusFiscal = { mount, connectionLabel, money };
})(typeof window !== 'undefined' ? window : globalThis);
