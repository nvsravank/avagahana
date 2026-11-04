// render.js — the agent's render, answered by this page (WO-32).
//
// The relay sends a `render` event; one open page claims it (the focused page at once,
// others after a moment), draws the map in a second, hidden viewer mounted with the
// state asked for, exports it, posts the file back and destroys that viewer. The
// reader's own viewer, its diagram, camera and marks, never move.
import { renderMap } from '../map-viewer/index.js';

const UNFOCUSED_WAIT_MS = 600;   // a page in the background lets the focused one answer first

const toBase64 = async (blob) => {
  const u = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
};

// req: the event's data; source: the relay source (read, claimRender, answerRender);
// themeSet: {themes, settings} the page's viewer was given; wait: how long a page
// without focus lets a focused one claim first. The only page listening (req.pages)
// claims at once: a page in the background has its timers slowed, and an agent's
// trials (WO-37) would pay that on every render
export async function answerRender(req, { source, themeSet, wait = UNFOCUSED_WAIT_MS }) {
  if (!document.hasFocus() && wait && !(req.pages <= 1)) await new Promise((r) => setTimeout(r, wait));
  if (!(await source.claimRender(req.id))) return;   // another page has it
  try {
    // a draft (render.py --draft): text the agent sent, drawn in the map's place; the
    // path still names the map (WO-37)
    const draft = typeof req.text === 'string';
    const text = draft ? req.text : await source.read(req.path);
    const st = req.state || {};
    const out = await renderMap({ ...req, text }, {
      themes: themeSet?.themes || [], defaultTheme: themeSet?.settings?.builtIn !== false,
      theme: req.theme || themeSet?.settings?.default || undefined,
      prefs: { ...(typeof req.trustMarks === 'boolean' ? { trustMarks: req.trustMarks } : {}), ...(req.theme ? { theme: req.theme } : {}), ...(req.appearance ? { appearance: req.appearance } : {}), ...(req.look ? { look: req.look } : {}), ...(st.colourBy ? { colourBy: st.colourBy } : {}) },
    });
    await source.answerRender(req.id, {
      format: out.format,
      encoding: out.format === 'png' ? 'base64' : 'utf-8',
      data: out.format === 'png' ? await toBase64(out.data) : out.data,
      width: out.width, height: out.height, scaledDown: out.scaledDown,
      ...(out.report ? { report: out.report } : {}),
      ...(out.steps != null ? { steps: out.steps } : {}),
      // says it drew the draft, so render.py can tell an older page that read the file
      ...(draft ? { draft: true } : {}),
      // what the agent should hear: a theme that is not here (the default was used)
      problems: out.problems,
    });
  } catch (x) {
    await source.answerRender(req.id, { error: x?.message || String(x) }).catch(() => {});
  }
}
