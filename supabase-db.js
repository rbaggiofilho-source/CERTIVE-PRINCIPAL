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
    parceiros: ['precoCombo', 'precoComboTransferencia']
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
    return clean;
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
        console.warn(`⚠️ sbUpdate(${table}, ${id}): nenhuma linha encontrada com esse ID.`);
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
async function sbSelectAll(table, orderBy = 'id', ascending = true) {
    const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .order(orderBy, { ascending });
    
    if (error) {
        console.error(`❌ sbSelectAll(${table}):`, error.message);
        throw error;
    }
    return (data || []).map(r => prepareRecordFromDb(table, r));
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
            metas_despesas: true
        };
        
        const [
            unidades,
            servicos,
            taxas_referencia,
            operadores,
            parceiros,
            ordens_servico,
            caixa_diario,
            caixa_movimentos,
            contas_pagar,
            faturas,
            auditoria,
            portarias_uf,
            metas_despesas,
            solicitantes_parceiros
        ] = await Promise.all([
            sbSelectAll('unidades'),
            sbSelectAll('servicos'),
            sbSelectAll('taxas_referencia'),
            sbSelectAll('operadores'),
            sbSelectAll('parceiros'),
            sbSelectAll('ordens_servico', 'id', true),
            sbSelectAll('caixa_diario', 'id', true),
            sbSelectAll('caixa_movimentos', 'id', true),
            sbSelectAll('contas_pagar', 'id', true),
            sbSelectAll('faturas', 'id', true),
            sbSelectAll('auditoria', 'id', false), // Most recent first
            sbSelectAll('portarias_uf', 'uf'),
            sbSelectAll('metas_despesas'),
            sbSelectAll('solicitantes_parceiros')
        ]);

        db.unidades = unidades;
        
        // Forçar atualização histórica dos endereços oficiais das filiais
        const matriz = db.unidades.find(u => u.id === 1);
        if (matriz) {
            matriz.nome = "Certive Matriz — São José";
            matriz.endereco = "Rodovia BR 101 SN BOX 10, Anexo ao Mundo Car Mais Shopping, Bairro Kobrasol - São José CEP 88102-700";
            matriz.razao_social = "Certive Vistorias Automotivas Ltda";
            matriz.cnpj = "45.890.122/0001-08";
            matriz.credenciamento = "ECV-2023-091";
            matriz.cidade = "São José";
            matriz.uf = "SC";
            matriz.canal_ouvidoria = "ouvidoria@certive.com.br";
            
            // Tenta atualizar no Supabase de forma assíncrona
            supabaseClient.from('unidades').update({ endereco: matriz.endereco, nome: matriz.nome }).eq('id', 1).then(({error}) => {
                if (error) console.warn("Aviso: RLS impediu update de unidades no Supabase (esperado para leitores).", error.message);
            });
        }
        const filial = db.unidades.find(u => u.id === 2);
        if (filial) {
            filial.nome = "Certive Filial — Palhoça";
            filial.endereco = "Avenida Atílio Pagani, 850, Palhoça - SC";
            filial.razao_social = "Certive Vistorias Automotivas Ltda";
            filial.cnpj = "45.890.122/0002-99";
            filial.credenciamento = "ECV-2023-142";
            filial.cidade = "Palhoça";
            filial.uf = "SC";
            filial.canal_ouvidoria = "ouvidoria@certive.com.br";
            
            supabaseClient.from('unidades').update({ endereco: filial.endereco, nome: filial.nome }).eq('id', 2).then(({error}) => {
                if (error) console.warn("Aviso: RLS impediu update de unidades no Supabase.", error.message);
            });
        }
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
        try {
            cautelares_secoes = await sbSelectAll('cautelares_secoes');
            window.onlineTables['cautelares_secoes'] = true;
        } catch (e) {
            console.warn("⚠️ Tabela cautelares_secoes indisponível no Supabase. Usando array vazio.", e.message);
        }
        try {
            cautelares_fotos = await sbSelectAll('cautelares_fotos');
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
        db.faturas.forEach(f => normalizeRecord('faturas', f));
        db.parceiros.forEach(p => normalizeRecord('parceiros', p));
        (db.solicitantes_parceiros || []).forEach(s => normalizeRecord('solicitantes_parceiros', s));
        
        db.cautelares.forEach(c => normalizeRecord('cautelares', c));
        db.cautelares_secoes.forEach(cs => normalizeRecord('cautelares_secoes', cs));
        db.cautelares_fotos.forEach(cf => normalizeRecord('cautelares_fotos', cf));
        db.cautelares_pesquisas.forEach(cp => normalizeRecord('cautelares_pesquisas', cp));

        console.log(`✅ Dados carregados do Supabase: ${ordens_servico.length} OSs, ${caixa_diario.length} caixas, ${faturas.length} faturas`);
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
            showToast("Falha no banco online. Salvando localmente...", "warning");
        }
    }
    
    // Fallback: LocalStorage / Offline
    if (action === 'insert' || action === 'insert_unshift') {
        const record = { ...recordOrUpdates };
        if (!record.id) {
            const arr = db[table] || [];
            record.id = arr.length > 0 ? Math.max(...arr.map(r => r.id || 0)) + 1 : 1;
        }
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
