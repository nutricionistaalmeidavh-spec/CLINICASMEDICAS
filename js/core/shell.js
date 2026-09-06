(function (root) {
  const PAGE_TITLES = {
    dashboard: 'Visão geral', agenda: 'Agenda & Sala de Espera', prontuario: 'Prontuário eletrônico',
    pacientes: 'Pacientes', profissionais: 'Profissionais', convenios: 'Convênios e procedimentos',
    documentos: 'Documentos & PDF', caixa: 'Caixa', repasses: 'Repasses', configuracoes: 'Configurações',
    importar: 'Importar pacientes', auditoria: 'Auditoria'
  };

  function ensureStylesheet() {
    if (document.querySelector('link[data-plennus-platform]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/platform.css';
    link.dataset.plennusPlatform = '1';
    document.head.appendChild(link);
  }

  function ensureShellTopbar() {
    ensureStylesheet();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('shell-topbar')) return;
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
      </div>`;
    main.prepend(topbar);
  }

  function setPageTitle(page) {
    const title = document.getElementById('shell-page-title');
    if (title) title.textContent = PAGE_TITLES[page] || page || 'Plennus Clinic';
  }

  function setupShell() { ensureShellTopbar(); }

  root.PlennusShell = { PAGE_TITLES, ensureStylesheet, ensureShellTopbar, setPageTitle, setupShell };
})(typeof window !== 'undefined' ? window : globalThis);
