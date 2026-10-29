// index.js — the map viewer's only public entry. See docs/map-viewer-api.md.
//
//   import { mount, applyTheme } from './map-viewer/index.js';
//   const viewer = mount(element, { text, path, host, state, theme, themes, prefs });
import { checkTheme, acquire, release, loadFont, registered } from './themes/theme.js';

export { mount } from './viewer.js';
export { checkTheme } from './themes/theme.js';

// Style a host's own element (e.g. atlas's panels) with a theme, so it matches
// the viewer: the element gets the theme's CSS variables (--mmv-*) and font.
// theme: a theme object, or the id of one a viewer has registered.
// Returns {ok, problems, release()}. The palettes are there as --mmv-cat-<n> and
// --mmv-lvl-<n> for a host that wants them.
export function applyTheme(element, theme, { appearance = 'auto' } = {}) {
  if (!(element instanceof Element)) throw new TypeError('applyTheme(element, theme): element must be a DOM element.');
  let t;
  let problems = [];
  if (typeof theme === 'string') {
    t = registered(theme);
    if (!t) return { ok: false, problems: [{ level: 'error', source: 'theme', code: 'theme-unknown', message: `No registered theme "${theme}".`, where: theme }], release() {} };
  } else {
    const r = checkTheme(theme);
    problems = r.problems;
    if (!r.ok) return { ok: false, problems, release() {} };
    t = r.theme;
  }
  const user = {};
  acquire(t, user);
  const media = matchMedia('(prefers-color-scheme: dark)');
  const apps = Object.keys(t.appearances);
  const set = () => {
    const a = apps.length === 1 ? apps[0] : appearance === 'auto' ? (media.matches ? 'dark' : 'light') : appearance;
    element.classList.add('mmv-themed');
    Object.assign(element.dataset, { theme: t.id, appearance: a });
  };
  set();
  if (appearance === 'auto') media.addEventListener('change', set);
  loadFont(t.id);
  return {
    ok: true,
    problems,
    release() {
      media.removeEventListener('change', set);
      element.classList.remove('mmv-themed');
      for (const k of ['theme', 'appearance']) delete element.dataset[k];
      release(t.id, user);
    },
  };
}
