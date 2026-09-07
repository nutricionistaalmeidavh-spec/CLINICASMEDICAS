(function (root) {
  const DEFAULT_PROVIDER = Object.freeze({
    id: 'utw',
    name: 'UTW Certificação',
    storeUrl: 'https://emitircertificadodigital.org/artisys',
    products: Object.freeze([
      Object.freeze({ code: 'ecnpj-a1', label: 'e-CNPJ A1', price: 157, partnerCost: 97, margin: 60 }),
      Object.freeze({ code: 'ecpf-a1', label: 'e-CPF A1', price: 157, partnerCost: 87, margin: 70 })
    ])
  });

  function cloneProvider(provider) {
    return {
      id: provider.id,
      name: provider.name,
      storeUrl: provider.storeUrl,
      products: provider.products.map(product => ({ ...product }))
    };
  }

  function getDefaultProvider() {
    return cloneProvider(DEFAULT_PROVIDER);
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function mount({ container, provider = getDefaultProvider(), openExternal } = {}) {
    if (!container || typeof container.appendChild !== 'function') throw new Error('Container do certificado digital inválido.');
    if (typeof openExternal !== 'function') throw new Error('Abertura externa indisponível.');
    if (!/^https:\/\//i.test(String(provider.storeUrl || ''))) throw new Error('Endereço da loja de certificados inválido.');

    container.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card commercial-service-card certificate-service-card';

    const heading = document.createElement('div');
    heading.className = 'card-title';
    heading.textContent = 'Certificado Digital';
    card.appendChild(heading);

    const description = document.createElement('p');
    description.className = 'text-muted';
    description.textContent = 'Emita ou renove seu certificado A1 por meio do parceiro de certificação. O Plennus não recebe os dados da emissão.';
    card.appendChild(description);

    const list = document.createElement('div');
    list.className = 'commercial-service-products';
    provider.products.forEach(product => {
      const row = document.createElement('div');
      row.className = 'commercial-service-product';
      const label = document.createElement('strong');
      label.textContent = product.label;
      const price = document.createElement('span');
      price.textContent = money(product.price);
      row.append(label, price);
      list.appendChild(row);
    });
    card.appendChild(list);

    const note = document.createElement('p');
    note.className = 'text-muted';
    note.style.marginTop = '10px';
    note.textContent = `Operado por ${provider.name}. A compra é concluída fora do Plennus.`;
    card.appendChild(note);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary btn-sm';
    button.textContent = 'Emitir ou renovar certificado';
    button.addEventListener('click', () => openExternal(provider.storeUrl));
    card.appendChild(button);

    container.appendChild(card);
    return { provider: cloneProvider(provider), destroy: () => { container.innerHTML = ''; } };
  }

  const api = { getDefaultProvider, mount };
  root.PlennusCertificateDigital = api;
})(typeof window !== 'undefined' ? window : globalThis);
