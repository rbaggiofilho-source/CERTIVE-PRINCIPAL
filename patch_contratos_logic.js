const fs = require('fs');
let content = fs.readFileSync('js/contratos.js', 'utf8');

const replacementLogic = `    let filled = contractText;
    
    // Resolve Clause 3.2
    if (isTransferencia && os.osFinalidade === 'Compra/Venda') {
        filled = filled.replace('**poderá [OPCIONAL: ser / não ser]**', '**poderá ser**');
    } else {
        filled = filled.replace('**poderá [OPCIONAL: ser / não ser]**', '**poderá não ser**');
    }
    
    // Resolve Clause 5.2.b
    if (isTransferencia && os.osFinalidade === 'Compra/Venda') {
        filled = filled.replace('b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.', 
                                'b) Fui orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.');
    } else {
        filled = filled.replace('b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.', '');
    }
    
    // Resolve Aceite options
    if (isTransferencia) {
        filled = filled.replace('[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).', '[X] Estou ciente da regra de reapresentação em 30 dias (M1.3).');
        filled = filled.replace('[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).', '');
    } else if (isCautelar || isPesquisa) {
        filled = filled.replace('[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).', '');
        filled = filled.replace('[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).', '[X] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).');
    } else {
        filled = filled.replace('[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).', '');
        filled = filled.replace('[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).', '');
    }
    
    // Resolve electronic signature block
    if (os.contratoHash) {
        filled = filled.replace('[OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}]', 
                                \`eletronicamente, com aceite registrado no sistema sob hash **\${os.contratoHash}** em **\${formatDateTimeBr(os.contratoAceitoEm)}**\`);
    } else {
        filled = filled.replace('[OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}]', 
                                'eletronicamente (Assinatura Eletrônica pendente)');
    }`;

content = content.replace(
    /let filled = contractText;/,
    replacementLogic
);

fs.writeFileSync('js/contratos.js', content, 'utf8');
