(function (root) {
  function mapClinicConfigRows(rows) {
    const cfg = {};
    (rows || []).forEach(row => {
      if (row && row.chave) cfg[row.chave] = row.valor;
    });

    return {
      nome: cfg.nome_clinica || 'Plennus Clinic',
      endereco: cfg.endereco_clinica || 'Endereço da Clínica',
      telefone: cfg.telefone_clinica || '(00) 0000-0000',
      cidade: cfg.cidade_clinica || 'Cidade - UF',
      cnpj: cfg.cnpj_clinica || '00.000.000/0001-00',
      cor: cfg.cor_primaria || '#C41E3A',
    };
  }

  function obterDadosClinica() {
    if (!root.DB || typeof root.DB.query !== 'function') {
      return mapClinicConfigRows([]);
    }
    return mapClinicConfigRows(root.DB.query('SELECT * FROM configuracoes'));
  }

  const api = { mapClinicConfigRows, obterDadosClinica };
  root.PlennusClinic = api;
  root.obterDadosClinica = obterDadosClinica;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
