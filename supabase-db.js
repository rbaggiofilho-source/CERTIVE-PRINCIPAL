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
    faturas: ['valorTotal']
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
 * Insert a record into a Supabase table.
 * Returns the inserted record with the auto-generated ID (normalized).
 */
async function sbInsert(table, record) {
    const { data, error } = await supabaseClient
        .from(table)
        .insert(record)
        .select()
        .single();
    
    if (error) {
        console.error(`❌ sbInsert(${table}):`, error.message);
        showToast(`Erro ao salvar no banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbInsert(${table}): ID ${data.id}`);
    return normalizeRecord(table, data);
}

/**
 * Insert multiple records into a Supabase table.
 * Returns the inserted records with auto-generated IDs (normalized).
 */
async function sbInsertMany(table, records) {
    const { data, error } = await supabaseClient
        .from(table)
        .insert(records)
        .select();
    
    if (error) {
        console.error(`❌ sbInsertMany(${table}):`, error.message);
        showToast(`Erro ao salvar no banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbInsertMany(${table}): ${data.length} registros`);
    return (data || []).map(r => normalizeRecord(table, r));
}

/**
 * Update a record by ID.
 * Returns the updated record (normalized).
 */
async function sbUpdate(table, id, updates) {
    const { data, error } = await supabaseClient
        .from(table)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    
    if (error) {
        console.error(`❌ sbUpdate(${table}, ${id}):`, error.message);
        showToast(`Erro ao atualizar no banco: ${error.message}`, 'error');
        throw error;
    }
    console.log(`✅ sbUpdate(${table}): ID ${id}`);
    return normalizeRecord(table, data);
}

/**
 * Delete a record by ID.
 */
async function sbDelete(table, id) {
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
    return data || [];
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
    return data || [];
}

// ---- DATABASE LOADER ----

/**
 * Load ALL tables from Supabase into the global `db` object.
 * This replaces the old loadDatabase() that read from localStorage.
 */
async function loadAllFromSupabase() {
    try {
        console.log('⏳ Carregando dados do Supabase...');
        
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
            auditoria
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
            sbSelectAll('auditoria', 'id', false) // Most recent first
        ]);

        db.unidades = unidades;
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

        // Fix numeric precision: Supabase returns DECIMAL as strings
        db.servicos.forEach(s => normalizeRecord('servicos', s));
        db.taxas_referencia.forEach(t => normalizeRecord('taxas_referencia', t));
        db.ordens_servico.forEach(o => normalizeRecord('ordens_servico', o));
        db.caixa_diario.forEach(c => normalizeRecord('caixa_diario', c));
        db.caixa_movimentos.forEach(m => normalizeRecord('caixa_movimentos', m));
        db.contas_pagar.forEach(c => normalizeRecord('contas_pagar', c));
        db.faturas.forEach(f => normalizeRecord('faturas', f));
        db.parceiros.forEach(p => normalizeRecord('parceiros', p));

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

// Get next OS Number from Database reliably
async function getNextOSNumber() {
    if (!supabaseClient) return "OS-0001";
    try {
        const { data, error } = await supabaseClient
            .from('ordens_servico')
            .select('numero, id')
            .order('id', { ascending: false })
            .limit(1);
            
        if (error) throw error;
        
        if (data && data.length > 0) {
            const lastNumStr = data[0].numero; // "OS-0005"
            // If it doesn't match the format, fallback to id
            const match = lastNumStr.match(/OS-(\d+)/);
            if (match && match[1]) {
                const nextId = parseInt(match[1]) + 1;
                return "OS-" + String(nextId).padStart(4, '0');
            } else {
                return "OS-" + String(data[0].id + 1).padStart(4, '0');
            }
        }
        return "OS-0001";
    } catch (e) {
        console.error("Erro ao buscar próximo número de OS:", e);
        // Fallback to local array
        return "OS-" + String(db.ordens_servico.length + 1).padStart(4, '0');
    }
}
