// render.js — the agent's render, answered by this page (WO-32).
//
// The relay sends a `render` event; one open page claims it (the focused page at once,
// others after a moment), draws the map in a second, hidden viewer mounted with the
// state asked for, exports it, posts the file back and destroys that viewer. The
// reader's own viewer, its diagram, camera and marks, never move.
import { mount } from '../map-viewer/index.js';

const UNFOCUSED_WAIT_MS = 600;   // a page in the background lets the focused one answer first
const SIZE = { w: 1200, h: 800 };   // the hidden viewer's box: the layout does not depend on it

const toBase64 = async (blob) => {
  const u = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
};

// req: the event's data; source: the relay source (read, claimRender, answerRender);
// themeSet: {themes, settings} the page's viewer was given; wait: how long a page
// without focus lets a focused one claim first
export async function answerRender(req, { source, themeSet, wait = UNFOCUSED_WAIT_MS }) {
  if (!document.hasFocus() && wait) await new Promise((r) => setTimeout(r, wait));
  if (!(await source.claimRender(req.id))) return;   // another page has it
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // drawn but out of sight: a hidden (display: none) element cannot be measured
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: `${SIZE.w}px`, height: `${SIZE.h}px`, visibility: 'hidden', pointerEvents: 'none' });
  document.body.appendChild(host);
  let v = null;
  try {
    const text = await source.read(req.path);
    const st = req.state || {};
    v = mount(host, {
      storageKey: null, marks: false, showProblems: 'none',
      themes: themeSet?.themes || [], defaultTheme: themeSet?.settings?.builtIn !== false,
      theme: req.theme || themeSet?.settings?.default || undefined,
      prefs: { ...(req.theme ? { theme: req.theme } : {}), ...(req.appearance ? { appearance: req.appearance } : {}), ...(st.colourBy ? { colourBy: st.colourBy } : {}) },
      state: st,
      // an earlier version: the picture marks what differs (WO-34)
      ...(req.before != null ? { before: req.before } : {}),
    });
    await v.ready;
    await v.load(text, req.path);
    if (!v.title) throw new Error(v.problems.find((p) => p.level === 'error')?.message || 'The map could not be read.');
    // a sequence's step lights once the player has drawn it (a timer: a page in the
    // background gets no animation frames)
    if (st.seq) await new Promise((r) => setTimeout(r, 60));
    const out = await v.export({ format: req.format, width: req.width, scale: req.scale, background: req.background, report: req.report, crop: st.crop });
    // a sequence's number of steps, so the agent can ask for each (render.py --steps)
    const steps = st.seq ? v.contents().find((c) => c.state?.seq === st.seq)?.steps ?? null : null;
    await source.answerRender(req.id, {
      format: out.format,
      encoding: out.format === 'png' ? 'base64' : 'utf-8',
      data: out.format === 'png' ? await toBase64(out.data) : out.data,
      width: out.width, height: out.height, scaledDown: out.scaledDown,
      ...(out.report ? { report: out.report } : {}),
      ...(steps != null ? { steps } : {}),
      // what the agent should hear: a theme that is not here (the default was used)
      problems: v.problems.filter((p) => p.code === 'theme-unknown' || p.code === 'theme-built-in-used').map((p) => p.message),
    });
  } catch (x) {
    await source.answerRender(req.id, { error: x?.message || String(x) }).catch(() => {});
  } finally {
    v?.destroy();
    host.remove();
  }
}
