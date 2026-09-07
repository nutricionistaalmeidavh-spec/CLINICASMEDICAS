(function (root) {
  const MODULE_SCRIPTS = Object.freeze([
    'js/modules/certificate-digital/certificate-digital.js',
    'js/modules/fiscal/fiscal-core.js',
    'js/modules/fiscal/fiscal-ui.js'
  ]);
  const PROFILE_KEYS = Object.freeze([
    'cnpjPrestador', 'inscricaoMunicipal', 'codigoMunicipioIbge', 'codigoMunicipioPrestacao',
    'itemListaServico', 'codigoTributarioMunicipio', 'codigoTributacaoNacionalIss', 'aliquotaIss',
    'naturezaOperacao', 'tributacaoIss', 'codigoOpcaoSimplesNacional', 'optanteSimplesNacional'
  ]);
  let mounted = false;

  function loadScript(src) {
    if (document.querySelector(`script[data-commercial-module="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.dataset.commercialModule = src;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`Não foi possível carregar ${src}.`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureModules() {
    for (const src of MODULE_SCRIPTS) await loadScript(src);
  }

  function ensureSection(page, id, title, description) {
    let section = document.getElementById(id);
    if (section) return section;
    section = document.createElement('section');
    section.id = id;
    section.className = 'commercial-services-section';
    const heading = document.createElement('div');
    heading.className = 'page-heading-row commercial-services-heading';
    heading.innerHTML = `<div><h2 class="card-title" style="font-size:16px;margin:0 0 4px">${title}</h2><p class="text-muted" style="margin:0">${description}</p></div>`;
    section.appendChild(heading);
    page.appendChild(section);
    return section;
  }

  function configValue(key) {
    return DB.query('SELECT valor FROM configuracoes WHERE chave=?', [key])[0]?.valor || '';
  }

  function saveConfigValue(key, value) {
    DB.run('INSERT INTO configuracoes (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor', [key, String(value == null ? '' : value)]);
  }

  function loadFiscalProfile() {
    const result = {};
    PROFILE_KEYS.forEach(key => { result[key] = configValue(`fiscal_${key}`); });
    if (!result.cnpjPrestador) result.cnpjPrestador = configValue('cnpj_clinica');
    return result;
  }

  function saveFiscalProfile(values = {}) {
    if (!canManageSettings()) throw new Error('Apenas administradores podem alterar o perfil fiscal.');
    PROFILE_KEYS.forEach(key => saveConfigValue(`fiscal_${key}`, values[key] || ''));
    return loadFiscalProfile();
  }

  function listPatients() {
    return DB.query(`SELECT id,nome,cpf,celular,telefone,email,cep,logradouro,numero,bairro,cidade,uf
      FROM pacientes WHERE ativo=1 ORDER BY nome`);
  }

  function canManageSettings() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    const access = root.PlennusAccessControl;
    return typeof access?.canManageClinicSettings === 'function' ? access.canManageClinicSettings(role) : role === 'admin';
  }

  function updateSettingsVisibility(section) {
    if (section) section.style.display = canManageSettings() ? '' : 'none';
  }

  function mountSettings() {
    const page = document.getElementById('page-configuracoes');
    if (!page || !root.PlennusCertificateDigital || !root.PlennusFiscal) return null;
    const section = ensureSection(
      page,
      'commercial-services-settings',
      'Serviços para sua clínica',
      'Serviços opcionais conectados ao Plennus. Contratação e operação externa permanecem separadas dos dados clínicos.'
    );
    if (!document.getElementById('certificate-digital-mount')) {
      const certificateMount = document.createElement('div');
      certificateMount.id = 'certificate-digital-mount';
      section.appendChild(certificateMount);
      root.PlennusCertificateDigital.mount({
        container: certificateMount,
        provider: root.PlennusCertificateDigital.getDefaultProvider(),
        hostName: 'o Plennus Clinic',
        openExternal: url => root.electronAPI?.abrirUrlExterna?.(url)
      });
    }
    let fiscalMount = document.getElementById('fiscal-settings-mount');
    if (!fiscalMount) {
      fiscalMount = document.createElement('div');
      fiscalMount.id = 'fiscal-settings-mount';
      section.appendChild(fiscalMount);
    }
    updateSettingsVisibility(section);
    return { section, fiscalMount };
  }

  function mountFinance() {
    const page = document.getElementById('page-financeiro');
    if (!page || !root.PlennusFiscal) return null;
    let section = document.getElementById('commercial-services-finance');
    if (!section) {
      section = document.createElement('section');
      section.id = 'commercial-services-finance';
      section.className = 'commercial-services-section fiscal-finance-section';
      const firstCard = page.querySelector('.operations-kpi-grid')?.nextElementSibling || page.firstElementChild;
      if (firstCard?.parentNode === page) page.insertBefore(section, firstCard);
      else page.appendChild(section);
    }
    let fiscalMount = document.getElementById('fiscal-finance-mount');
    if (!fiscalMount) {
      fiscalMount = document.createElement('div');
      fiscalMount.id = 'fiscal-finance-mount';
      section.appendChild(fiscalMount);
    }
    return fiscalMount;
  }

  async function setup() {
    if (mounted) return;
    await ensureModules();
    const settings = mountSettings();
    const financeContainer = mountFinance();
    const api = root.electronAPI?.fiscal;
    if (!api) {
      if (settings?.fiscalMount) settings.fiscalMount.innerHTML = '<div class="card"><div class="card-title">Emissão Fiscal</div><p class="text-muted">Disponível no aplicativo desktop com o módulo fiscal habilitado.</p></div>';
      return;
    }
    await root.PlennusFiscal.mount({
      settingsContainer: settings?.fiscalMount || null,
      financeContainer,
      api,
      referencePrefix: 'PLENNUS',
      hostAdapter: { loadFiscalProfile, saveFiscalProfile, listPatients }
    });
    mounted = true;

    const settingsPage = document.getElementById('page-configuracoes');
    if (settingsPage && settings?.section && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => updateSettingsVisibility(settings.section));
      observer.observe(settingsPage, { attributes: true, attributeFilter: ['class'] });
    }
  }

  root.PlennusCommercialServices = {
    setup,
    loadFiscalProfile,
    saveFiscalProfile,
    listPatients,
    MODULE_SCRIPTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
