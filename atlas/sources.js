// sources.js — where the atlas gets maps. See docs/map-source.md.
//
//   const info = await detectServer(base);          // the relay's /api/info, or null
//   const source = info ? serverSource(base, info) : folderSource(handle);
//
// Both meet the same interface: capabilities, list(), read(path), watch(fn), and
// optionally onShow(fn), shutdown(), openExternal(url); the relay also onRender(fn),
// claimRender(id), answerRender(id, body) (WO-32: the agent's render, render.js).

const MAP_RE = /\.(md|mmd)$/i;
const POLL_MS = 2500;

// ---------- server ----------

// The relay's /api/info beside the page, or null when no map server answers there
// (a plain static server gives a 404 or an HTML page).
export async function detectServer(base, fetchFn = fetch) {
  try {
    const res = await fetchFn(new URL('api/info', base), { cache: 'no-store' });
    if (!res.ok) return null;
    const info = await res.json();
    return info && Array.isArray(info.capabilities) && info.capabilities.includes('tree') ? info : null;
  } catch (_) {
    return null;
  }
}

// The relay server's HTTP API (docs/relay-server-api.md). info is its /api/info.
export function serverSource(base, info = { capabilities: [] }, fetchFn = fetch) {
  const caps = new Set(info.capabilities || []);
  const url = (p) => new URL(p, base);
  const post = async (p, body) => {
    const res = await fetchFn(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
    return res.json();
  };
  const showFns = new Set();
  const renderFns = new Set();
  const source = {
    kind: 'server',
    async identity() { return info.sourceId || `server:${new URL(base).href}`; },
    capabilities: { shutdown: caps.has('shutdown'), openExternal: caps.has('open') },
    async list() {
      const res = await fetchFn(url('api/tree'), { cache: 'no-store' });
      if (!res.ok) throw new Error(`api/tree: HTTP ${res.status}`);
      return res.json();
    },
    async read(path) {
      const res = await fetchFn(url(`api/map?p=${encodeURIComponent(path)}`), { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 404 ? `No map "${path}".` : `api/map: HTTP ${res.status}`);
      return res.text();
    },
    // the map's earlier version the agent sent (show --before), or null
    async readBefore(path) {
      if (!caps.has('before')) return null;
      // empty=1: a relay with no earlier version answers 204, which no console shows as an error
      const res = await fetchFn(url(`api/before?p=${encodeURIComponent(path)}&empty=1`), { cache: 'no-store' });
      return res.status === 200 ? res.text() : null;
    },
    // Server-Sent Events while the stream holds; polling /api/tree while it does not.
    watch(fn) {
      let last = null;
      let timer = null;
      let es = null;
      const changed = (state) => { if (state !== last) { last = state; fn({ state }); } };
      const poll = () => source.list().then((t) => changed(t.state)).catch(() => { /* server gone: keep trying */ });
      const startPolling = () => { if (!timer) timer = setInterval(poll, POLL_MS); };
      const stopPolling = () => { clearInterval(timer); timer = null; };
      if (caps.has('events') && typeof EventSource === 'function') {
        es = new EventSource(url('api/events'));
        es.addEventListener('tree', (e) => { stopPolling(); try { changed(JSON.parse(e.data).state); } catch (_) { /* bad event */ } });
        es.addEventListener('show', (e) => { let d; try { d = JSON.parse(e.data); } catch (_) { return; } showFns.forEach((f) => f(d)); });
        es.addEventListener('render', (e) => { let d; try { d = JSON.parse(e.data); } catch (_) { return; } renderFns.forEach((f) => f(d)); });
        es.addEventListener('open', stopPolling);
        es.addEventListener('error', startPolling);
      } else {
        startPolling();
      }
      return () => { stopPolling(); es?.close(); };
    },
    // "Look here" from the agent: fn({path, node?, focus?, mode?, view?, env?}).
    onShow(fn) { showFns.add(fn); return () => showFns.delete(fn); },
    // The agent's render: fn(request); this page claims it (true: it is this page's to
    // answer), draws it and posts the answer.
    onRender(fn) { renderFns.add(fn); return () => renderFns.delete(fn); },
    async claimRender(id) {
      const res = await fetchFn(url(`api/render/${encodeURIComponent(id)}/claim`), { method: 'POST' });
      return res.ok;
    },
    answerRender: (id, body) => post(`api/render/${encodeURIComponent(id)}`, body),
  };
  if (caps.has('shutdown')) source.shutdown = () => post('api/shutdown', {});
  if (caps.has('open')) source.openExternal = (u) => post('api/open', { url: u });
  return source;
}

// ---------- folder ----------

const hidden = (name) => name.startsWith('.');

// A folder the user picked (File System Access API). handle is a
// FileSystemDirectoryHandle, or anything with the same values()/getFile() shape.
// Read-only; polls the folder for changes.
export function folderSource(handle) {
  let identity = null;
  const titles = new Map();   // path -> {key, title}: titles read once per file version
  async function titleOf(path, file) {
    const key = `${file.lastModified}|${file.size}`;
    const hit = titles.get(path);
    if (hit && hit.key === key) return hit.title;
    const head = await file.slice(0, 4096).text();
    const line = head.split(/\r?\n/).slice(0, 20).find((l) => l.startsWith('# '));
    const title = line ? line.slice(2).trim() : path.split('/').pop().replace(MAP_RE, '');
    titles.set(path, { key, title });
    return title;
  }
  async function walk(dir, prefix, out) {
    for await (const entry of dir.values()) {
      if (hidden(entry.name)) continue;
      if (entry.kind === 'directory') await walk(entry, `${prefix}${entry.name}/`, out);
      else if (MAP_RE.test(entry.name)) out.push({ path: prefix + entry.name, entry });
    }
  }
  async function fileAt(path) {
    const parts = String(path).split('/');
    if (!MAP_RE.test(path) || parts.some((p) => !p || p === '..' || hidden(p))) throw new Error(`No map "${path}".`);
    try {
      let dir = handle;
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
      return await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
    } catch (_) {
      throw new Error(`No map "${path}".`);
    }
  }
  const source = {
    kind: 'folder',
    identity: () => identity ||= folderIdentity(handle),
    name: handle.name,
    capabilities: { shutdown: false, openExternal: false },
    async list() {
      const found = [];
      await walk(handle, '', found);
      found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      const maps = [];
      for (const { path, entry } of found) {
        const file = await entry.getFile();
        maps.push({ path, title: await titleOf(path, file), mtime: file.lastModified / 1000, size: file.size });
      }
      const state = hashString(maps.map((m) => `${m.path}|${m.mtime}|${m.size}`).join('\n'));
      return { state, maps };
    },
    async read(path) {
      return (await fileAt(path)).text();
    },
    watch(fn) {
      let last = null;
      let busy = false;
      const poll = async () => {
        if (busy) return;
        busy = true;
        try {
          const { state } = await source.list();
          if (last !== null && state !== last) fn({ state });
          last = state;
        } catch (_) { /* folder gone or permission dropped: try again next time */ }
        busy = false;
      };
      poll();
      const timer = setInterval(poll, POLL_MS);
      return () => clearInterval(timer);
    },
  };
  return source;
}

// 64-bit FNV-1a as hex: a short fingerprint of the folder's listing.
function hashString(s) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(s.charCodeAt(i))) * 0x100000001b3n);
  return h.toString(16).padStart(16, '0');
}

// ---------- remembering the picked folder ----------
// The handle is kept in IndexedDB (it cannot go in localStorage). Browsers ask the
// person again before reading it in a new visit; that needs a click.

const DB = 'avagahana-atlas';
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('handles');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('handles', mode);
      let req;
      try { req = fn(tx.objectStore('handles')); } catch (error) {
        open.result.close();
        reject(error);
        return;
      }
      tx.onabort = () => { open.result.close(); reject(tx.error || new Error('Storage transaction aborted')); };
      tx.oncomplete = () => { open.result.close(); resolve(req.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}

export const canPickFolder = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

// Ask the person for a folder (must run inside a click). Returns the handle, remembered.
export async function pickFolder() {
  const handle = await window.showDirectoryPicker({ id: 'avagahana-maps', mode: 'read' });
  try { await idb('readwrite', (s) => s.put(handle, 'folder')); } catch (_) { /* not remembered; still usable */ }
  return handle;
}

// The folder picked last time: {handle, granted}, or null. When not granted,
// call allowFolder(handle) from a click.
export async function rememberedFolder() {
  try {
    const handle = await idb('readonly', (s) => s.get('folder'));
    if (!handle) return null;
    return { handle, granted: (await handle.queryPermission({ mode: 'read' })) === 'granted' };
  } catch (_) {
    return null;
  }
}

export async function allowFolder(handle) {
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

// Keep folder identity separate from its name: unrelated folders may share a name.
let identityQueue = Promise.resolve();
function folderIdentity(handle) {
  const identify = async () => {
    try {
      const entries = await idb('readonly', (s) => s.get('identities')) || [];
      for (const entry of entries) if (await handle.isSameEntry(entry.handle)) return entry.id;
      const id = crypto.randomUUID();
      entries.push({ handle, id });
      await idb('readwrite', (s) => s.put(entries, 'identities'));
      return id;
    } catch (_) {
      // Storage blocked: isolate this visit rather than compare unrelated folders.
      return crypto.randomUUID();
    }
  };
  const result = identityQueue.then(identify);
  identityQueue = result.catch(() => {});
  return result;
}
