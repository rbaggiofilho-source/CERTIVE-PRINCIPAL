// ==========================================
// LAUDO CAUTELAR — ponto de entrada da geração do PDF
// ==========================================
// O laudo oficial é SEMPRE o modelo padrão desenhado por js/laudo_certive.js
// (gerarLaudoCertive, modelo LCAV). Se ele não carregou, a emissão para com erro:
// nunca cai em outro modelo. O modelo antigo (PDF editável preenchido por campos,
// com as imagens pagina_*.png) foi removido; está no histórico do git.

async function generateInspectionReport(cautelarId) {
    if (typeof gerarLaudoCertive !== 'function') {
        throw new Error('O modelo oficial do laudo não carregou. Verifique a conexão e recarregue a página antes de emitir.');
    }
    return gerarLaudoCertive(cautelarId);
}

// A pré-visualização (atualizarPreviewLaudo) é definida em js/laudo_certive.js.
