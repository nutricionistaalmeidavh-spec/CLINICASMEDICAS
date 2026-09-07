(function (root) {
  let discoveredHubs = [];

  function bridge() { return root.electronAPI?.clinicNetwork || null; }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function describe(status) {
    if (!status) return 'Rede local indisponível';
    if (status.mode === 'hub') return status.hubRunning ? 'Clinic Hub ativo' : 'Clinic Hub parado';
    if (status.mode === 'client') {
      if (!status.paired) return 'Cliente LAN não pareado';
      if (status.connected) return status.pendingMutations ? `Conectado • ${status.pendingMutations} pendente(s)` : 'Conectado ao Clinic Hub';
      return status.pendingMutations ? `Offline • ${status.pendingMutations} pendente(s)` : 'Clinic Hub offline';
    }
    return 'Modo local';
  }

  async function refresh() {
    const api = bridge();
    if (!api?.status) return null;
    const status = await api.status();
    const footer = document.querySelector('.sidebar-footer');
    if (footer) {
      let badge = document.getElementById('clinic-network-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'clinic-network-badge';
        badge.style.cssText = 'font-size:11px;margin:0 0 10px;padding:7px 8px;border-radius:6px;background:rgba(255,255,255,.08);line-height:1.35;';
        footer.insertBefore(badge, footer.firstChild);
      }
      badge.textContent = describe(status);
      badge.title = status.lastSyncAt ? `Última sincronização: ${status.lastSyncAt}` : 'Estado da rede local da clínica';
    }
    updateLoginStatus(status);
    updateSettingsStatus(status);
    return status;
  }

  function renderLoginSetup() {
    const body = document.querySelector('#login-screen .login-body');
    if (!body || document.getElementById('clinic-network-login-setup')) return;
    const panel = document.createElement('div');
    panel.id = 'clinic-network-login-setup';
    panel.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px solid rgba(0,0,0,.1);font-size:12px;';
    panel.innerHTML = `
      <button type="button" class="btn btn-sm btn-secondary" style="width:100%;" onclick="clinicNetworkDiscover()">Acesso de profissional pela rede local</button>
      <div id="clinic-network-login-details" style="display:none;margin-top:10px;">
        <div id="clinic-network-discovery-result" class="text-muted" style="margin-bottom:8px;">Localize o computador da recepção.</div>
        <select id="clinic-network-hub-select" style="width:100%;margin-bottom:8px;"></select>
        <input id="clinic-network-pair-code" type="text" autocomplete="off" placeholder="Código de pareamento" style="width:100%;margin-bottom:8px;text-transform:uppercase;">
        <button type="button" class="btn btn-sm btn-primary" style="width:100%;" onclick="clinicNetworkPair()">Parear este computador</button>
      </div>
      <div id="clinic-network-login-status" class="text-muted" style="margin-top:8px;text-align:center;"></div>`;
    body.appendChild(panel);
    refresh().catch(() => {});
  }

  function updateLoginStatus(status) {
    const el = document.getElementById('clinic-network-login-status');
    if (!el) return;
    if (status?.mode === 'client' && status.paired) {
      el.textContent = status.hub?.hostname ? `Profissional conectado à clínica: ${status.hub.hostname}` : 'Computador configurado como cliente da clínica';
    } else if (status?.mode === 'hub') {
      el.textContent = 'Este computador está configurado como Clinic Hub.';
    } else {
      el.textContent = '';
    }
  }

  async function clinicNetworkDiscover() {
    const details = document.getElementById('clinic-network-login-details');
    const resultEl = document.getElementById('clinic-network-discovery-result');
    const select = document.getElementById('clinic-network-hub-select');
    if (details) details.style.display = 'block';
    if (resultEl) resultEl.textContent = 'Procurando Clinic Hub na rede local...';
    try {
      discoveredHubs = await root.PlennusClinicNetwork?.discover?.() || [];
      if (!discoveredHubs.length) {
        if (resultEl) resultEl.textContent = 'Nenhum Clinic Hub encontrado. Verifique se o computador da recepção está ligado e na mesma rede.';
        if (select) select.innerHTML = '';
        return;
      }
      if (select) {
        select.innerHTML = discoveredHubs.map((hub, index) => `<option value="${index}">${esc(hub.hostname || 'Clinic Hub')} • ${esc(hub.address)}</option>`).join('');
      }
      if (resultEl) resultEl.textContent = `${discoveredHubs.length} Clinic Hub encontrado(s). Informe o código gerado na recepção.`;
    } catch (error) {
      if (resultEl) resultEl.textContent = error.message || 'Falha ao procurar o Clinic Hub.';
    }
  }

  async function clinicNetworkPair() {
    const select = document.getElementById('clinic-network-hub-select');
    const code = document.getElementById('clinic-network-pair-code')?.value?.trim();
    const resultEl = document.getElementById('clinic-network-discovery-result');
    const hub = discoveredHubs[Number(select?.value || 0)];
    if (!hub) return alert('Selecione um Clinic Hub encontrado na rede.');
    if (!code) return alert('Informe o código de pareamento gerado no computador da recepção.');
    try {
      await root.PlennusClinicNetwork.pair(hub, code);
      if (resultEl) resultEl.textContent = 'Pareamento concluído. Agora entre com o usuário profissional.';
      await refresh();
    } catch (error) {
      alert(error.message || 'Não foi possível parear este computador.');
    }
  }

  function renderSettings() {
    const page = document.getElementById('page-configuracoes');
    if (!page || document.getElementById('clinic-network-settings')) {
      refresh().catch(() => {});
      return;
    }
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'clinic-network-settings';
    card.innerHTML = `
      <div class="card-title">Rede local da clínica</div>
      <p class="text-muted mb-10">Use um computador como Clinic Hub para compartilhar agenda e dados administrativos com os profissionais na mesma rede local. Prontuários permanecem nos computadores dos profissionais.</p>
      <div id="clinic-network-settings-status" class="mb-10"></div>
      <div class="form-actions" style="flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="clinicNetworkStartHub()">Ativar este computador como Hub</button>
        <button class="btn btn-secondary btn-sm" onclick="clinicNetworkStopHub()">Parar Hub</button>
        <button class="btn btn-info btn-sm" onclick="clinicNetworkCreatePairing()">Gerar código de pareamento</button>
      </div>
      <div id="clinic-network-pairing-output" style="margin-top:12px;"></div>`;
    const backupCard = page.querySelector('.card:nth-last-of-type(2)');
    if (backupCard) page.insertBefore(card, backupCard);
    else page.appendChild(card);
    refresh().catch(() => {});
  }

  function updateSettingsStatus(status) {
    const el = document.getElementById('clinic-network-settings-status');
    if (!el) return;
    const hubName = status?.hub?.hostname ? ` • ${esc(status.hub.hostname)}` : '';
    el.innerHTML = `<strong>${esc(describe(status))}</strong>${hubName}${status?.lastSyncAt ? `<br><small class="text-muted">Última sincronização: ${esc(status.lastSyncAt)}</small>` : ''}`;
  }

  async function clinicNetworkStartHub() {
    const result = await bridge()?.startHub?.();
    if (!result?.ok) return alert(result?.error || 'Não foi possível iniciar o Clinic Hub.');
    await refresh();
  }

  async function clinicNetworkStopHub() {
    const result = await bridge()?.stopHub?.();
    if (!result?.ok) return alert(result?.error || 'Não foi possível parar o Clinic Hub.');
    const output = document.getElementById('clinic-network-pairing-output');
    if (output) output.innerHTML = '';
    await refresh();
  }

  async function clinicNetworkCreatePairing() {
    const result = await bridge()?.createPairing?.();
    if (!result?.ok) return alert(result?.error || 'Ative o Clinic Hub antes de gerar um código.');
    const output = document.getElementById('clinic-network-pairing-output');
    if (output) {
      output.innerHTML = `<div style="padding:12px;border:1px solid #ddd;border-radius:8px;"><small class="text-muted">Código temporário para o computador do profissional</small><div style="font-size:22px;font-weight:800;letter-spacing:2px;margin:6px 0;">${esc(result.secret)}</div><small class="text-muted">Válido por aproximadamente 10 minutos e para um pareamento.</small></div>`;
    }
  }

  root.clinicNetworkDiscover = clinicNetworkDiscover;
  root.clinicNetworkPair = clinicNetworkPair;
  root.clinicNetworkStartHub = clinicNetworkStartHub;
  root.clinicNetworkStopHub = clinicNetworkStopHub;
  root.clinicNetworkCreatePairing = clinicNetworkCreatePairing;
  root.PlennusClinicNetworkStatus = { refresh, renderLoginSetup, renderSettings, describe };

  if (typeof document !== 'undefined') {
    const init = () => {
      renderLoginSetup();
      refresh().catch(() => {});
      setInterval(() => refresh().catch(() => {}), 15000);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);