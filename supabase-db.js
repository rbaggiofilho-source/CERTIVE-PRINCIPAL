// ==========================================
// CERTIVE VISTORIAS — Data Access Layer (DAL)
// Camada de acesso a dados via Supabase
// ==========================================

// ---- DECIMAL FIELD MAP ----
// Supabase returns DECIMAL columns as strings. This map defines
// which fields need parseFloat conversion per table.
const DECIMAL_FIELDS = {
    servicos: ['precoBalcao'],
    taxas_referencia: ['taxa'],
    ordens_servico: ['valor'],
    caixa_diario: ['saldoAbertura', 'saldoEspécieInformado'],
    caixa_movimentos: ['valor'],
    contas_pagar: ['valor'],
    faturas: ['valorTotal'],
    parceiros: ['precoCombo', 'precoComboTransferencia'],
    parceiros_creditos: ['valor'],
    pendencias_fechamento: ['valorTaxa'],
    baixas_faturas_pendentes: ['valor']
};

/**
 * Convert DECIMAL string fields to numbers for a record from a given table.
 * Supabase returns DECIMAL as "120.00" (string) — this normalizes to 120.00 (number).
 */
function normalizeRecord(table, record) {
    if (!record) return record;
    const fields = DECIMAL_FIELDS[table];
    if (fields) {
        for (const field of fields) {
            if (record[field] !== undefined) {
                record[field] = parseFloat(record[field]) || 0;
            }
        }
    }
    // Special: parceiros.tabelaPrecos JSONB values
    if (table === 'parceiros' && record.tabelaPrecos && typeof record.tabelaPrecos === 'object' && record.tabelaPrecos !== null) {
        for (const key in record.tabelaPrecos) {
            record.tabelaPrecos[key] = parseFloat(record.tabelaPrecos[key]) || 0;
        }
    }
    // Special: taxas_referencia backward compatibility for .tax vs .taxa
    if (table === 'taxas_referencia' && record) {
        record.tax = record.taxa;
    }
    return record;
}

// ---- GENERIC CRUD OPERATIONS ----

/**
 * Map JS properties to database columns before inserting/updating.
 */
function prepareRecordForDb(table, record) {
    if (!record) return record;
    const clean = { ...record };
    if (table === 'caixa_diario') {
        if (clean.pdfConsolidado !== undefined) {
            clean.relatorioDetran = clean.pdfConsolidado;
            delete clean.pdfConsolidado;
        }
    }
    if (table === 'contas_pagar' && clean.competencia) {
        clean.competencia = normalizarCompetencia(clean.competencia, clean.vencimento);
    }
    return clean;
}

/**
 * Normaliza a competência antes de gravar. O <input type="month"> deixa digitar
 * o ano com poucos dígitos (ex.: "26" vira 0026), e a competência "0026-09-01"
 * era barrada pelo check constraint contas_pagar_competencia_plausivel (ano
 * 2000-2100), travando o salvamento online e forçando o modo local. Aqui o ano
 * de 2 dígitos vira 20xx e, se ainda ficar implausível, cai para o mês do
 * vencimento. Vale para cadastro, edição e re-sincronização de pendências.
 */
function normalizarCompetencia(competencia, vencimento) {
    const s = String(competencia).trim();
    const m = s.match(/^(\d{1,6})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!m) return competencia;
    let ano = parseInt(m[1], 10);
    const mes = m[2].padStart(2, '0');
    const dia = (m[3] || '01').padStart(2, '0');
    if (ano < 100) ano += 2000;                 // "26" -> 2026
    const v = String(vencimento || '').match(/^(\d{4})-(\d{2})/);
    const anoVenc = v ? parseInt(v[1], 10) : null;
    // Implausível (fora de 2000-2100) ou muito longe do vencimento (mais de 1
    // ano) => usa o mês do vencimento. Cobre tanto "26"->0026 quanto o ano de
    // 1 dígito (ex.: "0002") que o +2000 não resolveria sozinho.
    const irreal = ano < 2000 || ano > 2100 || (anoVenc !== null && Math.abs(ano - anoVenc) > 1);
    if (irreal) return v ? `${v[1]}-${v[2]}-01` : null;
    return `${ano}-${mes}-${dia}`;
}

/**
 * Map database columns to JS properties and normalize numbers after fetching.
 */
function prepareRecordFromDb(table, record) {
    if (!record) return record;
    if (table === 'caixa_diario') {
        if (record.relatorioDetran !== undefined) {
            record.pdfConsolidado = record.relatorioDetran;
        }
    }
    return normalizeRecord(table, record);
}

/**
 * Insert a record into a Supabase table.
 * Returns the inserted record with the auto-generated ID (normalized).
 */
async function sbInsert(table, record) {
    if (window.onlineTables && !window.onlineTables[table]) {
        console.log(`ℹ️ sbInsert(${table}): offline/tabela local. Operação local simulada.`);
        return record;
    }
    const dbRecord = prepareRecordForDb(table, record);
    const { data, error } = await supabaseClient
        .from(table)
        .insert(dbRecord)
        .select()
        .single();
    
    if (error) {
        console.error(`❌ sbInsert(${table}):`, error.message);
        showToast(`Erro ao salvar no banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbInsert(${table}): ID ${data.id}`);
    return prepareRecordFromDb(table, data);
}

/**
 * Insert multiple records into a Supabase table.
 * Returns the inserted records with auto-generated IDs (normalized).
 */
async function sbInsertMany(table, records) {
    if (window.onlineTables && !window.onlineTables[table]) {
        console.log(`ℹ️ sbInsertMany(${table}): offline/tabela local.`);
        return records || [];
    }
    const dbRecords = (records || []).map(r => prepareRecordForDb(table, r));
    const { data, error } = await supabaseClient
        .from(table)
        .insert(dbRecords)
        .select();
    
    if (error) {
        console.error(`❌ sbInsertMany(${table}):`, error.message);
        showToast(`Erro ao salvar no banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbInsertMany(${table}): ${data.length} registros`);
    return (data || []).map(r => prepareRecordFromDb(table, r));
}

/**
 * Update a record by ID.
 * Returns the updated record (normalized).
 */
async function sbUpdate(table, id, updates) {
    if (window.onlineTables && !window.onlineTables[table]) {
        console.log(`ℹ️ sbUpdate(${table}, ${id}): offline/tabela local.`);
        return updates;
    }
    const dbUpdates = prepareRecordForDb(table, updates);
    const { data, error } = await supabaseClient
        .from(table)
        .update(dbUpdates)
        .eq('id', id)
        .select();
    
    if (error) {
        console.error(`❌ sbUpdate(${table}, ${id}):`, error.message);
        showToast(`Erro ao atualizar no banco: ${error.message}`, 'error');
        throw error;
    }
    // data is an array; return first element (or null if 0 rows matched)
    const result = data && data.length > 0 ? data[0] : null;
    if (!result) {
        // Nada foi gravado: o registro não existe mais (ou não é visível).
        console.error(`❌ sbUpdate(${table}, ${id}): nenhuma linha encontrada com esse ID.`);
        const erro = new Error(`Registro ${table} #${id} não encontrado no banco; a alteração não foi gravada.`);
        erro.code = 'PGRST116';
        showToast(erro.message, 'error');
        throw erro;
    } else {
        console.log(`✅ sbUpdate(${table}): ID ${id}`);
    }
    return prepareRecordFromDb(table, result);
}

/**
 * Delete a record by ID.
 */
async function sbDelete(table, id) {
    if (window.onlineTables && !window.onlineTables[table]) {
        console.log(`ℹ️ sbDelete(${table}, ${id}): offline/tabela local.`);
        return;
    }
    const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq('id', id);
    
    if (error) {
        console.error(`❌ sbDelete(${table}, ${id}):`, error.message);
        showToast(`Erro ao excluir do banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbDelete(${table}): ID ${id}`);
}

/**
 * Delete all records from a table where a specific field matches a value.
 * Used e.g. to delete caixa_movimentos by osId.
 */
async function sbDeleteWhere(table, field, value) {
    const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq(field, value);
    
    if (error) {
        console.error(`❌ sbDeleteWhere(${table}, ${field}=${value}):`, error.message);
        throw error;
    }
    console.log(`✅ sbDeleteWhere(${table}): ${field}=${value}`);
}

/**
 * Select all records from a table, with optional ordering.
 */
// ---- CAMPOS PESADOS ----
// Anexos, comprovantes e contratos são gravados como base64 dentro da linha.
// Trazê-los no carregamento inicial significa baixar ~28 MB a cada login:
//
//   contas_pagar.anexo         9,9 MB   (42 linhas)
//   contas_pagar.comprovante   9,8 MB   (23 linhas)
//   ordens_servico.contratoTexto 6,3 MB (473 linhas)
//   caixa_diario.relatorioDetran 1,8 MB (56 linhas)
//
// No celular isso estourava o tempo limite do PostgREST ("Thread killed by
// timeout manager" nos logs) e o app mostrava "Erro ao conectar com o banco
// de dados". Estes campos passam a ser buscados só quando alguém abre o
// anexo — ver carregarCampoPesado.
const CAMPOS_PESADOS = {
    contas_pagar:   ['anexo', 'comprovante'],
    ordens_servico: ['contratoTexto'],
    caixa_diario:   ['relatorioDetran']
};

const COLUNAS_LEVES = {
    contas_pagar: 'id,unidadeId,descricao,tipo,vencimento,valor,observacoes,pago,pagoEm,recorrente,frequencia,recorrenciaGrupoId,codigoBarras,categoria,fornecedor,criadoPor,competencia,"temAnexo","temComprovante"',
    ordens_servico: 'id,numero,criadoEm,criadoPor,unidadeId,clienteTipo,parceiroId,clienteNome,clienteCpfCnpj,clienteCelular,clienteEndereco,placa,renavam,servicoId,servicoNome,valor,observacoes,pago,formaPagamento,detranRegistrado,docVeiculoApresentado,docIdentificacaoApresentado,status,finalizadoEm,finalizadoPor,canceladoEm,canceladoPor,reapresentacaoOrigemID,respostaDetranNet,respostaShopping,reapresentadaData,faturaId,osFinalidade,veiculoChassi,veiculoMarcaModelo,veiculoAno,veiculoTipo,contratoHash,contratoAceitoEm,parcelas,statusNfse,numeroNfse,dataNfse,"temContrato","pagamentoDividido"',
    caixa_diario: 'id,unidadeId,data,status,abertoPor,fechadoPor,fechadoEm,saldoAbertura,"saldoEspécieInformado","temRelatorioDetran"'
};

// Busca sob demanda um campo pesado de um registro. Usado ao abrir o anexo.
async function carregarCampoPesado(table, id, campo) {
    if (!window.useSupabase) return null;
    const alvo = (db[table] || []).find(r => r.id === id);
    if (alvo && alvo[campo] !== undefined && alvo[campo] !== null) return alvo[campo];

    const { data, error } = await supabaseClient
        .from(table).select(campo).eq('id', id).single();
    if (error) {
        console.error(`❌ carregarCampoPesado(${table}.${campo}#${id}):`, error.message);
        throw error;
    }
    const valor = data ? data[campo] : null;
    if (alvo) alvo[campo] = valor;   // guarda no cache para não rebaixar
    return valor;
}
window.carregarCampoPesado = carregarCampoPesado;

// Repete a consulta em falha de rede. Uma requisição que morre por oscilação
// no celular derrubava o carregamento inteiro, porque o Promise.all rejeita
// tudo se um item falhar.
async function comRetentativa(fn, descricao, tentativas = 3) {
    let ultimoErro;
    for (let i = 1; i <= tentativas; i++) {
        try {
            return await fn();
        } catch (err) {
            ultimoErro = err;
            if (i < tentativas) {
                const espera = 400 * Math.pow(2, i - 1);   // 400ms, 800ms
                console.warn(`⚠️ ${descricao} falhou (tentativa ${i}/${tentativas}). Repetindo em ${espera}ms.`);
                await new Promise(r => setTimeout(r, espera));
            }
        }
    }
    throw ultimoErro;
}

// O PostgREST do Supabase devolve no máximo 1000 linhas por consulta e corta o
// resto em silêncio; por isso a leitura é feita em páginas.
const SB_PAGINA = 1000;

async function sbSelectAll(table, orderBy = 'id', ascending = true, limite = Infinity, filtro = null) {
    const colunas = COLUNAS_LEVES[table] || '*';
    return comRetentativa(async () => {
        const todos = [];
        for (let de = 0; de < limite; de += SB_PAGINA) {
            let q = supabaseClient
                .from(table)
                .select(colunas)
                .order(orderBy, { ascending });
            if (filtro) q = filtro(q);
            // Desempate estável para a paginação não pular nem repetir linhas
            if (orderBy !== 'id' && table !== 'portarias_uf') q = q.order('id', { ascending: true });
            const { data, error } = await q.range(de, Math.min(de + SB_PAGINA, limite) - 1);

            if (error) {
                console.error(`❌ sbSelectAll(${table}):`, error.message);
                throw error;
            }
            const pagina = data || [];
            pagina.forEach(r => todos.push(r));
            if (pagina.length < SB_PAGINA) break;
        }
        return todos.map(r => prepareRecordFromDb(table, r));
    }, `sbSelectAll(${table})`);
}

/**
 * Busca as linhas cuja coluna está numa lista de valores, em lotes (a URL do
 * filtro "in" tem limite de tamanho) e paginando cada lote.
 */
async function sbSelectIn(table, coluna, valores) {
    const lista = Array.from(new Set((valores || []).filter(v => v !== null && v !== undefined)));
    const todos = [];
    for (let i = 0; i < lista.length; i += 200) {
        const lote = lista.slice(i, i + 200);
        for (let de = 0; ; de += SB_PAGINA) {
            const { data, error } = await supabaseClient
                .from(table)
                .select('*')
                .in(coluna, lote)
                .order('id', { ascending: true })
                .range(de, de + SB_PAGINA - 1);
            if (error) {
                console.error(`❌ sbSelectIn(${table}):`, error.message);
                throw error;
            }
            const pagina = data || [];
            pagina.forEach(r => todos.push(r));
            if (pagina.length < SB_PAGINA) break;
        }
    }
    return todos.map(r => prepareRecordFromDb(table, r));
}

// Cautelares cujo laudo já foi emitido: seções e fotos delas não são carregadas
// na abertura do app (crescem sem parar), só sob demanda.
const CAUTELAR_STATUS_ENCERRADOS = ['concluida', 'finalizada', 'finalizado', 'concluido'];

function cautelarEncerrada(c) {
    return !!c && CAUTELAR_STATUS_ENCERRADOS.includes(c.status);
}

/**
 * Garante em memória as seções e fotos de uma cautelar (as encerradas não vêm
 * na carga inicial). Usar antes de abrir captura, finalização, laudo ou PDF.
 */
async function garantirDetalhesCautelar(cautelarId) {
    if (!db || !window.useSupabase || !supabaseClient) return;
    if (window.onlineTables && !window.onlineTables['cautelares_secoes']) return;
    db.cautelares_secoes = db.cautelares_secoes || [];
    db.cautelares_fotos = db.cautelares_fotos || [];
    try {
        let secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelarId);
        if (secoes.length === 0) {
            const remotas = await sbSelectIn('cautelares_secoes', 'cautelarId', [cautelarId]);
            remotas.forEach(s => db.cautelares_secoes.push(s));
            secoes = remotas;
        }
        const secaoIds = secoes.map(s => s.id);
        if (secaoIds.length === 0) return;
        if (db.cautelares_fotos.some(f => secaoIds.includes(f.secaoId))) return;
        const fotos = await sbSelectIn('cautelares_fotos', 'secaoId', secaoIds);
        fotos.forEach(f => {
            if (!f.metadados_json && f.metadados) f.metadados_json = f.metadados;
            db.cautelares_fotos.push(f);
        });
    } catch (e) {
        console.warn(`Não foi possível carregar os detalhes da cautelar ${cautelarId}:`, e);
    }
}

/**
 * Select records matching filters.
 */
async function sbSelectWhere(table, filters) {
    const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .match(filters);
    
    if (error) {
        console.error(`❌ sbSelectWhere(${table}):`, error.message);
        throw error;
    }
    return (data || []).map(r => prepareRecordFromDb(table, r));
}

// ---- DATABASE LOADER ----

// ---- JANELA DE CARGA ----
// A carga inicial traz os últimos JANELA_MESES meses de OS, caixa e faturas,
// mais tudo o que ainda está em aberto (OS não concluídas ou sem fatura, faturas
// não pagas, caixas abertos). Sem isso a carga crescia sem limite a cada mês.
// O histórico completo é buscado sob demanda (carregarHistoricoCompleto).
const JANELA_MESES = 13;
window.historicoCompleto = false;

function inicioJanelaCarga() {
    const d = new Date();
    d.setMonth(d.getMonth() - JANELA_MESES);
    return d.toISOString().slice(0, 10);
}
window.inicioJanelaCarga = inicioJanelaCarga;

function juntarPorId(...listas) {
    const mapa = new Map();
    listas.forEach(l => (l || []).forEach(r => mapa.set(r.id, r)));
    return [...mapa.values()].sort((a, b) => a.id - b.id);
}

async function carregarTabelasComJanela(completo) {
    const corte = inicioJanelaCarga();
    if (completo) {
        return Promise.all([
            sbSelectAll('ordens_servico', 'id', true),
            sbSelectAll('caixa_diario', 'id', true),
            sbSelectAll('caixa_movimentos', 'id', true),
            sbSelectAll('faturas', 'id', true)
        ]);
    }
    const [osRecentes, osAbertas, osSemFatura, cxRecentes, cxAbertos, movRecentes, fatRecentes, fatAbertas] = await Promise.all([
        sbSelectAll('ordens_servico', 'id', true, Infinity, q => q.gte('criadoEm', corte)),
        sbSelectAll('ordens_servico', 'id', true, Infinity, q => q.lt('criadoEm', corte).in('status', ['aberta', 'em_execucao', 'paga'])),
        sbSelectAll('ordens_servico', 'id', true, Infinity, q => q.lt('criadoEm', corte).eq('formaPagamento', 'faturamento').is('faturaId', null)),
        sbSelectAll('caixa_diario', 'id', true, Infinity, q => q.gte('data', corte)),
        sbSelectAll('caixa_diario', 'id', true, Infinity, q => q.lt('data', corte).eq('status', 'aberto')),
        sbSelectAll('caixa_movimentos', 'id', true, Infinity, q => q.gte('data', corte)),
        sbSelectAll('faturas', 'id', true, Infinity, q => q.gte('criadoEm', corte)),
        sbSelectAll('faturas', 'id', true, Infinity, q => q.lt('criadoEm', corte).eq('pago', false))
    ]);
    return [juntarPorId(osRecentes, osAbertas, osSemFatura), juntarPorId(cxRecentes, cxAbertos), movRecentes, juntarPorId(fatRecentes, fatAbertas)];
}

// Traz o histórico anterior à janela (BI, histórico e relatórios de períodos antigos)
async function carregarHistoricoCompleto() {
    if (window.historicoCompleto) return false;
    const [os, cx, mov, fat] = await carregarTabelasComJanela(true);
    db.ordens_servico = juntarPorId(db.ordens_servico, os.map(r => normalizeRecord('ordens_servico', r)));
    db.caixa_diario = juntarPorId(db.caixa_diario, cx.map(r => normalizeRecord('caixa_diario', r)));
    db.caixa_movimentos = juntarPorId(db.caixa_movimentos, mov.map(r => normalizeRecord('caixa_movimentos', r)));
    db.faturas = juntarPorId(db.faturas, fat.map(r => normalizeRecord('faturas', r)));
    window.historicoCompleto = true;
    return true;
}
window.carregarHistoricoCompleto = carregarHistoricoCompleto;

/**
 * Load ALL tables from Supabase into the global `db` object.
 * This replaces the old loadDatabase() that read from localStorage.
 */
async function loadAllFromSupabase() {
    try {
        console.log('⏳ Carregando dados do Supabase...');
        
        window.onlineTables = {
            unidades: true,
            servicos: true,
            taxas_referencia: true,
            operadores: true,
            parceiros: true,
            ordens_servico: true,
            caixa_diario: true,
            caixa_movimentos: true,
            contas_pagar: true,
            faturas: true,
            auditoria: true,
            solicitantes_parceiros: true,
            portarias_uf: true,
            metas_despesas: true,
            parceiros_creditos: true,
            pendencias_fechamento: true
        };
        
        const [
            unidades,
            servicos,
            taxas_referencia,
            operadores,
            parceiros,
            [ordens_servico, caixa_diario, caixa_movimentos, faturas],
            contas_pagar,
            auditoria,
            portarias_uf,
            metas_despesas,
            solicitantes_parceiros,
            pendencias_fechamento
        ] = await Promise.all([
            sbSelectAll('unidades'),
            sbSelectAll('servicos'),
            sbSelectAll('taxas_referencia'),
            sbSelectAll('operadores'),
            sbSelectAll('parceiros'),
            carregarTabelasComJanela(false),
            sbSelectAll('contas_pagar', 'id', true),
            sbSelectAll('auditoria', 'id', false, 1000), // Most recent first
            sbSelectAll('portarias_uf', 'uf'),
            sbSelectAll('metas_despesas'),
            sbSelectAll('solicitantes_parceiros'),
            sbSelectAll('pendencias_fechamento', 'id', false)
        ]);

        db.unidades = unidades;
        
        // Os dados das unidades (nome, endereço, CNPJ, credenciamento) vêm só do
        // banco. Antes o login os sobrescrevia com valores fixos no código e
        // gravava no banco a cada acesso, desfazendo qualquer correção feita lá.
        db.servicos = servicos;
        db.taxas_referencia = taxas_referencia;
        db.operadores = operadores;
        db.parceiros = parceiros;
        db.ordens_servico = ordens_servico;
        db.caixa_diario = caixa_diario;
        db.caixa_movimentos = caixa_movimentos;
        db.contas_pagar = contas_pagar;
        db.faturas = faturas;
        db.auditoria = auditoria;
        db.solicitantes_parceiros = solicitantes_parceiros || [];
        db.pendencias_fechamento = pendencias_fechamento || [];

        // Tabelas novas do Módulo Cautelar - carregamento defensivo
        let cautelares = [];
        let cautelares_secoes = [];
        let cautelares_fotos = [];
        let cautelares_pesquisas = [];

        try {
            cautelares = await sbSelectAll('cautelares');
            window.onlineTables['cautelares'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela cautelares indisponível no Supabase. Usando array vazio.", e.message);
        }
        // Seções e fotos: só das cautelares em andamento. As encerradas são
        // buscadas sob demanda (garantirDetalhesCautelar) para a carga não
        // crescer indefinidamente com o volume diário de vistorias.
        const cautelaresAbertas = (cautelares || []).filter(c => !cautelarEncerrada(c)).map(c => c.id);
        try {
            cautelares_secoes = await sbSelectIn('cautelares_secoes', 'cautelarId', cautelaresAbertas);
            window.onlineTables['cautelares_secoes'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela cautelares_secoes indisponível no Supabase. Usando array vazio.", e.message);
        }
        try {
            cautelares_fotos = await sbSelectIn('cautelares_fotos', 'secaoId', (cautelares_secoes || []).map(s => s.id));
            window.onlineTables['cautelares_fotos'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela cautelares_fotos indisponível no Supabase. Usando array vazio.", e.message);
        }
        try {
            cautelares_pesquisas = await sbSelectAll('cautelares_pesquisas');
            window.onlineTables['cautelares_pesquisas'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela cautelares_pesquisas indisponível no Supabase. Usando array vazio.", e.message);
        }

        db.cautelares = cautelares || [];
        db.cautelares_secoes = cautelares_secoes || [];
        db.cautelares_fotos = cautelares_fotos || [];
        db.cautelares_pesquisas = cautelares_pesquisas || [];

        // Tabela de Créditos/Cortesias de Parceiros - carregamento defensivo
        let parceiros_creditos = [];
        try {
            parceiros_creditos = await sbSelectAll('parceiros_creditos');
            window.onlineTables['parceiros_creditos'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela parceiros_creditos indisponível no Supabase. Usando array vazio.", e.message);
        }
        db.parceiros_creditos = parceiros_creditos || [];

        // Tabela de Baixas de Fatura Pendentes (retroativas) - carregamento defensivo
        let baixas_faturas_pendentes = [];
        try {
            baixas_faturas_pendentes = await sbSelectAll('baixas_faturas_pendentes', 'id', false);
            window.onlineTables['baixas_faturas_pendentes'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela baixas_faturas_pendentes indisponível no Supabase. Rode a migration 20260915000001.", e.message);
        }
        db.baixas_faturas_pendentes = baixas_faturas_pendentes || [];

        // Tabela de Configurações Gerais (OpenAI, etc) - carregamento defensivo
        let configuracoes_gerais = [];
        try {
            configuracoes_gerais = await sbSelectAll('configuracoes_gerais');
            window.onlineTables['configuracoes_gerais'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela configuracoes_gerais indisponível no Supabase. Usando array vazio.", e.message);
        }
        db.configuracoes_gerais = configuracoes_gerais || [];


        // Process Portarias UF
        db.portarias_uf = {};
        (portarias_uf || []).forEach(p => {
            db.portarias_uf[p.uf] = p.portaria;
        });

        // Process Metas Despesas
        db.metas_despesas = {};
        (metas_despesas || []).forEach(m => {
            const uId = m.unidadeId;
            if (!db.metas_despesas[uId]) {
                db.metas_despesas[uId] = {};
            }
            db.metas_despesas[uId][m.categoria] = parseFloat(m.meta) || 0;
        });

        // Fix numeric precision: Supabase returns DECIMAL as strings
        db.servicos.forEach(s => normalizeRecord('servicos', s));
        db.taxas_referencia.forEach(t => normalizeRecord('taxas_referencia', t));
        db.ordens_servico.forEach(o => normalizeRecord('ordens_servico', o));
        db.caixa_diario.forEach(c => normalizeRecord('caixa_diario', c));
        db.caixa_movimentos.forEach(m => normalizeRecord('caixa_movimentos', m));
        db.contas_pagar.forEach(c => normalizeRecord('contas_pagar', c));
        (db.pendencias_fechamento || []).forEach(p => normalizeRecord('pendencias_fechamento', p));
        db.faturas.forEach(f => normalizeRecord('faturas', f));
        db.parceiros.forEach(p => normalizeRecord('parceiros', p));
        (db.solicitantes_parceiros || []).forEach(s => normalizeRecord('solicitantes_parceiros', s));
        
        db.cautelares.forEach(c => normalizeRecord('cautelares', c));
        db.cautelares_secoes.forEach(cs => normalizeRecord('cautelares_secoes', cs));
        db.cautelares_fotos.forEach(cf => {
            normalizeRecord('cautelares_fotos', cf);
            // A coluna no banco é "metadados"; a tela de captura lê metadados_json
            if (!cf.metadados_json && cf.metadados) cf.metadados_json = cf.metadados;
        });
        db.cautelares_pesquisas.forEach(cp => normalizeRecord('cautelares_pesquisas', cp));
        if (db.parceiros_creditos) {
            db.parceiros_creditos.forEach(pc => normalizeRecord('parceiros_creditos', pc));
        }
        if (db.baixas_faturas_pendentes) {
            db.baixas_faturas_pendentes.forEach(bp => normalizeRecord('baixas_faturas_pendentes', bp));
        }

        // Aplicar localmente quaisquer pendências de sincronização que ainda residam na fila local
        if (typeof applyPendingQueueToLocalCache === 'function') {
            await carregarFilaSync();
            applyPendingQueueToLocalCache();
        }

        console.log(`✅ Dados carregados do Supabase: ${db.ordens_servico.length} OSs, ${db.caixa_diario.length} caixas, ${db.faturas.length} faturas`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao carregar dados do Supabase:', error);
        showToast('Erro ao conectar com o banco de dados. Verifique sua conexão.', 'error');
        return false;
    }
}

// ---- HELPER: Generate number from ID ----

/**
 * Generate OS number directly from the Supabase-generated ID.
 * No extra query needed — eliminates race conditions.
 */
function generateOSNumber(id) {
    return "OS-" + String(id).padStart(4, '0');
}

/**
 * Generate invoice code directly from the Supabase-generated ID.
 */
function generateFaturaCode(id) {
    return "FAT-" + String(id).padStart(4, '0');
}

// ---- HELPER: Update local cache after Supabase operation ----

/**
 * After an insert, add the returned record to the local db cache.
 * Record is already normalized by sbInsert().
 */
function cacheInsert(table, record) {
    if (!record) return;
    if (!db[table]) db[table] = [];
    db[table].push(record);
}

/**
 * After an update, update the record in the local db cache.
 * Applies normalizeRecord to ensure DECIMAL fields stay as numbers.
 */
function cacheUpdate(table, id, updates) {
    const arr = db[table];
    if (!arr) return;
    const idx = arr.findIndex(r => r.id === id);
    if (idx !== -1) {
        Object.assign(arr[idx], updates);
        normalizeRecord(table, arr[idx]);
    }
}

/**
 * After a delete, remove the record from the local db cache.
 */
function cacheDelete(table, id) {
    const arr = db[table];
    if (!arr) return;
    const idx = arr.findIndex(r => r.id === id);
    if (idx !== -1) {
        arr.splice(idx, 1);
    }
}

/**
 * After an insert at the beginning (unshift), add to start of cache.
 * Record is already normalized by sbInsert().
 */
function cacheUnshift(table, record) {
    if (!record) return;
    if (!db[table]) db[table] = [];
    db[table].unshift(record);
}

/**
 * Upsert a portaria by UF in Supabase.
 */
async function sbUpsertPortaria(uf, portaria) {
    const { data, error } = await supabaseClient
        .from('portarias_uf')
        .upsert({ uf, portaria }, { onConflict: 'uf' })
        .select()
        .single();
    
    if (error) {
        console.error(`❌ sbUpsertPortaria(${uf}):`, error.message);
        showToast(`Erro ao salvar portaria no banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbUpsertPortaria(${uf})`);
    return data;
}

/**
 * Delete a portaria by UF in Supabase.
 */
async function sbDeletePortaria(uf) {
    const { error } = await supabaseClient
        .from('portarias_uf')
        .delete()
        .eq('uf', uf);
    
    if (error) {
        console.error(`❌ sbDeletePortaria(${uf}):`, error.message);
        showToast(`Erro ao excluir portaria: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbDeletePortaria(${uf})`);
}

/**
 * Upsert expense budget metas for a unit in Supabase.
 */
async function sbUpsertMetas(unidadeId, metasObject) {
    const rows = Object.entries(metasObject).map(([categoria, meta]) => ({
        unidadeId,
        categoria,
        meta
    }));
    
    const { data, error } = await supabaseClient
        .from('metas_despesas')
        .upsert(rows, { onConflict: 'unidadeId,categoria' });
    
    if (error) {
        console.error(`❌ sbUpsertMetas(${unidadeId}):`, error.message);
        showToast(`Erro ao salvar metas no banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbUpsertMetas(${unidadeId}): ${rows.length} registros`);
    return data;
}

/**
 * Unified database save function.
 * Updates Supabase when window.useSupabase is true, otherwise falls back to localStorage.
 * Synchronously updates the local cache db to keep the UI immediate, then does the DB write.
 */
async function dbSave(table, recordOrUpdates, action = 'insert', id = null) {
    // Agenda sincronização das taxas flutuantes do DETRAN para após a conclusão da gravação dos dados
    if (typeof window.syncDetranFloatingPayable === 'function' && (table === 'ordens_servico' || table === 'taxas_referencia')) {
        setTimeout(() => {
            window.syncDetranFloatingPayable().catch(err => console.error("[DETRAN Sincronizador] Erro:", err));
        }, 150); // 150ms garante que até gravações pesadas do Supabase terminaram
    }

    if (window.useSupabase) {
        try {
            let result;
            if (action === 'insert') {
                result = await sbInsert(table, recordOrUpdates);
                cacheInsert(table, result);
            } else if (action === 'insert_unshift') {
                result = await sbInsert(table, recordOrUpdates);
                cacheUnshift(table, result);
            } else if (action === 'update') {
                if (!id) throw new Error('ID do registro é obrigatório para atualização.');
                result = await sbUpdate(table, id, recordOrUpdates);
                cacheUpdate(table, id, recordOrUpdates);
            } else if (action === 'delete') {
                if (!id) throw new Error('ID do registro é obrigatório para exclusão.');
                await sbDelete(table, id);
                cacheDelete(table, id);
            } else if (action === 'upsert_portaria') {
                const { uf, portaria } = recordOrUpdates;
                result = await sbUpsertPortaria(uf, portaria);
                if (!db.portarias_uf) db.portarias_uf = {};
                db.portarias_uf[uf] = portaria;
            } else if (action === 'delete_portaria') {
                const uf = id; // Here id is the state abbreviation 'SC', 'SP', etc.
                await sbDeletePortaria(uf);
                if (db.portarias_uf) {
                    delete db.portarias_uf[uf];
                }
            } else if (action === 'upsert_metas') {
                const { unidadeId, metas } = recordOrUpdates;
                result = await sbUpsertMetas(unidadeId, metas);
                if (!db.metas_despesas) db.metas_despesas = {};
                db.metas_despesas[unidadeId] = { ...metas };
            }
            return result;
        } catch (error) {
            console.error(`❌ Erro no dbSave online (${table}, ${action}):`, error);
            // Update/delete sem id nunca vai aplicar — não enfileira, senão fica
            // repetindo "invalid input syntax for type bigint: null" pra sempre.
            if ((action === 'update' || action === 'delete') && !id) {
                console.warn(`dbSave ${action} em ${table} sem id — ignorado, não enfileirado.`);
                return null;
            }
            if (!erroDeRede(error)) {
                // O banco recusou (regra, registro inexistente...): repetir não
                // adianta e fingir sucesso esconderia a perda. Sobe o erro.
                throw error;
            }
            showToast("Sem conexão com o banco. A alteração fica guardada e será enviada quando a rede voltar.", "warning");
            if (action === 'insert' || action === 'insert_unshift') {
                const tempId = idProvisorio();
                enqueueSyncItem(table, action, recordOrUpdates, id, tempId);
                const record = { ...recordOrUpdates, id: tempId };
                if (action === 'insert_unshift') cacheUnshift(table, record); else cacheInsert(table, record);
                return record;
            }
            enqueueSyncItem(table, action, recordOrUpdates, id);
        }
    }
    
    // Fallback: LocalStorage / Offline
    if (action === 'insert' || action === 'insert_unshift') {
        const record = { ...recordOrUpdates };
        if (!record.id) record.id = idProvisorio();
        if (action === 'insert_unshift') {
            cacheUnshift(table, record);
        } else {
            cacheInsert(table, record);
        }
        if (typeof saveDatabase === 'function') saveDatabase();
        return record;
    } else if (action === 'update') {
        cacheUpdate(table, id, recordOrUpdates);
        if (typeof saveDatabase === 'function') saveDatabase();
        return db[table].find(r => r.id === id);
    } else if (action === 'delete') {
        cacheDelete(table, id);
        if (typeof saveDatabase === 'function') saveDatabase();
        return null;
    } else if (action === 'upsert_portaria') {
        const { uf, portaria } = recordOrUpdates;
        if (!db.portarias_uf) db.portarias_uf = {};
        db.portarias_uf[uf] = portaria;
        if (typeof saveDatabase === 'function') saveDatabase();
        return recordOrUpdates;
    } else if (action === 'delete_portaria') {
        const uf = id;
        if (db.portarias_uf) {
            delete db.portarias_uf[uf];
        }
        if (typeof saveDatabase === 'function') saveDatabase();
        return null;
    } else if (action === 'upsert_metas') {
        const { unidadeId, metas } = recordOrUpdates;
        if (!db.metas_despesas) db.metas_despesas = {};
        db.metas_despesas[unidadeId] = { ...metas };
        if (typeof saveDatabase === 'function') saveDatabase();
        return recordOrUpdates;
    }
}

// ==========================================
// ---- FILA DE SINCRONIZAÇÃO (queda de rede) ----
// ==========================================
// Só falha de REDE vai para a fila. Erro do banco (regra violada, registro
// inexistente) é mostrado na hora e sobe para quem chamou: antes ele também ia
// para a fila e a tela mostrava sucesso de algo que nunca foi gravado.
//
// A fila fica no IndexedDB (o localStorage lota com poucos MB e a fila se
// perdia em silêncio), com cópia em memória para leitura síncrona. Registros
// criados sem rede recebem id NEGATIVO provisório, que nunca colide com um id
// real; ao sincronizar, o id real substitui o provisório no cache e nos itens
// seguintes da fila (osId, cautelarId etc.).

const FILA_LS = 'certive_sync_queue';
const FILA_IDB = { nome: 'certive', versao: 1, store: 'fila_sync', chave: 'fila' };
let _filaSync = null;
let _filaGravando = Promise.resolve();

function erroDeRede(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const msg = String((err && (err.message || err.details)) || err || '');
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_network|err_internet|timed? ?out|aborted|socket|ECONN/i.test(msg);
}

function idProvisorio() {
    return -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}

function abrirIdbFila() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
        const req = indexedDB.open(FILA_IDB.nome, FILA_IDB.versao);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(FILA_IDB.store)) req.result.createObjectStore(FILA_IDB.store);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbFila(modo, valor) {
    const banco = await abrirIdbFila();
    try {
        return await new Promise((resolve, reject) => {
            const tx = banco.transaction(FILA_IDB.store, modo === 'ler' ? 'readonly' : 'readwrite');
            const st = tx.objectStore(FILA_IDB.store);
            const req = modo === 'ler' ? st.get(FILA_IDB.chave) : st.put(valor, FILA_IDB.chave);
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        banco.close();
    }
}

function lerFilaLocalStorage() {
    try { return JSON.parse(localStorage.getItem(FILA_LS) || '[]') || []; } catch (e) { return []; }
}

// Carrega a fila do IndexedDB (e migra a fila antiga do localStorage).
async function carregarFilaSync() {
    const antiga = lerFilaLocalStorage();
    try {
        const salva = (await idbFila('ler')) || [];
        const ids = new Set(salva.map(x => x.id));
        _filaSync = salva.concat(antiga.filter(x => !ids.has(x.id)));
        if (antiga.length) { await idbFila('gravar', _filaSync); localStorage.removeItem(FILA_LS); }
    } catch (e) {
        console.warn('Fila de sincronização no localStorage (IndexedDB indisponível):', e);
        _filaSync = antiga;
    }
    return _filaSync.slice();
}

function getSyncQueue() {
    if (_filaSync === null) _filaSync = lerFilaLocalStorage();
    return _filaSync.slice();
}

function saveSyncQueue(queue) {
    _filaSync = queue.slice();
    const copia = _filaSync.slice();
    _filaGravando = _filaGravando.then(() => idbFila('gravar', copia)).catch(e => {
        console.warn('IndexedDB falhou; gravando a fila no localStorage:', e);
        try { localStorage.setItem(FILA_LS, JSON.stringify(copia)); }
        catch (e2) {
            console.error('Fila de sincronização não pôde ser gravada:', e2);
            if (typeof showToast === 'function') showToast('Atenção: o navegador está sem espaço e as alterações sem rede podem se perder. Reconecte à internet.', 'error');
        }
    });
    if (typeof updateSyncIndicatorUI === 'function') updateSyncIndicatorUI();
}

function enqueueSyncItem(table, action, recordOrUpdates, id = null, tempId = null) {
    const queue = getSyncQueue();
    const queueId = 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    queue.push({
        id: queueId,
        table,
        action,
        recordOrUpdates,
        recordId: id,
        tempId,
        timestamp: new Date().toISOString()
    });
    saveSyncQueue(queue);
    console.log(`📥 Item enfileirado para sincronização offline: ${table} (${action})`);
}

// Campos que apontam para outras tabelas: quando um id provisório vira real,
// os itens seguintes da fila precisam apontar para o id novo.
const REFERENCIAS_FILA = {
    ordens_servico: ['osId', 'reapresentacaoOrigemID'],
    cautelares: ['cautelarId'],
    cautelares_secoes: ['secaoId'],
    caixa_diario: ['caixaId'],
    faturas: ['faturaId'],
    parceiros: ['parceiroId'],
    contas_pagar: ['contaPagarId']
};

function trocarIdNaFila(fila, table, tempId, realId) {
    const campos = REFERENCIAS_FILA[table] || [];
    fila.forEach(item => {
        if (item.table === table && item.recordId === tempId) item.recordId = realId;
        const r = item.recordOrUpdates;
        if (r && typeof r === 'object') campos.forEach(c => { if (r[c] === tempId) r[c] = realId; });
    });
}

let isProcessingSyncQueue = false;

async function processSyncQueue() {
    // Duas abas abertas enviariam a mesma fila duas vezes: só uma processa.
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
        return navigator.locks.request('certive-fila-sync', { ifAvailable: true }, async (lock) => {
            if (!lock) return;
            await carregarFilaSync();   // outra aba pode ter mexido na fila
            return processarFilaSync();
        });
    }
    return processarFilaSync();
}

async function processarFilaSync() {
    if (isProcessingSyncQueue) return;
    const fila = getSyncQueue();
    if (fila.length === 0) {
        if (typeof updateSyncIndicatorUI === 'function') updateSyncIndicatorUI();
        return;
    }

    isProcessingSyncQueue = true;
    if (typeof updateSyncIndicatorUI === 'function') updateSyncIndicatorUI(true);
    console.log(`⏳ Iniciando processamento de ${fila.length} pendências offline...`);

    const pendentes = [];
    const rejeitados = [];
    let parouPorRede = false;

    try {
        for (let k = 0; k < fila.length; k++) {
            const item = fila[k];
            if (parouPorRede) { pendentes.push(item); continue; }
            try {
                if (item.action === 'insert' || item.action === 'insert_unshift') {
                    const { id: _ignorado, ...registro } = item.recordOrUpdates || {};
                    const inserted = await sbInsert(item.table, registro);
                    const tempId = item.tempId != null ? item.tempId : (item.recordOrUpdates && item.recordOrUpdates.id);
                    if (tempId != null && inserted && inserted.id !== tempId) {
                        updateLocalReferences(item.table, tempId, inserted.id);
                        trocarIdNaFila(fila.slice(k + 1), item.table, tempId, inserted.id);
                    }
                } else if (item.action === 'update') {
                    if (item.recordId < 0) throw Object.assign(new Error('registro ainda não criado no servidor'), { code: 'PENDENTE' });
                    await sbUpdate(item.table, item.recordId, item.recordOrUpdates);
                } else if (item.action === 'delete') {
                    if (item.recordId < 0) continue;   // criado e apagado sem rede: nada a fazer
                    await sbDelete(item.table, item.recordId);
                } else if (item.action === 'upsert_portaria') {
                    await sbUpsertPortaria(item.recordOrUpdates.uf, item.recordOrUpdates.portaria);
                } else if (item.action === 'delete_portaria') {
                    await sbDeletePortaria(item.recordId);
                } else if (item.action === 'upsert_metas') {
                    await sbUpsertMetas(item.recordOrUpdates.unidadeId, item.recordOrUpdates.metas);
                }
            } catch (err) {
                const code = err && err.code;
                const msg = String((err && err.message) || '');
                if (erroDeRede(err)) {
                    // Sem rede: para aqui e mantém a ordem da fila
                    parouPorRede = true;
                    pendentes.push(item);
                } else if (code === '23505' || /duplicate key|already exists/i.test(msg)) {
                    // Já aplicado antes (a resposta se perdeu): pode sair da fila
                    console.warn(`Item ${item.id} (${item.table}/${item.action}) já estava no servidor.`);
                } else if (code === '23503' || code === 'PENDENTE') {
                    // Depende de um registro que ainda não subiu: tenta de novo depois
                    pendentes.push(item);
                } else {
                    // O banco recusou: guarda à parte e avisa, em vez de descartar
                    console.error(`❌ Item ${item.id} (${item.table}/${item.action}) recusado pelo banco:`, err);
                    rejeitados.push({ ...item, erro: msg || String(code || 'erro'), recusadoEm: new Date().toISOString() });
                }
            }
        }
    } finally {
        saveSyncQueue(pendentes);
        if (rejeitados.length) {
            try {
                const antigos = JSON.parse(localStorage.getItem('certive_sync_recusados') || '[]');
                localStorage.setItem('certive_sync_recusados', JSON.stringify(antigos.concat(rejeitados).slice(-200)));
            } catch (e) { console.error('Não foi possível guardar os itens recusados:', e); }
        }
        isProcessingSyncQueue = false;
    }

    if (rejeitados.length) {
        showToast(`${rejeitados.length} alteração(ões) feitas sem rede foram recusadas pelo banco e NÃO foram gravadas. Confira os registros e refaça.`, "error");
    } else if (pendentes.length === 0) {
        showToast("Todas as pendências offline foram sincronizadas com sucesso!", "success");
    } else {
        showToast(`Conexão instável: ${pendentes.length} pendências salvas para posterior sincronização.`, "warning");
    }
    if (typeof updateSyncIndicatorUI === 'function') updateSyncIndicatorUI();
}

function updateLocalReferences(table, tempId, realId) {
    console.log(`🔄 Atualizando referências locais de ID temporário: ${table} (ID antigo: ${tempId} -> ID novo: ${realId})`);

    const record = (db[table] || []).find(r => r.id === tempId);
    if (record) record.id = realId;

    const campos = REFERENCIAS_FILA[table] || [];
    Object.keys(db).forEach(t => {
        if (!Array.isArray(db[t])) return;
        db[t].forEach(r => { if (r && typeof r === 'object') campos.forEach(c => { if (r[c] === tempId) r[c] = realId; }); });
    });
    if (table === 'ordens_servico') {
        (db.faturas || []).forEach(f => {
            if (Array.isArray(f.ordensIds)) f.ordensIds = f.ordensIds.map(x => x === tempId ? realId : x);
        });
    }
}

function applyPendingQueueToLocalCache() {
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    console.log(`⚙️ Aplicando ${queue.length} pendências locais da fila sobre o cache do banco...`);

    queue.forEach(item => {
        const table = item.table;
        if (!db[table]) db[table] = [];

        if (item.action === 'insert' || item.action === 'insert_unshift') {
            const registro = { ...item.recordOrUpdates };
            if (item.tempId != null) registro.id = item.tempId;
            const exists = registro.id != null && db[table].some(r => r.id === registro.id);
            if (!exists) {
                if (item.action === 'insert_unshift') db[table].unshift(registro);
                else db[table].push(registro);
            }
        } else if (item.action === 'update') {
            const record = db[table].find(r => r.id === item.recordId);
            if (record) {
                Object.assign(record, item.recordOrUpdates);
                normalizeRecord(table, record);
            }
        } else if (item.action === 'delete') {
            db[table] = db[table].filter(r => r.id !== item.recordId);
        }
    });
}

function updateSyncIndicatorUI(syncing = false) {
    const el = document.getElementById('topbar-sync-indicator');
    if (!el) return;
    
    const queue = getSyncQueue();
    const isOnline = navigator.onLine;
    
    if (!isOnline) {
        el.innerHTML = `<span class="badge" style="background: var(--danger); color: #fff; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 11px; display: inline-flex; align-items: center; gap: 6px; font-weight:700;"><i class="ri-wifi-off-line"></i> Offline (${queue.length} pendentes)</span>`;
    } else if (syncing) {
        el.innerHTML = `<span class="badge" style="background: var(--warning); color: #000; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 11px; display: inline-flex; align-items: center; gap: 6px; font-weight:700;"><i class="ri-loader-4-line spinning"></i> Sincronizando...</span>`;
    } else if (queue.length > 0) {
        el.innerHTML = `<button onclick="processSyncQueue()" class="btn btn-warning btn-sm" style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; font-weight:700; cursor: pointer; animation: pulse 2s infinite;"><i class="ri-alert-line"></i> Sincronizar (${queue.length} pendentes)</button>`;
    } else {
        el.innerHTML = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--success); padding: 6px 12px; border-radius: var(--radius-sm); font-size: 11px; display: inline-flex; align-items: center; gap: 6px; font-weight:700;"><i class="ri-checkbox-circle-line"></i> Nuvem Conectada</span>`;
    }
}

// Sincronização automática ao detectar rede online
window.addEventListener('online', () => {
    processSyncQueue();
});
window.addEventListener('offline', () => {
    updateSyncIndicatorUI();
});


// ==========================================
// ARQUIVOS PRIVADOS (fotos das cautelares, PDFs de faturas)
// Os buckets não são públicos: o banco guarda o endereço "público" do arquivo
// (formato antigo), e aqui ele é trocado por um link temporário assinado.
// ==========================================
const _linksAssinados = new Map();
const RE_ARQUIVO_STORAGE = /\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/([^?#]+)/;

/**
 * Link temporário para um arquivo do Storage. Aceita o endereço guardado no banco
 * (público, com ?v=...) e devolve um link assinado válido por `validadeSeg` segundos.
 * Endereços de fora do Storage voltam sem alteração.
 */
async function urlArmazenamento(url, validadeSeg = 3600) {
    if (!url || typeof url !== 'string') return url;
    const m = url.match(RE_ARQUIVO_STORAGE);
    if (!m || typeof supabaseClient === 'undefined' || !supabaseClient) return url;
    const bucket = m[1];
    const caminho = decodeURIComponent(m[2]);
    const chave = `${bucket}/${caminho}|${validadeSeg}`;
    const guardado = _linksAssinados.get(chave);
    if (guardado && guardado.expira > Date.now() + 120000) return guardado.url;
    const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(caminho, validadeSeg);
    if (error || !data || !data.signedUrl) {
        console.warn('Link temporário indisponível:', caminho, error);
        return url;
    }
    _linksAssinados.set(chave, { url: data.signedUrl, expira: Date.now() + validadeSeg * 1000 });
    return data.signedUrl;
}
window.urlArmazenamento = urlArmazenamento;

// Toda <img>, <iframe> ou <a> que aparecer na tela apontando para um arquivo do
// Storage recebe o link temporário (as telas continuam usando o endereço guardado).
(function iniciarLinksTemporarios() {
    const ATRIBUTOS = { IMG: 'src', IFRAME: 'src', A: 'href', EMBED: 'src', OBJECT: 'data' };
    const trocar = (el) => {
        const attr = ATRIBUTOS[el.tagName];
        if (!attr) return;
        const valor = el.getAttribute(attr);
        if (!valor || !/\/storage\/v1\/object\/public\//.test(valor)) return;
        if (el.dataset.arquivoOriginal === valor) return;
        el.dataset.arquivoOriginal = valor;
        urlArmazenamento(valor).then(assinado => {
            if (assinado && assinado !== valor && el.getAttribute(attr) === valor) el.setAttribute(attr, assinado);
        });
    };
    const varrer = (raiz) => {
        if (!raiz || raiz.nodeType !== 1) return;
        trocar(raiz);
        raiz.querySelectorAll && raiz.querySelectorAll('img[src*="/storage/v1/object/public/"],iframe[src*="/storage/v1/object/public/"],a[href*="/storage/v1/object/public/"],embed[src*="/storage/v1/object/public/"]').forEach(trocar);
    };
    const observar = () => {
        varrer(document.body);
        new MutationObserver(mudancas => {
            for (const m of mudancas) {
                if (m.type === 'attributes') trocar(m.target);
                else m.addedNodes.forEach(varrer);
            }
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'data'] });
    };
    if (document.body) observar(); else document.addEventListener('DOMContentLoaded', observar);
})();
