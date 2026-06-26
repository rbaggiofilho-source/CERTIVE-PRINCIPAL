// ==========================================
// CONTRACT GENERATION & SIGNATURE ENGINE
// ==========================================

function generateSignatureHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return 'SIG-' + Math.abs(hash).toString(16).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
}

function generateContractText(os) {
    const unit = db.unidades.find(u => u.id === os.unidadeId) || {};
    const portarias = db.portarias_uf || {};
    const portaria = portarias[unit.uf] || `Portaria DETRAN-${unit.uf || 'SC'} nº [NÃO DEFINIDA]`;
    const service = db.servicos.find(s => s.id === os.servicoId) || {};
    
    const isTransferencia = service.categoria === 'Transferência';
    const isCautelar = service.categoria === 'Cautelar';
    const isPesquisa = service.categoria === 'Pesquisa';
    
    // Compose Parte II Modules
    let modulesText = "";
    if (isTransferencia) {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` + 
                      `**Módulo 1 — Vistoria de Identificação Veicular (Transferência)**\n\n` +
                      `**M1.1. Escopo.** Serviço regulado, destinado a instruir procedimento de trânsito (transferência de propriedade, mudança de município/UF, alteração de característica, inclusão de gravame, entre outros). Nos termos do art. 2º, §2º, da Resolução CONTRAN nº 941/2022, verifica-se: a autenticidade da identificação do veículo e da documentação; a legitimidade da propriedade; a presença e funcionalidade dos equipamentos obrigatórios; e a eventual modificação das características originais e sua regularização. O laudo é eletrônico e só tem validade quando registrado no SISCSV.\n\n` +
                      `**M1.2. Fora do escopo.** Não integram este serviço a avaliação mecânica/estrutural ampla, vícios ocultos, histórico não constante do prontuário, procedência comercial, valor de mercado, débitos ou quilometragem — objeto, no que couber, da Vistoria Cautelar (Módulo 2).\n\n` +
                      `**M1.3. Reprovação - reapresentação em 30 dias.** Em caso de reprovação, o CONTRATANTE poderá sanar as pendências apontadas e reapresentar o veículo, sem nova cobrança, no prazo de 30 (trinta) dias contados da primeira vistoria. Decorrido o prazo, novo serviço será cobrado integralmente.`;
    } else if (isCautelar) {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` +
                      `**Módulo 2 — Vistoria Cautelar**\n\n` +
                      `**M2.1. Natureza.** Serviço privado e facultativo, não regulado por norma de trânsito obrigatória, de avaliação técnica da originalidade e da condição estrutural do veículo, destinado a subsidiar decisão de compra e venda. Abrange os mesmos pontos da vistoria de transferência e, adicionalmente, a análise estrutural ampla descrita a seguir.\n\n` +
                      `**M2.2. Pesquisa Veicular inclusa.** A contratação da Vistoria Cautelar inclui automaticamente a Pesquisa Veicular (Módulo 3), que a integra e a acompanha. A recíproca não se aplica: a Pesquisa Veicular pode ser contratada isoladamente.\n\n` +
                      `**M2.3. Objeto da análise.** A avaliação compreende: (a) identificação e autenticidade — chassi/monobloco, motor, câmbio, vidros, etiquetas, plaquetas e selos, confrontados com os padrões de fábrica; (b) análise estrutural por elemento — exame individualizado das peças da carroceria (capô, para-lamas, portas, colunas, teto, tampa traseira, longarinas, painéis dianteiro e traseiro, entre outras), registrando-se, para cada uma, a constatação aplicável (condição original; indícios de repintura; indícios de repintura com massa; amassados aparentes; arranhões aparentes; reparo); (c) condição geral de segurança associada à estrutura; e (d) indícios de eventos que afetem o valor de mercado (p. ex. sinistro, enchente), na medida do verificável pelo método.\n\n` +
                      `**M2.4. Método e limites.** A inspeção é visual, estética e sem desmontagem, restrita a itens acessíveis no momento do exame. Não constituem objeto deste serviço, por dependerem de procedimento diverso (desmontagem, perícia laboratorial, ensaio mecânico ou avaliação elétrica/eletrônica): defeitos não perceptíveis ao exame visual, vícios ocultos, e a aferição do funcionamento de sistemas mecânicos e eletrônicos. Os parâmetros técnicos de referência observam, no que aplicável, as normas ABNT pertinentes (p. ex. NBR 6066 e NBR 15180 para identificação; NBR 15048 para soldagem) e os conceitos de monta da Resolução CONTRAN nº 810/2020.\n\n` +
                      `**M2.5. Resultado.** O laudo reúne as informações de identificação e validação, a análise estrutural por elemento, e um resultado de conformidade (Conforme / Conforme com Apontamento / Não Conforme), além de campo de restrições e observações. O resultado expressa a opinião técnica da CONTRATADA sobre o estado e o histórico do veículo no momento da inspeção, e não substitui avaliação mecânica ou elétrica especializada.\n\n` +
                      `**M2.6. Reprovação.** Diante de resultado Não Conforme, o serviço se encerra com a entrega do laudo. Não há reapresentação gratuita (regra distinta da transferência): a Vistoria Cautelar é avaliação de constatação, e o apontamento desfavorável é resultado regular e válido do serviço, não ensejando nova execução sem custo nem devolução de valores.\n\n` +
                      `**M2.7. Reforço da cláusula temporal.** Reitera-se, neste serviço, a cláusula 2 da Parte I: o laudo cautelar atesta a condição do veículo da inspeção para trás, sendo recomendável a realização de novo laudo imediatamente antes da efetivação de qualquer negócio, dado que eventos posteriores podem alterar o estado do bem.\n\n` +
                      `**Módulo 3 — Pesquisa Veicular**\n\n` +
                      `**M3.1. Escopo.** Serviço de consulta e compilação de informações e histórico do veículo a partir de bases de dados oficiais e privadas disponíveis (p. ex. dados cadastrais, débitos, restrições, gravames, registros de leilão, sinistro, roubo/furto), entregues em formato de relatório.\n\n` +
                      `**M3.2. Responsabilidade e limites.** A CONTRATADA responde pela fidelidade da compilação em relação às fontes consultadas, não respondendo pela veracidade, completude ou atualização dos dados de origem, que são de responsabilidade das respectivas fontes. Pode haver divergência ou ausência de registros entre diferentes bases; recomenda-se a realização de novas consultas próximo à conclusão do negócio.\n\n` +
                      `**M3.3. Encerramento.** A entrega do relatório encerra o serviço. Por se tratar de resultado informativo, não há reapresentação nem reembolso em razão do conteúdo apurado.`;
    } else if (isPesquisa) {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` +
                      `**Módulo 3 — Pesquisa Veicular**\n\n` +
                      `**M3.1. Escopo.** Serviço de consulta e compilação de informações e histórico do veículo a partir de bases de dados oficiais e privadas disponíveis (p. ex. dados cadastrais, débitos, restrições, gravames, registros de leilão, sinistro, roubo/furto), entregues em formato de relatório.\n\n` +
                      `**M3.2. Responsabilidade e limites.** A CONTRATADA responde pela fidelidade da compilação em relação às fontes consultadas, não respondendo pela veracidade, completude ou atualização dos dados de origem, que são de responsabilidade das respectivas fontes. Pode haver divergência ou ausência de registros entre diferentes bases; recomenda-se a realização de novas consultas próximo à conclusão do negócio.\n\n` +
                      `**M3.3. Encerramento.** A entrega do relatório encerra o serviço. Por se tratar de resultado informativo, não há reapresentação nem reembolso em razão do conteúdo apurado.`;
    } else {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` +
                      `*Não aplicável para este tipo de serviço.*`;
    }

    // Common trunk (Parte I)
    let contractText = `## QUADRO-RESUMO DA CONTRATAÇÃO

| Campo | Conteúdo |
|---|---|
| Nº da Ordem de Serviço | {{os_numero}} |
| Data e hora de abertura | {{os_data_hora}} |
| Tipo de vistoria | {{os_tipo_vistoria}} |
| Finalidade declarada pelo cliente | {{os_finalidade}} |
| Valor do serviço | R$ {{os_valor}} |
| Forma de pagamento | {{os_forma_pagamento}} |

---

## 1. DAS PARTES

**CONTRATADA:** {{ecv_razao_social}}, pessoa jurídica de direito privado inscrita no CNPJ sob nº {{ecv_cnpj}}, com sede em {{ecv_endereco}}, **Empresa Credenciada de Vistoria (ECV)** habilitada junto ao {{ecv_detran_uf}} sob o credenciamento nº {{ecv_credenciamento_numero}}, doravante denominada **CONTRATADA**.

**CONTRATANTE:** {{cliente_nome}}, inscrito(a) no CPF/CNPJ sob nº {{cliente_documento}}, residente/sediado(a) em {{cliente_endereco}}, doravante denominado(a) **CONTRATANTE**.

**VEÍCULO OBJETO:** placa {{veiculo_placa}}, RENAVAM {{veiculo_renavam}}, chassi {{veiculo_chassi}}, marca/modelo {{veiculo_marca_modelo}}, ano fab./modelo {{veiculo_ano}}.

As partes celebram o presente contrato, que se rege pelo Código de Trânsito Brasileiro (Lei nº 9.503/1997), pela Resolução CONTRAN nº 941/2022 e alterações, pela {{ecv_portaria_estadual}}, pelo Código de Defesa do Consumidor (Lei nº 8.078/1990) e demais normas aplicáveis, mediante as cláusulas seguintes.

---

## 2. DO OBJETO E DO ESCOPO DO SERVIÇO

**2.1.** O objeto deste contrato é a realização de **vistoria de identificação veicular** e a emissão do respectivo **laudo eletrônico**, registrado no Sistema de Certificação de Segurança Veicular e Vistorias (SISCSV) mantido pelo órgão máximo executivo de trânsito da União.

**2.2.** Nos exatos termos do art. 2º, §2º, da Resolução CONTRAN nº 941/2022, a vistoria de identificação veicular limita-se a verificar:

a) a autenticidade da identificação do veículo e da sua documentação;
b) a legitimidade da propriedade;
c) se o veículo dispõe dos equipamentos obrigatórios e se estes estão funcionais;
d) se as características originais do veículo e de seus agregados foram modificadas e, em caso positivo, se a alteração foi autorizada, regularizada e consta do prontuário do veículo na repartição de trânsito.

**2.3.** O serviço é prestado **exclusivamente** dentro do escopo descrito na cláusula 2.2. O laudo emitido tem **natureza documental e de identificação**, destinando-se a instruir o procedimento de trânsito indicado no quadro-resumo, e **só tem validade quando registrado no SISCSV**.

---

## 3. DO QUE NÃO INTEGRA O OBJETO (DELIMITAÇÃO EXPRESSA DE ESCOPO)

**3.1.** O CONTRATANTE declara estar ciente, de forma livre e informada, de que a vistoria de identificação veicular **NÃO se confunde com vistoria cautelar, vistoria prévia (de seguradora), perícia ou avaliação mecânica**, e que, por consequência, **NÃO** estão compreendidos no objeto deste contrato, não constituindo obrigação nem responsabilidade da CONTRATADA:

a) a avaliação do estado mecânico, elétrico, eletrônico ou estrutural do veículo, nem a identificação de **vícios ocultos** ou de defeitos não aparentes a uma inspection visual de identificação;
b) a apuração do **histórico** do veículo — passagem por leilão, sinistro, recuperação, indenização integral, batidas ou reparos — quando tal informação **não constar** do prontuário oficial ou das bases de dados de trânsito acessíveis no ato;
c) a verificação de **procedência comercial**, autenticidade de negócio jurídico de compra e venda, ou idoneidade de terceiros (vendedor, comprador, intermediário);
d) a aferição de **quilometragem real**, valor de mercado, originalidade de peças não relacionadas à identificação, ou qualidade de reparos anteriores;
e) a existência de **débitos, multas, tributos (IPVA, seguro obrigatório), restrições financeiras, gravames ou bloqueios** sobre o veículo;
f) qualquer conferência que dependa de **perícia técnica especializada** (laboratorial, criminalística ou de engenharia), de competência de órgão diverso.

**3.2.** Caso o CONTRATANTE deseje verificação de procedência, histórico e condições gerais do veículo — em especial em situações de compra e venda —, a CONTRATADA esclarece que o serviço adequado é a **vistoria cautelar**, de natureza distinta e não obrigatória, que **poderá [OPCIONAL: ser / não ser]** ofertada por esta empresa mediante contratação específica e separada.

---

## 4. DAS OBRIGAÇÕES E RESPONSABILIDADES DA CONTRATADA

**4.1.** A CONTRATADA obriga-se a prestar serviço adequado, observando regularidade, continuidade, eficiência, segurança, atualidade e cortesia, na forma do art. 9º da Resolução CONTRAN nº 941/2022.

**4.2.** A CONTRATADA responde, civil e criminalmente, **pelos prejuízos causados em decorrência das informações e interpretações que ela própria inserir no laudo** de vistoria de identificação veicular (art. 9º, VIII, da Resolução CONTRAN nº 941/2022).

**4.3.** A responsabilidade da CONTRATADA **abrange e se limita** às falhas que lhe sejam imputáveis dentro do escopo da cláusula 2.2 — por exemplo, deixar de apontar adulteração de chassi, motor ou agregados que fosse perceptível à vistoria de identificação, ou registrar no laudo informação divergente da efetivamente constatada.

**4.4.** A CONTRATADA **NÃO responde**, por expressa previsão legal e por estarem fora de seu escopo de atuação:

a) por informações **oriundas dos bancos de dados BIN / RENAVAM / RENAMO** e demais bases oficiais de trânsito, das quais a CONTRATADA é mera consulente e não a fonte (art. 9º, VIII, parte final, da Resolução CONTRAN nº 941/2022);
b) por qualquer fato, defeito ou circunstância listados na cláusula 3.1, que não integram o objeto contratado;
c) por decisão do órgão de trânsito que recuse, exija complementação ou invalide o laudo no exercício de sua competência fiscalizatória, bem como por fato exclusivo de terceiro (notadamente do vendedor ou de proprietário anterior) ou do próprio CONTRATANTE;
d) por vícios ou adulterações executados com grau de sofisticação que os torne **imperceptíveis** a uma vistoria de identificação realizada segundo a boa técnica e o regulamento aplicável, demandando perícia especializada para sua constatação.

**4.5.** A CONTRATADA mantém, na forma do art. 5º, III, "d", da Resolução CONTRAN nº 941/2022, **Apólice de Seguro de Responsabilidade Civil Profissional no valor de R$ 500.000,00**, destinada à cobertura de danos eventualmente causados ao consumidor, sem prejuízo de que a responsabilidade da empresa não fica limitada ao teto da apólice.

---

## 5. DAS OBRIGAÇÕES E DECLARAÇÕES DO CONTRATANTE

**5.1.** O CONTRATANTE obriga-se a:

a) apresentar o veículo no local e horário ajustados, em condições de acesso e limpeza que permitam a vistoria (em especial dos pontos de identificação: chassi, motor e agregados);
b) apresentar a documentação obrigatória exigida pela legislação de trânsito (CRLV-e e demais documentos pertinentes à finalidade declarada);
c) prestar informações verdadeiras quanto à finalidade da vistoria e à titularidade/posse do veículo.

**5.2.** O CONTRATANTE **declara, sob sua responsabilidade**, que:

a) leu e compreendeu a delimitação de escopo das cláusulas 2 e 3, em especial que esta vistoria **não atesta** a ausência de vícios ocultos, a procedência comercial, o histórico não documentado, a inexistência de débitos ou a integridade mecânica do veículo;
b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.

---

## 6. DO PRAZO, EXECUÇÃO E ENTREGA DO LAUDO

**6.1.** A vistoria será realizada nas instalações da CONTRATADA, ressalvadas as hipóteses de **vistoria móvel** taxativamente previstas no art. 3º da Resolução CONTRAN nº 941/2022 (veículo sinistrado indenizado, recuperado por instituição financeira, comercializado por PJ do ramo, apreendido em pátio público, relacionado para leilão, ou de PBT superior a 10 toneladas).

**6.2.** O laudo será disponibilizado por meio eletrônico após o registro no SISCSV, no prazo de **24 (vinte e quatro) horas**, condicionada sua validade ao referido registro.

**6.3.** O processo de vistoria é integralmente registrado por videomonitoramento e biometria, sendo as imagens armazenadas pelo prazo legal de **5 (cinco) anos**, à disposição do órgão de trânsito e do CONTRATANTE para fins de auditoria.

---

## 7. DO PREÇO E PAGAMENTO

**7.1.** Pela prestação do serviço, o CONTRATANTE pagará o valor de R$ {{os_valor}}, na forma indicada no quadro-resumo, com emissão obrigatória de **Nota Fiscal de Serviço eletrônica (NFS-e)**, independentemente de solicitação.

**7.2.** O valor refere-se **exclusivamente** ao serviço de vistoria de identificação veicular e não inclui taxas do Detran, emolumentos, ou quaisquer outros serviços não descritos neste contrato.

---

## 8. DOS DIREITOS DO CONSUMIDOR

**8.1.** Esta contratação configura relação de consumo, regida pelo Código de Defesa do Consumidor. **Nenhuma cláusula deste contrato exclui, atenua ou transfere a responsabilidade da CONTRATADA por defeito na prestação do serviço dentro do escopo contratado** (art. 25 e art. 51, I, do CDC); a delimitação de escopo das cláusulas 2 e 3 destina-se a informar com clareza o que o serviço compreende, e não a afastar responsabilidade que a lei impõe.

**8.2.** São direitos do CONTRATANTE, sem prejuízo de outros previstos em lei:

a) receber informação clara, adequada e ostensiva sobre o serviço, seu escopo e seus limites;
b) obter cópia do laudo e acesso às imagens da sua vistoria;
c) ser atendido por **canal de ouvidoria / SAC** da CONTRATADA: {{ecv_canal_ouvidoria}};
d) registrar comentário ou reclamação perante o {{ecv_detran_uf}} e os órgãos de defesa do consumidor;
e) ser ressarcido, na forma da lei e até o limite da apólice referida na cláusula 4.5 (sem que isso constitua teto da responsabilidade legal), por danos comprovadamente decorrentes de falha da CONTRATADA no âmbito do escopo contratado.

---

## 9. DA PROTEÇÃO DE DADOS (LGPD)

**9.1.** A CONTRATADA tratará os dados pessoais do CONTRATANTE e do veículo exclusivamente para a execução do serviço e o cumprimento de obrigações legais e regulatórias perante o Sistema Nacional de Trânsito, na forma da Lei nº 13.709/2018 (LGPD).

**9.2.** É **vedado** à CONTRATADA repassar a terceiros, a qualquer título, as informações sobre o veículo e o proprietário objeto da vistoria (art. 13, VI, da Resolução CONTRAN nº 941/2022), ressalvado o fornecimento às autoridades competentes nos casos legalmente previstos.

---

## 10. DAS DISPOSIÇÕES FINAIS

**10.1.** Identificada **suspeita de fraude ou irregularidade insanável** na identificação do veículo, a CONTRATADA comunicará imediatamente a autoridade policial, na forma do art. 311 do Código Penal e do art. 9º, IX, da Resolução CONTRAN nº 941/2022, ato que **não** configura inadimplemento contratual da CONTRATADA.

**10.2.** A eventual nulidade de qualquer cláusula não prejudica as demais.

**10.3.** Fica eleito o foro do domicílio do CONTRATANTE para dirimir controvérsias oriundas deste contrato, conforme art. 101, I, do CDC.

E, por estarem de acordo, as partes firmam o presente instrumento [OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}].

{{ecv_cidade_uf}}, {{os_data}}.

| CONTRATADA | CONTRATANTE |
|---|---|
| {{ecv_razao_social}} | {{cliente_nome}} |
| CNPJ {{ecv_cnpj}} | CPF/CNPJ {{cliente_documento}} |

---

${modulesText}

---

## ACEITE E ASSINATURAS

Declaro que li e compreendi as Condições Gerais (Parte I), em especial a cláusula 2 (natureza temporal do laudo), e o(s) módulo(s) do(s) serviço(s) que contratei.

[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).
[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).
`;

    // Perform Conditional Replacements
        let filled = contractText;
    
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
                                `eletronicamente, com aceite registrado no sistema sob hash **${os.contratoHash}** em **${formatDateTimeBr(os.contratoAceitoEm)}**`);
    } else {
        filled = filled.replace('[OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}]', 
                                'eletronicamente (Assinatura Eletrônica pendente)');
    }
    
    if (isTransferencia && os.osFinalidade === 'Compra/Venda') {
        filled = filled.replace('**poderá [OPCIONAL: ser / não ser]**', '**poderá ser**');
    } else {
        filled = filled.replace('**poderá [OPCIONAL: ser / não ser]**', '**poderá não ser**');
    }
    
    if (isTransferencia && os.osFinalidade === 'Compra/Venda') {
        filled = filled.replace('b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.', 
                                'b) Fui orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.');
    } else {
        filled = filled.replace('b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.', '');
    }
    
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
    
    if (os.contratoHash) {
        filled = filled.replace('[OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}]', 
                                `eletronicamente, com aceite registrado no sistema sob hash **${os.contratoHash}** em **${formatDateTimeBr(os.contratoAceitoEm)}**`);
    } else {
        filled = filled.replace('[OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}]', 
                                'eletronicamente (Assinatura Eletrônica pendente)');
    }
    
    const valorBr = typeof os.valor === 'number' ? os.valor.toFixed(2).replace('.', ',') : '0,00';
    const formatedDate = os.criadoEm ? formatDateBr(os.criadoEm) : formatDateBr(new Date().toISOString());
    const formatedDateTime = os.criadoEm ? formatDateTimeBr(os.criadoEm) : formatDateTimeBr(new Date().toISOString());
    
    const replacements = {
        '{{os_numero}}': os.numero || 'OS-XXXX',
        '{{os_data_hora}}': formatedDateTime,
        '{{os_tipo_vistoria}}': os.servicoNome || '',
        '{{os_finalidade}}': os.osFinalidade || 'Não declarada',
        '{{os_valor}}': valorBr,
        '{{os_forma_pagamento}}': (os.formaPagamento || '').toUpperCase(),
        '{{ecv_razao_social}}': unit.razao_social || 'CERTIVE VISTORIAS',
        '{{empresa_razao_social}}': unit.razao_social || 'CERTIVE VISTORIAS',
        '{{ecv_cnpj}}': unit.cnpj || '',
        '{{empresa_cnpj}}': unit.cnpj || '',
        '{{ecv_endereco}}': unit.endereco || '',
        '{{empresa_endereco}}': unit.endereco || '',
        '{{unidade_nome}}': unit.nome || '',
        '{{unidade_endereco}}': unit.endereco || '',
        '{{ecv_detran_uf}}': `DETRAN-${unit.uf || 'SC'}`,
        '{{ecv_credenciamento_numero}}': unit.credenciamento || '',
        '{{empresa_credenciamento}}': unit.credenciamento || '',
        '{{ecv_portaria_estadual}}': portaria,
        '{{portaria_estadual}}': portaria,
        '{{ecv_canal_ouvidoria}}': unit.canal_ouvidoria || 'ouvidoria@certive.com.br',
        '{{ecv_cidade_uf}}': `${unit.cidade || ''}/${unit.uf || ''}`,
        '{{cliente_nome}}': os.clienteNome || '',
        '{{cliente_cpf}}': os.clienteCpfCnpj || '',
        '{{cliente_documento}}': os.clienteCpfCnpj || '',
        '{{cliente_celular}}': os.clienteCelular || '',
        '{{cliente_tipo}}': os.clienteTipo || 'particular',
        '{{cliente_endereco}}': os.clienteEndereco || 'NÃO CADASTRADO',
        '{{veiculo_placa}}': os.placa || '',
        '{{veiculo_renavam}}': os.renavam || '',
        '{{veiculo_chassi}}': os.veiculoChassi || '',
        '{{veiculo_marca_modelo}}': os.veiculoMarcaModelo || '',
        '{{veiculo_ano}}': os.veiculoAno || '',
        '{{aceite_hash}}': os.contratoHash || '',
        '{{aceite_data_hora}}': os.contratoAceitoEm ? formatDateTimeBr(os.contratoAceitoEm) : '',
        '{{os_data}}': formatedDate
    };
    
    for (const [placeholder, value] of Object.entries(replacements)) {
        filled = filled.split(placeholder).join(value);
    }
    
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    filled = filled.replace(placeholderRegex, (match, p1) => {
        return `[PENDENTE: ${p1.toUpperCase()}]`;
    });
    
    return filled;
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        return marked.parse(text);
    }
    
    // Fallback simple markdown parser to support offline use without throwing errors
    let html = text || "";
    
    // Escape HTML special characters first (safeguard)
    html = html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Simple table parser
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = "";
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableHtml = '<table class="table" style="width: 100%; border-collapse: collapse; margin: 16px 0;"><thead>';
            }
            
            if (line.includes('---|') || line.includes('--|')) {
                tableHtml = tableHtml.replace(/<\/tr>$/, '</thead><tbody>');
                continue;
            }
            
            const cols = line.split('|').slice(1, -1);
            const tag = inTable && !tableHtml.includes('<tbody>') ? 'th' : 'td';
            
            tableHtml += '<tr>' + cols.map(c => `<${tag} style="border: 1px solid var(--border, #ccc); padding: 8px;">${c.trim()}</${tag}>`).join('') + '</tr>';
        } else {
            if (inTable) {
                inTable = false;
                tableHtml += '</tbody></table>';
                lines[i] = tableHtml + '\n' + line;
            }
        }
    }
    if (inTable) {
        tableHtml += '</tbody></table>';
        lines[lines.length - 1] = tableHtml;
    }
    
    html = lines.join('\n');
    
    // Line breaks and paragraphs
    html = html.split(/\n\n+/).map(p => {
        p = p.trim();
        if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<hr')) {
            return p;
        }
        return `<p style="margin-bottom: 12px; line-height: 1.5;">${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    
    // Horizontal rule
    html = html.replace(/^---$/gim, '<hr style="border: 0; border-top: 1px solid var(--border, #ccc); margin: 24px 0;">');
    
    return html;
}

function printContract(os) {
    const printArea = document.getElementById('print-area');
    if (!printArea) {
        const div = document.createElement('div');
        div.id = 'print-area';
        document.body.appendChild(div);
    }
    
    const area = document.getElementById('print-area');
    const contractHtml = renderMarkdown(os.contratoTexto || generateContractText(os));

    const headerHtml = `
<div style="text-align: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #d4af37;">
    <h1 style="font-family: 'Georgia', serif; font-size: 32px; font-weight: 800; color: #1e3a5f; letter-spacing: 4px; margin: 0 0 4px 0;">CERTIVE</h1>
    <p style="font-family: 'Arial', sans-serif; font-size: 11px; font-weight: bold; color: #888; letter-spacing: 2px; margin: 0;">VISTORIA & IDENTIFICAÇÃO VEICULAR</p>
</div>
<div style="text-align: center; margin-bottom: 24px;">
    <h2 style="font-family: 'Georgia', serif; font-size: 18px; font-weight: 700; color: #1e3a5f; margin: 0 0 8px 0; line-height: 1.3;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS<br>DE VISTORIA DE IDENTIFICAÇÃO VEICULAR</h2>
    <p style="font-style: italic; font-size: 11px; color: #666; margin: 0;">Modelo padrão — campos entre chaves duplas {{ }} preenchidos automaticamente pelo sistema</p>
</div>`;
    
    area.innerHTML = `
        <div class="print-contract-container">
            ${headerHtml}
            ${contractHtml}
        </div>
    `;
    
    window.print();
}

function printContractById(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (os) printContract(os);
}

// Modal signature controllers
function closeContratoModal() {
    const modalEl = document.getElementById('modal-contrato-assinatura');
    if (modalEl) {
        modalEl.style.display = 'none';
        modalEl.classList.remove('active');
    }
    window.pendingOS = null;
}

function toggleContratoConfirmBtn() {
    const isChecked = document.getElementById('contrato-aceite-check').checked;
    document.getElementById('btn-confirmar-contrato').disabled = !isChecked;
}

function printContratoPreview() {
    if (!window.pendingOS) return;
    const printArea = document.getElementById('print-area');
    if (!printArea) {
        const div = document.createElement('div');
        div.id = 'print-area';
        document.body.appendChild(div);
    }
    const contractHtml = renderMarkdown(window.pendingOS.contratoTexto);

    const headerHtml = `
<div style="text-align: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #d4af37;">
    <h1 style="font-family: 'Georgia', serif; font-size: 32px; font-weight: 800; color: #1e3a5f; letter-spacing: 4px; margin: 0 0 4px 0;">CERTIVE</h1>
    <p style="font-family: 'Arial', sans-serif; font-size: 11px; font-weight: bold; color: #888; letter-spacing: 2px; margin: 0;">VISTORIA & IDENTIFICAÇÃO VEICULAR</p>
</div>
<div style="text-align: center; margin-bottom: 24px;">
    <h2 style="font-family: 'Georgia', serif; font-size: 18px; font-weight: 700; color: #1e3a5f; margin: 0 0 8px 0; line-height: 1.3;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS<br>DE VISTORIA DE IDENTIFICAÇÃO VEICULAR</h2>
    <p style="font-style: italic; font-size: 11px; color: #666; margin: 0;">Modelo padrão — campos entre chaves duplas {{ }} preenchidos automaticamente pelo sistema</p>
</div>`;
    document.getElementById('print-area').innerHTML = `
        <div class="print-contract-container">
            ${headerHtml}
            ${contractHtml}
        </div>
    `;
    window.print();
}

async function confirmContratoAndSaveOS() {
    try {
        if (!window.pendingOS) return;
        
        const activeCaixa = getTodayOpenCaixa();
        if (!activeCaixa) {
            showToast("Erro: O caixa foi fechado durante a operação.", "error");
            return;
        }
        
        const os = window.pendingOS;
        
        let insertedOS = null;
        let retryCount = 0;
        let signatureHash = '';
        
        // Retry loop to handle concurrent OS number conflicts (uq_os_numero)
        while (retryCount < 3) {
            try {
                // Fetch the next reliable OS number from Supabase
                const num = await getNextOSNumber();
                os.numero = num;
                
                // Regenerate contract text so it embeds the correct numero
                os.contratoTexto = generateContractText(os);
                
                // Generate signature hash
                signatureHash = generateSignatureHash(os.contratoTexto);
                os.contratoHash = signatureHash;
                os.contratoAceitoEm = new Date().toISOString();
                
                // Regenerate one last time to embed the signature hash
                os.contratoTexto = generateContractText(os);
                
                // Insert OS into Supabase
                insertedOS = await sbInsert('ordens_servico', os);
                break; // Success!
            } catch (err) {
                if (err.message && (err.message.includes('uq_os_numero') || err.message.includes('duplicate key'))) {
                    retryCount++;
                    console.log(`Conflito de número de OS detectado. Tentando novamente (${retryCount}/3)...`);
                    if (retryCount >= 3) throw new Error("Não foi possível gerar um número único para a OS. Tente novamente.");
                } else {
                    throw err; // Outros erros (ex: schema faltando, offline)
                }
            }
        }
        
        // Add to local cache
        cacheUnshift('ordens_servico', insertedOS);
        
        // Standard OS Save
        if (insertedOS.pago) {
            insertedOS.status = "paga";
            
            const movRecord = {
                caixaId: activeCaixa.id,
                tipo: "entrada",
                valor: insertedOS.valor,
                descricao: `Serviço ${insertedOS.servicoNome.split(' — ')[0]} (Placa: ${insertedOS.placa})`,
                formaPagamento: insertedOS.formaPagamento,
                data: new Date().toISOString(),
                operador: currentSession.nome,
                osId: insertedOS.id,
                faturaId: null
            };
            const insertedMov = await sbInsert('caixa_movimentos', movRecord);
            cacheInsert('caixa_movimentos', insertedMov);
        }
        
        showToast(`O.S. registrada e contrato assinado! Código: ${insertedOS.numero}`, "success");
        logAudit("Abertura OS", `Abriu a ordem ${insertedOS.numero} com contrato firmado (Hash: ${signatureHash}).`);
        
        closeContratoModal();
        printContract(insertedOS);
        
        clearOSForm();
        renderAtendimentoPage();
    } catch (e) {
        console.error("Erro ao confirmar contrato e salvar O.S.:", e);
        showToast("Ocorreu um erro ao confirmar o contrato e salvar a O.S.", "error");
    }
}

// Signed contract viewer modals
function openContratoFirmadoModal(osId) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;
    
    window.viewingSignedOS = os;
    
    document.getElementById('contrato-firmado-hash-display').textContent = `Hash: ${os.contratoHash || 'NÃO ASSINADO'}`;
    document.getElementById('contrato-firmado-data-display').textContent = `Aceito em: ${os.contratoAceitoEm ? formatDateTimeBr(os.contratoAceitoEm) : '—'}`;
    
    const contentContainer = document.getElementById('contrato-firmado-content');
    const contractText = os.contratoTexto || generateContractText(os);

    const headerHtml = `
<div style="text-align: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #d4af37;">
    <h1 style="font-family: 'Georgia', serif; font-size: 32px; font-weight: 800; color: #1e3a5f; letter-spacing: 4px; margin: 0 0 4px 0;">CERTIVE</h1>
    <p style="font-family: 'Arial', sans-serif; font-size: 11px; font-weight: bold; color: #888; letter-spacing: 2px; margin: 0;">VISTORIA & IDENTIFICAÇÃO VEICULAR</p>
</div>
<div style="text-align: center; margin-bottom: 24px;">
    <h2 style="font-family: 'Georgia', serif; font-size: 18px; font-weight: 700; color: #1e3a5f; margin: 0 0 8px 0; line-height: 1.3;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS<br>DE VISTORIA DE IDENTIFICAÇÃO VEICULAR</h2>
    <p style="font-style: italic; font-size: 11px; color: #666; margin: 0;">Modelo padrão — campos entre chaves duplas {{ }} preenchidos automaticamente pelo sistema</p>
</div>`;
    contentContainer.innerHTML = headerHtml + renderMarkdown(contractText);
    
    const modalEl = document.getElementById('modal-contrato-firmado');
    if (modalEl) {
        modalEl.style.display = 'flex';
        modalEl.classList.add('active');
    }
}

function closeContratoFirmadoModal() {
    const modalEl = document.getElementById('modal-contrato-firmado');
    if (modalEl) {
        modalEl.style.display = 'none';
        modalEl.classList.remove('active');
    }
    window.viewingSignedOS = null;
}

function printContratoFirmado() {
    if (!window.viewingSignedOS) return;
    printContract(window.viewingSignedOS);
}
