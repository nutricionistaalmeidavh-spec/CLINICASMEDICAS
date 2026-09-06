(function (root) {
  const CORE_SCRIPTS = [
    'js/core/clinical-model.js',
    'js/core/operations-model.js',
    'js/core/migrations.js',
    'js/core/audit.js',
    'js/core/import-model.js',
    'js/core/document-renderer.js',
    'js/core/shell.js',
    'js/core/global-search.js',
  ];

  const DOMAIN_SCRIPTS = [
    'js/domains/dashboard.js',
    'js/domains/patients.js',
    'js/domains/professionals.js',
    'js/domains/agenda.js',
    'js/domains/pep.js',
    'js/domains/documents.js',
    'js/domains/finance.js',
    'js/domains/settings.js',
    'js/domains/patient-workspace.js',
    'js/domains/clinical-files.js',
    'js/domains/consents.js',
    'js/domains/labs.js',
    'js/domains/clinical-timeline.js',
    'js/domains/clinical-pending.js',
    'js/domains/imports.js',
    'js/domains/audit-view.js',
    'js/domains/platform-documents.js',
    'js/domains/finance-advanced.js',
    'js/domains/inventory.js',
    'js/domains/crm.js',
    'js/domains/whatsapp-automation.js',
    'js/domains/operations-integration.js',
  ];

  function loadDomainScripts() {
    if (typeof document === 'undefined' || document.readyState !== 'loading') return;
    const scripts = [...CORE_SCRIPTS, ...DOMAIN_SCRIPTS];
    document.write(scripts.map(src => `<script src="${src}"><\/script>`).join(''));
  }

  const PAGE_LOADERS = {
    dashboard: () => carregarDashboard(),
    agenda: () => {
      carregarSelectsAgenda();
      atualizarInputsDataAgenda();
      recarregarVisaoAgendaAtual();
      carregarGrade();
    },
    prontuario: () => carregarSelectsPep(),
    pacientes: () => carregarPacientes(),
    profissionais: () => carregarProfissionais(),
    convenios: () => {
      carregarConvenios();
      carregarProcedimentos();
    },
    documentos: () => {
      carregarSelectsDocs();
      carregarTemplate();
    },
    financeiro: () => root.PlennusFinanceAdvanced?.carregarFinanceiroAvancado(),
    estoque: () => root.PlennusInventory?.carregarEstoque(),
    crm: () => root.PlennusCRM?.carregarCRM(),
    whatsapp: () => root.PlennusWhatsAppAutomation?.carregarWhatsApp(),
    caixa: () => carregarCaixa(),
    repasses: () => {
      carregarSelectsRepasse();
      carregarRepasses();
    },
    configuracoes: () => {
      carregarConfig();
      carregarUsuariosConfig();
    },
    importar: () => carregarImportacao(),
    auditoria: () => carregarAuditoria(),
  };

  function setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
      if (item.dataset.navigationBound === '1') return;
      item.dataset.navigationBound = '1';
      item.addEventListener('click', () => navegar(item.dataset.page));
    });
  }

  function navegar(page) {
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById('page-' + page);
    if (!targetPage) return;
    targetPage.classList.add('active');
    root.PlennusShell?.setPageTitle(page);

    const loader = PAGE_LOADERS[page];
    if (loader) loader();
  }

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.page');
        if (!parent) return;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const targetContent = parent.querySelector('#tab-' + btn.dataset.tab);
        if (targetContent) targetContent.classList.add('active');
        if (parent.id === 'page-agenda') recarregarVisaoAgendaAtual();
      });
    });
  }

  root.PlennusNavigation = { CORE_SCRIPTS, DOMAIN_SCRIPTS, PAGE_LOADERS, loadDomainScripts, setupNavigation, navegar, setupTabs };
  root.setupNavigation = setupNavigation;
  root.navegar = navegar;
  root.setupTabs = setupTabs;

  loadDomainScripts();
})(typeof window !== 'undefined' ? window : globalThis);
