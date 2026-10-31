// pack.html's script: window.packWith(request) mounts the viewer on one map, as a host
// would, and resolves to viewer.snapshot(). request: {text, path, state, prefs, before,
// since, sinceLabel, version, asOf, theme (a theme object whose font faces name a file
// beside this page as fontUrl), act (a setState call after the load)}.
import { mount } from '../index.js';

window.packWith = async (req) => {
  const el = document.getElementById('m');
  const theme = req.theme && {
    ...req.theme,
    font: req.theme.font && { family: req.theme.font.family, faces: req.theme.font.faces.map((f) => ({ weight: f.weight, style: f.style, data: () => fetch(new URL(f.fontUrl, location.href)).then((r) => r.arrayBuffer()) })) },
  };
  const opts = { storageKey: null };
  for (const k of ['state', 'prefs', 'before', 'since', 'sinceLabel', 'version', 'asOf']) if (req[k] != null) opts[k] = req[k];
  if (theme) Object.assign(opts, { themes: [theme], theme: theme.id });
  const v = mount(el, opts);
  await v.load(req.text, req.path);
  if (req.act) await v.setState(req.act);
  await new Promise((r) => setTimeout(r, 300));
  try { return await v.snapshot(); } finally { v.destroy(); }
};
window.packReady = true;
