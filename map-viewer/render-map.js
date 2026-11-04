// Isolated rendering lifecycle shared by the public renderer and reading export.
// The mount factory is injected to keep the snapshot module graph acyclic.
export async function renderWith(mount, request, options = {}) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: '1200px', height: '800px', visibility: 'hidden', pointerEvents: 'none' });
  document.body.append(host);
  let viewer;
  try {
    const state = request.state || {};
    viewer = mount(host, { ...options, host: undefined, storageKey: null, marks: false, showProblems: 'none', state, ...(request.before != null ? { before: request.before } : {}) });
    await viewer.ready;
    await viewer.load(request.text, request.path || null);
    if (!viewer.title) throw new Error(viewer.problems.find((p) => p.level === 'error')?.message || 'The map could not be read.');
    // load() resolves model/assets and export() synchronously redraws the final
    // scene before cloning it, including player decoration. No guessed timer.
    const out = await viewer.export({ format: request.format, width: request.width, scale: request.scale, background: request.background, report: request.report, crop: state.crop });
    const steps = state.seq ? viewer.contents().find((c) => c.state?.seq === state.seq)?.steps ?? null : null;
    return { ...out, ...(steps != null ? { steps } : {}), problems: viewer.problems.filter((p) => p.code === 'theme-unknown' || p.code === 'theme-built-in-used').map((p) => p.message) };
  } finally {
    viewer?.destroy();
    host.remove();
  }
}
