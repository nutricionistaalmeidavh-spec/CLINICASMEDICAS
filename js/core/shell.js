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
    appendStylesheet('link[data-plennus-sage-final]', 'css/sage-premium-final.css', 'plennusSageFinal');
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

  function applyFinalPremiumClasses() {
    const inventory = document.getElementById('page-estoque');
    if (inventory) {
      addClass(inventory, 'inventory-premium-page');
      addClass(inventory.querySelector('.page-heading-row'), 'final-premium-header');
      addClass(inventory.querySelector('#estoque-kpis'), 'final-premium-kpis');
      const grids = inventory.querySelectorAll('.operations-grid-2');
      addClass(grids[0], 'inventory-premium-grid');
      addClass(grids[1], 'inventory-premium-secondary');
      const cards = inventory.querySelectorAll(':scope > .card');
      addClass(cards[cards.length - 1], 'inventory-premium-ledger');
    }

    const crm = document.getElementById('page-crm');
    if (crm) {
      addClass(crm, 'crm-premium-page');
      addClass(crm.querySelector('.page-heading-row'), 'final-premium-header');
      addClass(crm.querySelector('#crm-kpis'), 'final-premium-kpis');
      const directCards = crm.querySelectorAll(':scope > .card');
      addClass(directCards[0], 'crm-premium-journey');
      addClass(crm.querySelector('.operations-grid-2'), 'crm-premium-grid');
      addClass(crm.querySelector('#crm-historico')?.closest('.card'), 'crm-premium-history');
    }

    const whatsapp = document.getElementById('page-whatsapp');
    if (whatsapp) {
      addClass(whatsapp, 'whatsapp-premium-page');
      addClass(whatsapp.querySelector('.page-heading-row'), 'final-premium-header');
      addClass(whatsapp.querySelector('#wpp-kpis'), 'final-premium-kpis');
      const cards = whatsapp.querySelectorAll(':scope > .card');
      addClass(cards[cards.length - 1], 'whatsapp-premium-queue');
    }

    const settings = document.getElementById('page-configuracoes');
    if (settings) {
      addClass(settings, 'settings-premium-page');
      addClass(settings, 'settings-premium-grid');
      addClass(settings.querySelector('.page-title'), 'final-premium-title');
      addClass(settings.querySelector('[onclick="salvarConfig()"]')?.closest('.card'), 'settings-premium-identity');
      addClass(settings.querySelector('#card-usuarios-gestao'), 'settings-premium-users');
      addClass(settings.querySelector('[onclick="alterarSenha()"]')?.closest('.card'), 'settings-premium-security');
      addClass(settings.querySelector('[onclick="fazerBackup()"]')?.closest('.card'), 'settings-premium-backup');
    }

    const importer = document.getElementById('page-importar');
    if (importer) {
      addClass(importer, 'import-premium-page');
      addClass(importer.querySelector('.page-heading-row'), 'final-premium-header');
      const cards = importer.querySelectorAll(':scope > .card');
      addClass(cards[0], 'import-premium-dropzone');
      addClass(importer.querySelector('#import-preview-card'), 'import-premium-preview');
    }

    const audit = document.getElementById('page-auditoria');
    if (audit) {
      addClass(audit, 'audit-premium-page');
      addClass(audit.querySelector('.page-heading-row'), 'final-premium-header');
      const cards = audit.querySelectorAll(':scope > .card');
      addClass(cards[cards.length - 1], 'audit-premium-ledger');
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
    applyFinalPremiumClasses();
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
    applyAdministrativePremiumClasses, applyFinalPremiumClasses,
    syncShellIdentity, setPageTitle, setupShell
  };
})(typeof window !== 'undefined' ? window : globalThis);
