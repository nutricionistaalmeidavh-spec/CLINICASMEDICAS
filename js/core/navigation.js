(function (root) {
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
    caixa: () => carregarCaixa(),
    repasses: () => {
      carregarSelectsRepasse();
      carregarRepasses();
    },
    configuracoes: () => {
      carregarConfig();
      carregarUsuariosConfig();
    },
  };

  function setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
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

  root.PlennusNavigation = { PAGE_LOADERS, setupNavigation, navegar, setupTabs };
  root.setupNavigation = setupNavigation;
  root.navegar = navegar;
  root.setupTabs = setupTabs;
})(typeof window !== 'undefined' ? window : globalThis);
