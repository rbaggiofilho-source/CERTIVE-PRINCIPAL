/* Painel de Vistoria — persistência local.
 * IndexedDB (stores: config, vistorias, fotos). Fallback: localStorage; último recurso: memória.
 * Fotos são guardadas como data URL JPEG (facilita exportar/importar e imprimir). */
const DB = (() => {
  const NAME = 'painel-vistoria';
  const VERSION = 1;
  const STORES = ['config', 'vistorias', 'fotos'];
  let idb = null;
  let mode = 'memoria';
  const mem = { config: new Map(), vistorias: new Map(), fotos: new Map() };

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window) || !window.indexedDB) return reject(new Error('sem indexedDB'));
      let req;
      try { req = indexedDB.open(NAME, VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('vistorias')) db.createObjectStore('vistorias', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('fotos')) {
          const s = db.createObjectStore('fotos', { keyPath: 'id' });
          s.createIndex('vistoriaId', 'vistoriaId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexedDB bloqueado'));
    });
  }

  function lsOk() {
    try { const k = '__pv_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }

  async function init() {
    try {
      idb = await Promise.race([openIDB(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 4000))]);
      mode = 'indexeddb';
    } catch (e) {
      idb = null;
      mode = lsOk() ? 'localstorage' : 'memoria';
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* opcional */ }
    return mode;
  }

  function tx(store, rw) { return idb.transaction(store, rw ? 'readwrite' : 'readonly').objectStore(store); }
  function p(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
  const lsKey = (store, id) => `pv:${store}:${id}`;

  async function get(store, id) {
    if (mode === 'indexeddb') return (await p(tx(store).get(id))) || null;
    if (mode === 'localstorage') { const s = localStorage.getItem(lsKey(store, id)); return s ? JSON.parse(s) : null; }
    const v = mem[store].get(id); return v ? JSON.parse(JSON.stringify(v)) : null;
  }
  async function put(store, obj) {
    if (mode === 'indexeddb') return p(tx(store, true).put(obj));
    if (mode === 'localstorage') {
      try { localStorage.setItem(lsKey(store, obj.id), JSON.stringify(obj)); }
      catch (e) { throw new Error('Espaço do navegador esgotado. Exporte e exclua vistorias antigas.'); }
      return obj.id;
    }
    mem[store].set(obj.id, JSON.parse(JSON.stringify(obj))); return obj.id;
  }
  async function del(store, id) {
    if (mode === 'indexeddb') return p(tx(store, true).delete(id));
    if (mode === 'localstorage') { localStorage.removeItem(lsKey(store, id)); return; }
    mem[store].delete(id);
  }
  async function all(store) {
    if (mode === 'indexeddb') return p(tx(store).getAll());
    if (mode === 'localstorage') {
      const out = []; const pre = `pv:${store}:`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(pre)) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* ignora */ } }
      }
      return out;
    }
    return [...mem[store].values()].map(v => JSON.parse(JSON.stringify(v)));
  }
  async function fotosDa(vistoriaId) {
    if (mode === 'indexeddb') return p(tx('fotos').index('vistoriaId').getAll(vistoriaId));
    return (await all('fotos')).filter(f => f.vistoriaId === vistoriaId);
  }
  async function delFotosDa(vistoriaId) {
    const fs = await fotosDa(vistoriaId);
    for (const f of fs) await del('fotos', f.id);
  }
  async function estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* */ }
    return null;
  }
  return { init, get, put, del, all, fotosDa, delFotosDa, estimate, get mode() { return mode; }, STORES };
})();
