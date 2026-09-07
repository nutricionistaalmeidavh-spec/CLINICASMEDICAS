(function (root) {
  const PAGE_TITLES = {
    dashboard: 'Visão geral', agenda: 'Agenda & Sala de Espera', prontuario: 'Prontuário eletrônico',
    pacientes: 'Pacientes', profissionais: 'Profissionais', convenios: 'Convênios e procedimentos',
    documentos: 'Documentos & PDF', odontologia: 'Odontologia', financeiro: 'Financeiro', estoque: 'Estoque clínico',
    crm: 'CRM de pacientes', whatsapp: 'WhatsApp operacional', caixa: 'Caixa', repasses: 'Repasses',
    configuracoes: 'Configurações', importar: 'Importar pacientes', auditoria: 'Auditoria'
  };

  const MENU_LABELS = {
    dashboard: 'Dashboard', agenda: 'Agenda', prontuario: 'Prontuário (PEP)', pacientes: 'Pacientes',
    profissionais: 'Profissionais', convenios: 'Convênios', documentos: 'Documentos & PDF',
    odontologia: 'Odontologia', financeiro: 'Financeiro', estoque: 'Estoque', crm: 'CRM',
    whatsapp: 'WhatsApp', caixa: 'Caixa', repasses: 'Repasses', configuracoes: 'Configurações',
    importar: 'Importar', auditoria: 'Auditoria'
  };

  function icon(paths, className = 'nav-lucide-icon') {
    return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  }

  const NAV_ICONS = {
    dashboard: icon('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'),
    agenda: icon('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
    prontuario: icon('<path d="M9 5h6"/><path d="M9 9h6"/><path d="M9 13h4"/><path d="M5 3h14v18H5z"/>'),
    pacientes: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    profissionais: icon('<path d="M12 2v6"/><path d="M9 5h6"/><circle cx="12" cy="13" r="3"/><path d="M5 22a7 7 0 0 1 14 0"/>'),
    convenios: icon('<path d="M3 6h18"/><path d="M7 12h10"/><path d="M7 16h6"/><rect width="18" height="16" x="3" y="4" rx="2"/>'),
    documentos: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>'),
    odontologia: icon('<path d="M12 3c-2.5-2-7-1-8 3-1 4 2 6 3 10 .7 3 1.5 5 3 5 1.2 0 1.2-4 2-4s.8 4 2 4c1.5 0 2.3-2 3-5 1-4 4-6 3-10-1-4-5.5-5-8-3z"/>'),
    financeiro: icon('<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/><path d="M6 15h2"/>'),
    estoque: icon('<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>'),
    crm: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/>'),
    whatsapp: icon('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8Z"/>'),
    caixa: icon('<path d="M2 9h20"/><path d="M4 9V5h16v4"/><path d="M5 9v10h14V9"/><path d="M9 13h6"/>'),
    repasses: icon('<path d="M7 7h11l-3-3"/><path d="m18 7-3 3"/><path d="M17 17H6l3 3"/><path d="m6 17 3-3"/>'),
    configuracoes: icon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
    importar: icon('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    auditoria: icon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>')
  };

  const SEARCH_ICON = icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 'shell-lucide-icon');
  const MENU_ICON = icon('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>', 'shell-lucide-icon');
  let moduleObserver = null;
  let mobileMenuReturnFocus = null;
  let drawerEventsBound = false;

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
    appendStylesheet('link[data-plennus-clinical-operational]', 'css/clinical-operational.css', 'plennusClinicalOperational');
  }

  function addClass(target, className) {
    if (target && !target.classList.contains(className)) target.classList.add(className);
  }

  function associateFormLabels() {
    document.querySelectorAll('.form-group label:not([for]), .field-group label:not([for])').forEach(label => {
      const group = label.closest('.form-group, .field-group');
      const control = group?.querySelector('input[id], select[id], textarea[id]');
      if (!control) return;
      label.htmlFor = control.id;
      if (control.required) control.setAttribute('aria-required', 'true');
    });
  }

  function decorateNavigationIcons() {
    const sidebarMenu = document.querySelector('.sidebar .menu');
    if (sidebarMenu && !sidebarMenu.id) sidebarMenu.id = 'sidebar-menu';
    document.querySelectorAll('.menu-item[data-page]').forEach(item => {
      const page = item.dataset.page;
      const label = MENU_LABELS[page] || PAGE_TITLES[page] || item.textContent.trim();
      item.innerHTML = `${NAV_ICONS[page] || icon('<circle cx="12" cy="12" r="8"/>')}<span class="menu-item-label">${label}</span>`;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', label);
      if (item.dataset.keyboardNavigation === '1') return;
      item.dataset.keyboardNavigation = '1';
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });
    });
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
    associateFormLabels();
  }

  function observePremiumModules() {
    const main = document.querySelector('.main-content');
    if (!main || moduleObserver || typeof MutationObserver === 'undefined') return;
    moduleObserver = new MutationObserver(() => {
      applyPremiumModuleClasses();
      associateFormLabels();
    });
    moduleObserver.observe(main, { childList: true });
  }

  function initials(value) {
    const parts = String(value || '').replace(/^Olá,\s*/i, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'PL';
    return `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
  }

  function syncClinicIdentity() {
    const clinicName = document.getElementById('shell-clinic-name');
    if (!clinicName) return;
    try {
      const clinic = root.PlennusClinic?.obterDadosClinica?.();
      clinicName.textContent = clinic?.nome || 'Plennus Clinic';
    } catch (_) {
      clinicName.textContent = 'Plennus Clinic';
    }
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
    syncClinicIdentity();
  }

  function closeMobileSidebar(restoreFocus = true) {
    const menuButton = document.getElementById('shell-mobile-menu');
    const backdrop = document.getElementById('shell-menu-backdrop');
    document.body.classList.remove('sidebar-drawer-open');
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Abrir menu principal');
    }
    if (backdrop) backdrop.hidden = true;
    if (restoreFocus && mobileMenuReturnFocus && typeof mobileMenuReturnFocus.focus === 'function') {
      mobileMenuReturnFocus.focus();
    }
    mobileMenuReturnFocus = null;
  }

  function toggleMobileSidebar() {
    const isOpen = document.body.classList.contains('sidebar-drawer-open');
    if (isOpen) return closeMobileSidebar();
    const menuButton = document.getElementById('shell-mobile-menu');
    const backdrop = document.getElementById('shell-menu-backdrop');
    mobileMenuReturnFocus = document.activeElement;
    document.body.classList.add('sidebar-drawer-open');
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', 'true');
      menuButton.setAttribute('aria-label', 'Fechar menu principal');
    }
    if (backdrop) backdrop.hidden = false;
    const items = Array.from(document.querySelectorAll('#sidebar-menu .menu-item'));
    const firstVisible = items.find(item => item.offsetParent !== null) || items[0];
    if (firstVisible && typeof firstVisible.focus === 'function') firstVisible.focus();
  }

  function ensureMobileSidebarControls() {
    const sidebarMenu = document.querySelector('.sidebar .menu');
    if (sidebarMenu && !sidebarMenu.id) sidebarMenu.id = 'sidebar-menu';
    let backdrop = document.getElementById('shell-menu-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'shell-menu-backdrop';
      backdrop.className = 'shell-menu-backdrop';
      backdrop.hidden = true;
      document.body.appendChild(backdrop);
    }
    if (drawerEventsBound) return;
    drawerEventsBound = true;
    backdrop.addEventListener('click', () => closeMobileSidebar());
    document.getElementById('shell-mobile-menu')?.addEventListener('click', toggleMobileSidebar);
    document.querySelectorAll('#sidebar-menu .menu-item').forEach(item => {
      item.addEventListener('click', () => closeMobileSidebar(false));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.body.classList.contains('sidebar-drawer-open')) {
        event.preventDefault();
        closeMobileSidebar();
      }
    });
  }

  function ensureShellTopbar() {
    ensureStylesheet();
    applyPremiumModuleClasses();
    observePremiumModules();
    decorateNavigationIcons();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('shell-topbar')) {
      syncShellIdentity();
      ensureMobileSidebarControls();
      return;
    }
    const topbar = document.createElement('header');
    topbar.id = 'shell-topbar';
    topbar.className = 'shell-topbar';
    topbar.innerHTML = `
      <button id="shell-mobile-menu" class="shell-mobile-menu" type="button" aria-label="Abrir menu principal" aria-expanded="false" aria-controls="sidebar-menu">${MENU_ICON}</button>
      <div class="shell-context"><span class="shell-eyebrow" id="shell-clinic-name">Plennus Clinic</span><strong id="shell-page-title">Visão geral</strong></div>
      <div class="shell-search-wrap">
        <span class="shell-search-icon" aria-hidden="true">${SEARCH_ICON}</span>
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
    ensureMobileSidebarControls();
    syncShellIdentity();
  }

  function setPageTitle(page) {
    const title = document.getElementById('shell-page-title');
    if (title) title.textContent = PAGE_TITLES[page] || page || 'Plennus Clinic';
    applyPremiumModuleClasses();
    decorateNavigationIcons();
    syncShellIdentity();
    if (document.body.classList.contains('sidebar-drawer-open')) closeMobileSidebar(false);
  }

  function setupShell() {
    ensureShellTopbar();
    applyPremiumModuleClasses();
    observePremiumModules();
    decorateNavigationIcons();
    associateFormLabels();
    ensureMobileSidebarControls();
    syncShellIdentity();
  }

  root.PlennusShell = {
    PAGE_TITLES, NAV_ICONS, ensureStylesheet, ensureShellTopbar, applyPremiumModuleClasses,
    applyAdministrativePremiumClasses, applyFinalPremiumClasses, decorateNavigationIcons,
    associateFormLabels, syncClinicIdentity, syncShellIdentity, toggleMobileSidebar,
    closeMobileSidebar, setPageTitle, setupShell
  };
})(typeof window !== 'undefined' ? window : globalThis);
