// snapshot.js — the start-up script of a snapshot (relay-server/pack.py), not a module
// the viewer imports. pack.py puts it inline, after the packed data; the page's security
// policy allows it by its hash, and blob: modules, and nothing else.
// It turns the packed modules into blob: URLs, deepest first, each module's URL put in
// place of its token in the modules that import it (a blob: URL is no base for './x.js',
// and an import map made here would be an inline script the policy blocks), then mounts
// the viewer with the packed files as its assets.
// The footer's time (when the map was saved, or packed) in the reader's own time zone and language.
for (const el of document.querySelectorAll('footer time[datetime]')) {
  const d = new Date(el.dateTime);
  if (!Number.isNaN(d.getTime())) el.textContent = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
const data = JSON.parse(document.getElementById('avagahana-data').textContent);
try {
  const urls = {};
  for (const p of data.order) {
    const text = data.modules[p].replace(/@@avagahana-module:([^@]+)@@/g, (_, d) => urls[d]);
    urls[p] = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  }
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const assets = (path) => (has(data.files, path) ? Promise.resolve(data.files[path]) : Promise.reject(new Error(`${path} is not in this snapshot`)));
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  const { mount } = await import(urls['index.js']);
  const t = data.theme === 'default' ? (await import(urls['themes/default/theme.js'])).default : data.theme;
  const faces = (t.font?.faces || []).map((f, i) => ({ weight: f.weight, style: f.style, data: () => Promise.resolve(bytes(data.fonts[i])) }));
  const theme = { ...t, font: faces.length ? { family: t.font.family, faces } : undefined };
  mount(document.getElementById('avagahana-map'), {
    ...data.options, assets, themes: [theme], theme: theme.id, defaultTheme: false, storageKey: null,
    crossMapNote: 'Not in this snapshot',
  });
} catch (x) {
  document.getElementById('avagahana-map').textContent = `This snapshot could not start: ${x?.message || x}`;
}
