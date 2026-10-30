// themes.js — the maps folder's own themes (WO-32): `<maps folder>/.themes/`.
//
//   .themes/<id>.json     a theme: the viewer's theme object, plus name and description;
//                         font: {family, faces: [{weight, style, file}]} or {family, file},
//                         each file beside it in .themes/
//   .themes/settings.json {builtIn: true, default: "<id>", logo: true}
//
// Served by the relay (GET /api/themes, font files from /api/theme-file), or read from a
// folder the person opened. Either way the atlas hands the viewer theme objects whose
// font faces load their bytes on demand; the viewer checks them.

const THEME_ID = /^[A-Za-z0-9][\w-]{0,63}$/;
const FONT_FILE = /^[^/\\.][^/\\]*\.(woff2|woff|ttf|otf)$/i;
export const DEFAULT_SETTINGS = { builtIn: true, default: null, logo: true };

// raw: {themes, settings, problems}, each theme's faces with {url} or {file};
// bytes(face) -> Promise<ArrayBuffer>. -> {themes, settings, problems} for mount().
export function viewerThemes(raw, bytes) {
  const settings = { ...DEFAULT_SETTINGS, ...(raw?.settings || {}) };
  const themes = (raw?.themes || []).map((t) => {
    const faces = t.font?.faces || [];
    const font = faces.length ? { family: t.font.family || t.id, faces: faces.map((f) => ({ weight: f.weight ?? 400, style: f.style || 'normal', data: () => bytes(f) })) } : undefined;
    return { ...t, label: t.label || t.name || t.id, font };
  });
  return { themes, settings, problems: raw?.problems || [] };
}

// From the relay: GET api/themes; faces carry a URL beside the page.
export async function serverThemes(base, fetchFn = fetch) {
  try {
    const res = await fetchFn(new URL('api/themes', base), { cache: 'no-store' });
    if (!res.ok) return null;
    return viewerThemes(await res.json(), (f) => fetchFn(new URL(f.url, base)).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    }));
  } catch (_) {
    return null;
  }
}

// From a folder the person opened (File System Access API): the same files, read here.
export async function folderThemes(handle) {
  let dir;
  try { dir = await handle.getDirectoryHandle('.themes'); } catch (_) { return null; }
  const problems = [];
  const raw = { themes: [], settings: {}, problems };
  const read = async (name) => (await (await dir.getFileHandle(name)).getFile()).text();
  try {
    const got = JSON.parse(await read('settings.json'));
    if (got && typeof got === 'object') {
      for (const k of ['builtIn', 'logo']) if (typeof got[k] === 'boolean') raw.settings[k] = got[k];
      if (typeof got.default === 'string' && THEME_ID.test(got.default)) raw.settings.default = got.default;
    }
  } catch (x) {
    if (x?.name !== 'NotFoundError') problems.push({ level: 'warning', code: 'themes-settings', message: `.themes/settings.json could not be read (${x.message || x}); defaults used.` });
  }
  const names = [];
  for await (const entry of dir.values()) if (entry.kind === 'file' && entry.name.endsWith('.json') && entry.name !== 'settings.json') names.push(entry.name);
  for (const name of names.sort()) {
    const id = name.slice(0, -5);
    if (!THEME_ID.test(id)) { problems.push({ level: 'warning', code: 'theme-file-name', message: `.themes/${name}: a theme file is named by its id.` }); continue; }
    let obj;
    try { obj = JSON.parse(await read(name)); } catch (x) {
      problems.push({ level: 'error', code: 'theme-file', message: `.themes/${name} could not be read (${x.message || x}).` });
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    obj.id = id;
    if (obj.font && typeof obj.font === 'object') {
      const faces = Array.isArray(obj.font.faces) ? obj.font.faces : [{ file: obj.font.file, weight: 400, style: 'normal' }];
      const ok = faces.filter((f) => typeof f?.file === 'string' && FONT_FILE.test(f.file));
      if (ok.length < faces.length) problems.push({ level: 'warning', code: 'theme-font-file', message: `.themes/${name}: a font file must be a .woff2, .woff, .ttf or .otf file in .themes/.` });
      obj.font = ok.length ? { family: obj.font.family || id, faces: ok } : null;
    }
    raw.themes.push(obj);
  }
  return viewerThemes(raw, async (f) => (await (await dir.getFileHandle(f.file)).getFile()).arrayBuffer());
}
