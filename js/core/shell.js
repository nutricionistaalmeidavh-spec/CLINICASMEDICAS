(function (root) {
  const PAGE_TITLES = {
    dashboard: 'Visão geral', agenda: 'Agenda & Sala de Espera', prontuario: 'Prontuário eletrônico',
    pacientes: 'Pacientes', profissionais: 'Profissionais', convenios: 'Convênios e procedimentos',
    documentos: 'Documentos & PDF', odontologia: 'Odontologia', financeiro: 'Financeiro', estoque: 'Estoque clínico',
    crm: 'CRM de pacientes', whatsapp: 'WhatsApp operacional', caixa: 'Caixa', repasses: 'Repasses',
    configuracoes: 'Configurações', importar: 'Importar pacientes', auditoria: 'Auditoria'
  };

  function ensureStylesheet() {
    if (!document.querySelector('link[data-plennus-platform]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/platform.css';
      link.dataset.plennusPlatform = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[data-plennus-operations]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/operations.css';
      link.dataset.plennusOperations = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[data-plennus-odontology]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/odontology.css';
      link.dataset.plennusOdontology = '1';
      document.head.appendChild(link);
    }
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
    syncShellIdentity();
  }

  function setupShell() {
    ensureShellTopbar();
    syncShellIdentity();
  }

  root.PlennusShell = { PAGE_TITLES, ensureStylesheet, ensureShellTopbar, syncShellIdentity, setPageTitle, setupShell };
})(typeof window !== 'undefined' ? window : globalThis);
