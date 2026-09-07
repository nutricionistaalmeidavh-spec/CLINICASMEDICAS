(function (root) {
  const bridge = () => root.electronAPI?.clinicNetwork || null;
  let lastStatus = null;
  let clientMode = false;

  async function status() {
    const api = bridge();
    if (!api?.status) return { mode: 'standalone', paired: false, connected: false, pendingMutations: 0 };
    lastStatus = await api.status();
    clientMode = lastStatus?.mode === 'client';
    root.DB?.setNetworkClientMode?.(clientMode);
    return lastStatus;
  }

  async function authenticateRemoteProfessional(username, password) {
    const api = bridge();
    if (!api?.login) throw new Error('Clinic Network indisponível neste computador.');
    const result = await api.login({ username, password });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível autenticar no Clinic Hub.');
    clientMode = true;
    root.DB?.setNetworkClientMode?.(true);
    if (result.snapshot) await root.DB?.syncSharedSnapshot?.(result.snapshot);
    if (result.session) await root.DB?.activateSession?.(result.session);
    lastStatus = result.network || await status();
    return { ok: true, user: result.user, session: result.session, network: lastStatus };
  }

  async function sync() {
    const api = bridge();
    if (!api?.sync) throw new Error('Clinic Network indisponível.');
    const result = await api.sync();
    if (!result?.ok) throw new Error(result?.error || 'Falha ao sincronizar com o Clinic Hub.');
    if (result.snapshot) await root.DB?.syncSharedSnapshot?.(result.snapshot);
    lastStatus = result.network || lastStatus;
    return result;
  }

  async function mutate(command, data = {}) {
    const api = bridge();
    if (!api?.mutate) return { ok: false, error: 'Clinic Network indisponível.' };
    const result = await api.mutate({ command, data });
    if (result?.ok) {
      status().catch(() => {});
      return result;
    }
    throw new Error(result?.error || 'Falha ao sincronizar alteração com o Clinic Hub.');
  }

  async function disconnect() {
    const api = bridge();
    try { if (api?.disconnect) await api.disconnect(); }
    finally {
      clientMode = false;
      lastStatus = null;
      root.DB?.setNetworkClientMode?.(false);
    }
  }

  async function discover() {
    const api = bridge();
    if (!api?.discover) return [];
    const result = await api.discover();
    if (!result?.ok) throw new Error(result?.error || 'Falha ao localizar Clinic Hub.');
    return result.hubs || [];
  }

  async function pair(hub, secret) {
    const api = bridge();
    if (!api?.pair) throw new Error('Clinic Network indisponível.');
    const result = await api.pair({ hub, secret });
    if (!result?.ok) throw new Error(result?.error || 'Falha no pareamento.');
    lastStatus = result;
    clientMode = true;
    root.DB?.setNetworkClientMode?.(true);
    return result;
  }

  function isClientMode() { return clientMode || lastStatus?.mode === 'client'; }
  function cachedStatus() { return lastStatus ? { ...lastStatus } : null; }

  root.PlennusClinicNetwork = {
    status,
    authenticateRemoteProfessional,
    sync,
    mutate,
    disconnect,
    discover,
    pair,
    isClientMode,
    cachedStatus
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => { status().catch(() => {}); }, { once: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);