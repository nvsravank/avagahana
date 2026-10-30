// WO-32 in the atlas: the maps folder's themes (themes.js) and the agent's render
// answered by this page in a hidden viewer (render.js).
import { viewerThemes, serverThemes, folderThemes } from '../themes.js';
import { answerRender } from '../render.js';
import { mount } from '../../map-viewer/index.js';

const THEME = { name: 'Brand', description: 'For reports', font: { family: 'Brand Sans', file: 'Brand.woff2' },
  appearances: { light: { bg: '#ffffff', ink: '#14213d', category: ['#0f766e', '#b45309'] } } };

// memoryFolder: test.js's in-memory folder handle
export async function renderThemeTests(check, memoryFolder) {
  // ---- themes ----
  const v0 = viewerThemes({ themes: [{ id: 'x', name: 'X', font: { family: 'F', faces: [{ url: 'api/theme-file?f=F.woff2' }] }, appearances: {} }] }, async (f) => f.url);
  check('themes: settings default to the built-in shown, no default, the logo shown', JSON.stringify(v0.settings) === JSON.stringify({ builtIn: true, default: null, logo: true }));
  check('themes: a name is the label; a face loads its bytes on demand', v0.themes[0].label === 'X' && typeof v0.themes[0].font.faces[0].data === 'function'
    && (await v0.themes[0].font.faces[0].data()) === 'api/theme-file?f=F.woff2' && v0.themes[0].font.faces[0].weight === 400);

  const served = await serverThemes(new URL('http://127.0.0.1:1/'), async (url) => {
    const u = String(url);
    if (u.endsWith('api/themes')) return new Response(JSON.stringify({ themes: [{ id: 'brand', ...THEME, font: { family: 'Brand Sans', faces: [{ weight: 400, style: 'normal', url: 'api/theme-file?f=Brand.woff2' }] } }], settings: { builtIn: false, default: 'brand', logo: false }, problems: [] }));
    if (u.endsWith('api/theme-file?f=Brand.woff2')) return new Response(new Uint8Array([1, 2, 3]));
    return new Response('', { status: 404 });
  });
  check('themes: from the relay, with its settings', served.themes[0].id === 'brand' && served.settings.builtIn === false && served.settings.logo === false);
  check('themes: a font face from the relay is fetched beside the page', (await served.themes[0].font.faces[0].data()).byteLength === 3);
  check('themes: no relay themes endpoint is no themes', (await serverThemes(new URL('http://127.0.0.1:1/'), async () => new Response('', { status: 404 }))) === null);

  const folder = memoryFolder('maps');
  check('themes: a folder with no .themes has none', (await folderThemes(folder)) === null);
  const dir = await folder.getDirectoryHandle('.themes', { create: true });
  const put = async (name, text) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
  await put('brand.json', JSON.stringify(THEME));
  await put('broken.json', '{');
  await put('Brand.woff2', 'font bytes');
  await put('settings.json', JSON.stringify({ builtIn: false, default: 'brand', logo: false }));
  const fromFolder = await folderThemes(folder);
  check('themes: from a folder: each <id>.json, its id from the file name', fromFolder.themes.map((t) => t.id).join() === 'brand' && fromFolder.themes[0].label === 'Brand');
  check('themes: from a folder: settings.json', fromFolder.settings.builtIn === false && fromFolder.settings.default === 'brand' && fromFolder.settings.logo === false);
  check('themes: from a folder: an unreadable theme is a problem', fromFolder.problems.some((p) => p.code === 'theme-file'));
  check('themes: from a folder: the font file is read from .themes', new TextDecoder().decode(await fromFolder.themes[0].font.faces[0].data()) === 'font bytes');

  // ---- render: a hidden viewer answers; the reader's viewer does not move ----
  const GARDEN = await fetch('../../examples/maps/garden.md').then((r) => r.text());
  const RACE = await fetch('../../examples/maps/job-race.md').then((r) => r.text());
  const box = document.createElement('div');
  box.style.cssText = 'width:700px;height:400px;position:absolute;left:-10000px';
  document.body.append(box);
  const reader = mount(box, { storageKey: null });
  await reader.load(GARDEN, 'garden.md');
  reader.setState({ focus: 'n2', node: 'n3' });
  const camera = () => box.querySelector('[data-mmv=viewport]').getAttribute('transform');
  const before = { state: JSON.stringify(reader.state), camera: camera(), kids: document.body.childElementCount };
  const answers = [];
  const source = (claim = true) => ({
    read: async (p) => (p === 'job-race.md' ? RACE : GARDEN),
    claimRender: async () => claim,
    answerRender: async (id, body) => { answers.push({ id, ...body }); return { ok: true }; },
  });
  await answerRender({ id: 'r1', path: 'garden.md', format: 'svg', state: { expand: 1, highlight: ['n2'] }, report: true, background: 'theme' }, { source: source(), themeSet: null, wait: 0 });
  const a = answers[0];
  check('render: the page answers with the file', a?.id === 'r1' && a.format === 'svg' && a.encoding === 'utf-8' && a.data.startsWith('<svg') && a.width > 0, JSON.stringify(a)?.slice(0, 200));
  check('render: the report comes with it when asked', Array.isArray(a?.report?.touching) && a.report.nodes > 1);
  check('render: the reader\'s viewer does not move', JSON.stringify(reader.state) === before.state && camera() === before.camera);
  check('render: the hidden viewer is gone afterwards', document.body.childElementCount === before.kids);
  await answerRender({ id: 'r2', path: 'garden.md', format: 'png', width: 400, state: {} }, { source: source(), themeSet: null, wait: 0 });
  check('render: a png answers as base64 at the width asked', answers[1]?.encoding === 'base64' && answers[1].width === 400 && atob(answers[1].data).startsWith('\x89PNG'));
  await answerRender({ id: 'r3', path: 'job-race.md', format: 'svg', state: { seq: 'main', step: 3 } }, { source: source(), themeSet: null, wait: 0 });
  check('render: a sequence step says how many steps there are', answers[2]?.steps === 8, JSON.stringify(answers[2]?.steps));
  await answerRender({ id: 'r4', path: 'garden.md', format: 'svg', theme: 'nope', state: {} }, { source: source(), themeSet: null, wait: 0 });
  check('render: an unknown theme falls back to the default, with a problem', answers[3]?.data && answers[3].problems.some((m) => m.includes('nope')));
  await answerRender({ id: 'r5', path: 'garden.md', format: 'svg', state: {} }, { source: source(false), themeSet: null, wait: 0 });
  check('render: a render another page claimed is left to it', answers.length === 4);
  await answerRender({ id: 'r6', path: 'garden.md', format: 'svg', theme: 'brand', state: {} }, { source: source(), themeSet: { themes: [{ id: 'brand', ...THEME, font: undefined }], settings: { builtIn: false, default: 'brand', logo: true } }, wait: 0 });
  check('render: the folder\'s theme is used', /rgb\(20, 33, 61\)/.test(answers[4]?.data || ''), answers[4]?.error);
  await answerRender({ id: 'r7', path: 'garden.md', format: 'svg', state: {} }, { source: { ...source(), read: async () => 'not a map at all' }, themeSet: null, wait: 0 });
  check('render: a map that cannot be drawn answers with the error', !!answers[5]?.error && !answers[5].data);
  reader.destroy();
  box.remove();
}
