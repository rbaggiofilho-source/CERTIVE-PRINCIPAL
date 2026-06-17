// ==========================================
// CERTIVE VISTORIAS — Data Access Layer (DAL)
// Camada de acesso a dados via Supabase
// ==========================================

// ---- GENERIC CRUD OPERATIONS ----

/**
 * Insert a record into a Supabase table.
 * Returns the inserted record with the auto-generated ID.
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
    return data;
}

/**
 * Insert multiple records into a Supabase table.
 * Returns the inserted records with auto-generated IDs.
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
    return data;
}

/**
 * Update a record by ID.
 * Returns the updated record.
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
    return data;
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
        db.servicos.forEach(s => { s.precoBalcao = parseFloat(s.precoBalcao); });
        db.taxas_referencia.forEach(t => { t.taxa = parseFloat(t.taxa); });
        db.ordens_servico.forEach(o => { o.valor = parseFloat(o.valor); });
        db.caixa_diario.forEach(c => { 
            c.saldoAbertura = parseFloat(c.saldoAbertura); 
            c['saldoEspécieInformado'] = parseFloat(c['saldoEspécieInformado'] || 0);
        });
        db.caixa_movimentos.forEach(m => { m.valor = parseFloat(m.valor); });
        db.contas_pagar.forEach(c => { c.valor = parseFloat(c.valor); });
        db.faturas.forEach(f => { f.valorTotal = parseFloat(f.valorTotal); });

        // Ensure tabelaPrecos values are numbers
        db.parceiros.forEach(p => {
            if (p.tabelaPrecos && typeof p.tabelaPrecos === 'object') {
                for (const key in p.tabelaPrecos) {
                    p.tabelaPrecos[key] = parseFloat(p.tabelaPrecos[key]);
                }
            }
        });

        console.log(`✅ Dados carregados do Supabase: ${ordens_servico.length} OSs, ${caixa_diario.length} caixas, ${faturas.length} faturas`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao carregar dados do Supabase:', error);
        showToast('Erro ao conectar com o banco de dados. Verifique sua conexão.', 'error');
        return false;
    }
}

// ---- HELPER: Next sequential number ----

/**
 * Generate next OS number based on max ID in Supabase.
 */
async function getNextOSNumber() {
    const { data, error } = await supabaseClient
        .from('ordens_servico')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .single();
    
    const nextId = (data && !error) ? data.id + 1 : 1;
    return "OS-" + String(nextId).padStart(4, '0');
}

/**
 * Generate next invoice code based on max ID in Supabase.
 */
async function getNextFaturaCode() {
    const { data, error } = await supabaseClient
        .from('faturas')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .single();
    
    const nextId = (data && !error) ? data.id + 1 : 1;
    return "FAT-" + String(nextId).padStart(4, '0');
}

// ---- HELPER: Update local cache after Supabase operation ----

/**
 * After an insert, add the returned record to the local db cache.
 */
function cacheInsert(table, record) {
    if (!db[table]) db[table] = [];
    db[table].push(record);
}

/**
 * After an update, update the record in the local db cache.
 */
function cacheUpdate(table, id, updates) {
    const arr = db[table];
    if (!arr) return;
    const idx = arr.findIndex(r => r.id === id);
    if (idx !== -1) {
        Object.assign(arr[idx], updates);
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
 */
function cacheUnshift(table, record) {
    if (!db[table]) db[table] = [];
    db[table].unshift(record);
}
