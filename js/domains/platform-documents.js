(function (root) {
  function legacyBodyToSections(corpoHtml) {
    return [root.PlennusDocumentRenderer.section('', String(corpoHtml || ''), { keepTogether: false })];
  }

  function gerarHtmlDocumentoTimbrado({ titulo, paciente, profissional, corpoHtml }) {
    const clinica = typeof root.obterDadosClinica === 'function' ? root.obterDadosClinica() : {};
    return root.PlennusDocumentRenderer.renderDocument({
      title: titulo,
      clinic: clinica,
      patient: paciente || {},
      professional: profissional || {},
      sections: legacyBodyToSections(corpoHtml),
      footer: typeof root.hoje === 'function' ? root.hoje() : ''
    });
  }

  async function carregarImagensClinicasParaDocumento(fileRows, maxImages = 6) {
    if (!root.electronAPI?.lerImagemClinicaParaDocumento) return [];
    const rows = (fileRows || []).filter(row => row?.caminho_arquivo).slice(0, Math.max(0, Math.min(maxImages, 12)));
    const images = [];
    for (const row of rows) {
      const result = await root.electronAPI.lerImagemClinicaParaDocumento(row.caminho_arquivo);
      if (result?.ok && result.dataUrl) images.push({ name: row.nome_arquivo || result.name, dataUrl: result.dataUrl });
    }
    return images;
  }

  root.gerarHtmlDocumentoTimbrado = gerarHtmlDocumentoTimbrado;
  root.PlennusPlatformDocuments = { gerarHtmlDocumentoTimbrado, carregarImagensClinicasParaDocumento };
})(typeof window !== 'undefined' ? window : globalThis);
