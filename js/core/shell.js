(function (root) {
  const PAGE_TITLES = {
    dashboard: 'Visão geral', agenda: 'Agenda & Sala de Espera', prontuario: 'Prontuário eletrônico',
    pacientes: 'Pacientes', profissionais: 'Profissionais', convenios: 'Convênios e procedimentos',
    documentos: 'Documentos & PDF', odontologia: 'Odontologia', financeiro: 'Financeiro', estoque: 'Estoque clínico',
    crm: 'CRM de pacientes', whatsapp: 'WhatsApp operacional', caixa: 'Caixa', repasses: 'Repasses',
    configuracoes: 'Configurações', importar: 'Importar pacientes', auditoria: 'Auditoria'
  };
  let moduleObserver = null;

  function appendStylesheet(selector, href, datasetKey) {
    if (document.querySelector(selector)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[datasetKey] = '1';
    document.head.appendChild(link);
  }

  function ensureStylesheet() {
    appendStylesheet('link[data-plennus-platform]', 'css/platform.css', 'plennusPlatform');
    appendStylesheet('link[data-plennus-operations]', 'css/operations.css', 'plennusOperations');
    appendStylesheet('link[data-plennus-odontology]', 'css/odontology.css', 'plennusOdontology');
    appendStylesheet('link[data-plennus-sage-modules]', 'css/sage-premium-modules.css', 'plennusSageModules');
    appendStylesheet('link[data-plennus-sage-admin]', 'css/sage-premium-admin.css', 'plennusSageAdmin');
  }

  function addClass(target, className) {
    if (target && !target.classList.contains(className)) target.classList.add(className);
  }

  function applyAdministrativePremiumClasses() {
    const professionals = document.getElementById('page-profissionais');
    if (professionals) {
      addClass(professionals, 'professionals-premium-page');
      addClass(professionals.querySelector('.page-title'), 'admin-premium-title');
      const cards = professionals.querySelectorAll(':scope > .card');
      addClass(cards[0], 'professionals-premium-form');
      addClass(cards[1], 'professionals-premium-table');
    }

    const insurance = document.getElementById('page-convenios');
    if (insurance) {
      addClass(insurance, 'insurance-premium-page');
      addClass(insurance.querySelector('.page-title'), 'admin-premium-title');
      const directCards = insurance.querySelectorAll(':scope > .card');
      addClass(directCards[0], 'insurance-premium-form');
      addClass(directCards[1], 'procedures-premium-form');
      const catalogs = Array.from(insurance.children).find(child => child.classList?.contains('form-row'));
      addClass(catalogs, 'insurance-premium-catalogs');
    }

    const documents = document.getElementById('page-documentos');
    if (documents) {
      addClass(documents, 'documents-premium-page');
      addClass(documents.querySelector('.page-title'), 'admin-premium-title');
      const cards = documents.querySelectorAll(':scope > .card');
      addClass(cards[0], 'documents-premium-toolbar');
      addClass(cards[1], 'documents-premium-editor-card');
      addClass(documents.querySelector('#doc-editor'), 'documents-premium-editor');
    }

    const cash = document.getElementById('page-caixa');
    if (cash) {
      addClass(cash, 'cash-premium-page');
      addClass(cash.querySelector('.page-title'), 'admin-premium-title');
      addClass(cash.querySelector('.stats-row'), 'cash-premium-summary');
      const cards = cash.querySelectorAll(':scope > .card');
      addClass(cards[0], 'cash-premium-entry');
      addClass(cards[1], 'cash-premium-ledger');
    }

    const payouts = document.getElementById('page-repasses');
    if (payouts) {
      addClass(payouts, 'payouts-premium-page');
      addClass(payouts.querySelector('.page-title'), 'admin-premium-title');
      const cards = payouts.querySelectorAll(':scope > .card');
      addClass(cards[0], 'payouts-premium-entry');
      addClass(cards[1], 'payouts-premium-ledger');
    }
  }

  function applyPremiumModuleClasses() {
    const agenda = document.getElementById('page-agenda');
    if (agenda) {
      addClass(agenda, 'agenda-premium-page');
      addClass(agenda.firstElementChild, 'agenda-premium-header');
      addClass(agenda.querySelector('.agenda-toolbar'), 'agenda-premium-toolbar');
      addClass(agenda.querySelector('.tabs'), 'agenda-premium-tabs');
      addClass(agenda.querySelector('#card-novo-agendamento'), 'agenda-premium-form');
    }

    const pep = document.getElementById('page-prontuario');
    if (pep) {
      addClass(pep, 'pep-premium-page');
      const firstCard = Array.from(pep.children).find(child => child.classList?.contains('card'));
      addClass(firstCard, 'pep-premium-selector');
      addClass(pep.querySelector('#pep-patient-card'), 'pep-premium-patient');
      addClass(pep.querySelector('#pep-corpo'), 'pep-premium-workspace');
    }

    const odontology = document.getElementById('page-odontologia');
    if (odontology) {
      addClass(odontology, 'odontology-premium-page');
      addClass(odontology.querySelector('.page-heading-row'), 'odontology-premium-header');
      addClass(odontology.querySelector('.odontology-patient-bar'), 'odontology-premium-patient');
      addClass(odontology.querySelector('.odontology-tabs'), 'odontology-premium-tabs');
      addClass(odontology.querySelector('#od-workspace'), 'odontology-premium-workspace');
    }

    const finance = document.getElementById('page-financeiro');
    if (finance) {
      addClass(finance, 'finance-premium-page');
      addClass(finance.querySelector('.page-heading-row'), 'finance-premium-header');
      const cards = finance.querySelectorAll('.operations-grid-2 > .card');
      addClass(cards[0], 'finance-premium-entry');
      addClass(cards[1], 'finance-premium-report');
      const ledger = finance.querySelector('.operations-grid-2 + .card');
      addClass(ledger, 'finance-premium-ledger');
    }

    applyAdministrativePremiumClasses();
  }

  function observePremiumModules() {
    const main = document.querySelector('.main-content');
    if (!main || moduleObserver || typeof MutationObserver === 'undefined') return;
    moduleObserver = new MutationObserver(() => applyPremiumModuleClasses());
    moduleObserver.observe(main, { childList: true });
  }

  function initials(value) {
    const parts = String(value || '').replace(/^Olá,\s*/i, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'PL';
    return `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
  }

  function syncShellIdentity() {
    const profileName = document.getElementById('shell-profile-name');
    const profileRole = document.getElementById('shell-profile-role');
    const profileAvatar = document.getElementById('shell-profile-avatar');
    if (!profileName || !profileRole || !profileAvatar) return;

    const userDisplay = document.getElementById('user-display');
    const roleBadge = document.getElementById('user-role-badge');
    const rawName = String(userDisplay?.textContent || 'Plennus Clinic').replace(/^Olá,\s*/i, '').trim();
    const role = String(roleBadge?.textContent || 'Sessão local').trim();
    profileName.textContent = rawName || 'Plennus Clinic';
    profileRole.textContent = role || 'Sessão local';
    profileAvatar.textContent = initials(rawName);
  }

  function ensureShellTopbar() {
    ensureStylesheet();
    applyPremiumModuleClasses();
    observePremiumModules();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('shell-topbar')) {
      syncShellIdentity();
      return;
    }
    const topbar = document.createElement('header');
    topbar.id = 'shell-topbar';
    topbar.className = 'shell-topbar';
    topbar.innerHTML = `
      <div class="shell-context"><span class="shell-eyebrow">Plennus Clinic</span><strong id="shell-page-title">Visão geral</strong></div>
      <div class="shell-search-wrap">
        <span class="shell-search-icon" aria-hidden="true">⌕</span>
        <input id="global-search-input" type="search" autocomplete="off" placeholder="Buscar paciente por nome, CPF ou telefone" aria-label="Buscar paciente">
        <kbd>Ctrl K</kbd>
        <div id="global-search-results" class="global-search-results" hidden></div>
      </div>
      <div class="shell-actions">
        <div class="shell-profile" aria-label="Sessão atual">
          <span class="shell-profile-avatar" id="shell-profile-avatar" aria-hidden="true">PL</span>
          <span class="shell-profile-copy"><strong id="shell-profile-name">Plennus Clinic</strong><span id="shell-profile-role">Sessão local</span></span>
        </div>
      </div>`;
    main.prepend(topbar);
    syncShellIdentity();
  }

  function setPageTitle(page) {
    const title = document.getElementById('shell-page-title');
    if (title) title.textContent = PAGE_TITLES[page] || page || 'Plennus Clinic';
    applyPremiumModuleClasses();
    syncShellIdentity();
  }

  function setupShell() {
    ensureShellTopbar();
    applyPremiumModuleClasses();
    observePremiumModules();
    syncShellIdentity();
  }

  root.PlennusShell = {
    PAGE_TITLES, ensureStylesheet, ensureShellTopbar, applyPremiumModuleClasses,
    applyAdministrativePremiumClasses, syncShellIdentity, setPageTitle, setupShell
  };
})(typeof window !== 'undefined' ? window : globalThis);
