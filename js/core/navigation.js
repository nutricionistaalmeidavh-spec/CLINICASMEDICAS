(function (root) {
  const CORE_SCRIPTS = [
    'js/modules/workflow-core/errors.js',
    'js/modules/workflow-core/event-bus.js',
    'js/modules/workflow-core/workflow-engine.js',
    'js/modules/workflow-core/effect-runner.js',
    'js/modules/workflow-core/outbox.js',
    'js/modules/workflow-core/reconciliation.js',
    'js/modules/workflow-core/adapters/memory-store.js',
    'js/modules/workflow-core/adapters/sqlite-store.js',
    'js/modules/workflow-core/workflow-core.js',
    'js/core/data-isolation.js',
    'js/core/clinic-network-client.js',
    'js/core/database-isolation-router-safe.js',
    'js/core/clinical-model.js',
    'js/core/operations-model.js',
    'js/core/workflow-guards.js',
    'js/core/odontology-model.js',
    'js/core/supernumerary-model.js',
    'js/core/migrations.js',
    'js/core/supernumerary-migration.js',
    'js/core/workflow-core-migration.js',
    'js/core/audit.js',
    'js/core/import-model.js',
    'js/core/document-renderer.js',
    'js/core/shell.js',
    'js/core/global-search.js',
  ];

  const DOMAIN_SCRIPTS = [
    'js/domains/appointment-workflow-definition.js',
    'js/domains/dashboard.js',
    'js/domains/dashboard-role-isolation.js',
    'js/domains/clinic-network-status.js',
    'js/domains/patients.js',
    'js/domains/professionals.js',
    'js/domains/agenda.js',
    'js/domains/pep.js',
    'js/domains/documents.js',
    'js/domains/finance.js',
    'js/domains/settings.js',
    'js/domains/composite-backup-ui.js',
    'js/domains/professional-user-link.js',
    'js/domains/patient-workspace.js',
    'js/domains/clinical-files.js',
    'js/domains/consents.js',
    'js/domains/labs.js',
    'js/domains/clinical-timeline.js',
    'js/domains/clinical-pending.js',
    'js/domains/imports.js',
    'js/domains/audit-view.js',
    'js/domains/platform-documents.js',
    'js/domains/supernumerary-database.js',
    'js/domains/odontology.js',
    'js/domains/dental-finance.js',
    'js/domains/finance-advanced.js',
    'js/domains/inventory.js',
    'js/domains/crm.js',
    'js/domains/whatsapp-automation.js',
    'js/domains/whatsapp-recurring.js',
    'js/domains/operations-integration.js',
    'js/domains/workflow-stabilization.js',
    'js/domains/workflow-completion.js',
    'js/domains/backup-restore-coordinator.js',
    'js/domains/clinic-network-workflow.js',
    'js/domains/appointment-orchestrator.js',
    'js/domains/appointment-effects.js',
    'js/domains/appointment-reconciliation.js',
    'js/domains/commercial-services.js',
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
    pacientes: () => {
      carregarPacientes();
      root.PlennusClinicNetworkWorkflow?.applyRemoteUiGuards?.();
    },
    profissionais: () => carregarProfissionais(),
    convenios: () => {
      carregarConvenios();
      carregarProcedimentos();
    },
    documentos: () => {
      carregarSelectsDocs();
      carregarTemplate();
    },
    odontologia: () => root.PlennusOdontology?.carregarOdontologia(),
    financeiro: () => root.PlennusFinanceAdvanced?.carregarFinanceiroAvancado(),
    estoque: () => root.PlennusInventory?.carregarEstoque(),
    crm: () => root.PlennusCRM?.carregarCRM(),
    whatsapp: () => {
      root.PlennusWhatsappRecurring?.syncAllRecurring();
      root.PlennusWhatsAppAutomation?.carregarWhatsApp();
    },
    caixa: () => carregarCaixa(),
    repasses: () => {
      carregarSelectsRepasse();
      carregarRepasses();
    },
    configuracoes: () => {
      carregarConfig();
      carregarUsuariosConfig();
      root.PlennusClinicNetworkStatus?.renderSettings?.();
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

  function currentRole() {
    return typeof currentUser !== 'undefined' ? currentUser?.nivel || null : null;
  }

  function canNavigate(page) {
    const role = currentRole();
    if (!role) return false;
    if (!root.PlennusAccessControl?.canNavigateToPage) return true;
    return root.PlennusAccessControl.canNavigateToPage(role, page);
  }

  function navegar(page) {
    if (!canNavigate(page)) {
      console.warn(`Navegação bloqueada para a página ${page}.`);
      return false;
    }

    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById('page-' + page);
    if (!targetPage) return false;
    targetPage.classList.add('active');
    root.PlennusShell?.setPageTitle(page);

    const loader = PAGE_LOADERS[page];
    if (loader) loader();
    root.PlennusClinicNetworkWorkflow?.applyRemoteUiGuards?.();
    return true;
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

  root.PlennusNavigation = { CORE_SCRIPTS, DOMAIN_SCRIPTS, PAGE_LOADERS, loadDomainScripts, setupNavigation, navegar, setupTabs, canNavigate };
  root.setupNavigation = setupNavigation;
  root.navegar = navegar;
  root.setupTabs = setupTabs;

  loadDomainScripts();
})(typeof window !== 'undefined' ? window : globalThis);
