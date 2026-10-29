// Exercise the actual atlas app with controlled API delays in an isolated frame.
export async function navigationTests(check) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:800px;height:500px;position:absolute;left:-10000px';
  document.body.append(frame);
  const w = frame.contentWindow;
  const atlas = new URL('../', import.meta.url);
  const until = async (fn) => {
    for (let i = 0; i < 500; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Atlas navigation test timed out');
  };
  let version = 1, treeEvent, deferPath = null, releaseRead = null;
  const reads = [];
  const text = (name) => `# ${name}\n\n\`\`\`mermaid\nmindmap\n  root((${name}))\n\`\`\`\n`;
  try {
    w.document.open();
    w.document.write(`<base href="${atlas.href}"><title>Starting</title><div id="app" style="height:400px"></div><div id="screen" hidden></div>`);
    w.document.close();
    w.history.replaceState(null, '', new URL('index.html#/a.md', atlas));
    const realFetch = w.fetch.bind(w);
    w.fetch = async (input, ...args) => {
      const url = new URL(input, atlas);
      const json = (data) => new w.Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname.endsWith('/api/info')) return json({ capabilities: ['tree', 'map', 'events'], sourceId: 'navigation-test' });
      if (url.pathname.endsWith('/api/tree')) return json({ state: String(version), maps: ['a', 'b'].map((id) => ({ path: `${id}.md`, title: id.toUpperCase(), mtime: version, size: 1 })) });
      if (url.pathname.endsWith('/api/map')) {
        const path = url.searchParams.get('p');
        reads.push(path);
        if (path === deferPath) {
          deferPath = null;
          return new Promise((resolve) => { releaseRead = () => resolve(new w.Response(text(path[0].toUpperCase()))); });
        }
        return new w.Response(text(path[0].toUpperCase()));
      }
      return realFetch(input, ...args);
    };
    w.EventSource = class {
      addEventListener(name, fn) { if (name === 'tree') treeEvent = fn; }
      close() {}
    };
    const script = w.document.createElement('script');
    script.type = 'module';
    script.src = new URL('app.js', atlas).href;
    w.document.head.append(script);
    await until(() => w.document.title === 'A · Avagahana' && treeEvent);

    deferPath = 'a.md';
    version++;
    treeEvent({ data: JSON.stringify({ state: String(version) }) });
    await until(() => releaseRead);
    w.location.hash = '#/b.md';
    await until(() => w.document.title === 'B · Avagahana');
    releaseRead();
    releaseRead = null;
    await new Promise((r) => setTimeout(r, 100));
    check('atlas: delayed reload cannot overwrite navigation', w.document.title === 'B · Avagahana' && w.location.hash.includes('/b.md'));

    deferPath = 'a.md';
    w.location.hash = '#/a.md';
    await until(() => releaseRead);
    const before = reads.length;
    version++;
    treeEvent({ data: JSON.stringify({ state: String(version) }) });
    await new Promise((r) => setTimeout(r, 100));
    check('atlas: reload cannot supersede pending navigation', reads.length === before);
    releaseRead();
    releaseRead = null;
    await until(() => w.document.title === 'A · Avagahana');
    check('atlas: pending navigation completes after tree event', w.location.hash.includes('/a.md'));
  } finally {
    releaseRead?.();
    frame.remove();
  }
}
