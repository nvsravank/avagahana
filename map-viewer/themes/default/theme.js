// The built-in theme, as a plain theme object like any host theme.
// It supplies colours, never their meaning: the diagram picks the palette
// (a mind map colours by branch with `category`, or by level with `level`).
//   category: 13 colours, warm and cool alternating so neighbours stand apart
//   level:    the blue family, centre first, then each level down: six steps, each
//             lighter (darker in dark mode) so they read as an order; deeper levels
//             reuse the last
// Every colour is at least 3:1 on its background.
// frame: the atlas bar in the Avagahana website's colours (its ground, ink, muted and
// olive accent; chip edges darkened to 3:1), text 4.5:1 or more.
// Font: Atkinson Hyperlegible Next (OFL, fonts/OFL.txt). Its bytes load only
// when this theme is first used.

const face = (file, weight, style) => ({
  weight,
  style,
  data: () => fetch(new URL(`fonts/AtkinsonHyperlegibleNext-${file}.woff2`, import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.arrayBuffer();
  }),
});

export default {
  id: 'default',
  label: 'Avagahana',
  font: {
    family: 'Atkinson Hyperlegible Next',
    faces: [
      face('Regular', 400, 'normal'),
      face('Italic', 400, 'italic'),
      face('SemiBold', 600, 'normal'),
      face('SemiBoldItalic', 600, 'italic'),
      face('Bold', 700, 'normal'),
      face('BoldItalic', 700, 'italic'),
    ],
  },
  appearances: {
    light: {
      bg: '#ffffff',
      ink: '#1f2933',
      muted: '#5f6b76',
      accent: '#1971c2',
      center: '#1f2933',
      centerInk: '#ffffff',
      tint: 12,
      // green, red, indigo, gold, teal, raspberry, olive, orange, violet, brown, blue, purple, slate
      category: ['#2b8a3e', '#c92a2a', '#3b5bdb', '#9c6f00', '#0b7285', '#c2255c', '#5c7f0d',
        '#e8590c', '#6741d9', '#a0522d', '#1971c2', '#ae3ec9', '#6b7280'],
      // deep navy, navy, cobalt, royal blue, sky, cyan
      level: ['#172554', '#1e3a8a', '#1d4ed8', '#2563eb', '#0284c7', '#0891b2'],
      roles: { good: '#2f9e44', warn: '#cc7a00', bad: '#e03131', info: '#1971c2', highlight: '#cc7a00', link: '#d9480f', idle: '#eef0f2', idleLine: '#b8bfc7', call: '#1971c2', reply: '#c2255c' },
      chrome: {
        bg: 'rgba(255, 255, 255, 0.88)', border: '#e3e7eb', hover: '#f1f3f5',
        active: '#1f2933', activeInk: '#ffffff', shadow: '0 2px 10px rgba(16, 24, 40, 0.10)',
      },
      frame: { bg: '#ffffff', ink: '#2a2320', muted: '#7a6d64', accent: '#5f7b00', chip: '#ffffff', chipEdge: '#9a8d84', chipInk: '#7a6d64', chipActive: '#f7f3ee', chipActiveInk: '#2a2320' },
      icons: { red: '#e03131', orange: '#e8590c', yellow: '#cc7a00', green: '#2f9e44', blue: '#1971c2', purple: '#9c36b5', grey: '#868e96' },
    },
    dark: {
      bg: '#16191d',
      ink: '#eef1f4',
      muted: '#a7b0ba',
      accent: '#74c0fc',
      center: '#eef1f4',
      centerInk: '#16191d',
      tint: 25,
      category: ['#69db7c', '#ff6b6b', '#91a7ff', '#ffd43b', '#66d9e8', '#f783ac', '#a9e34b',
        '#ffa94d', '#b197fc', '#d9a877', '#74c0fc', '#e599f7', '#ced4da'],
      // ice, pale blue, light blue, sky, cornflower, royal blue
      level: ['#e0ecff', '#bfd7ff', '#93c5fd', '#38bdf8', '#60a5fa', '#3b82f6'],
      roles: { good: '#69db7c', warn: '#ffd43b', bad: '#ff6b6b', info: '#74c0fc', highlight: '#ffd43b', link: '#ff8a65', idle: '#262b31', idleLine: '#4a525c', call: '#74c0fc', reply: '#f783ac' },
      chrome: {
        bg: 'rgba(30, 34, 40, 0.88)', border: '#2c323a', hover: '#2c323a',
        active: '#dbe8ff', activeInk: '#16191d', shadow: '0 2px 12px rgba(0, 0, 0, 0.35)',
      },
      frame: { bg: '#1e1714', ink: '#f2e8dd', muted: '#a3958a', accent: '#a9be5e', chip: '#1e1714', chipEdge: '#76675e', chipInk: '#a3958a', chipActive: '#271e1a', chipActiveInk: '#f2e8dd' },
      icons: { red: '#ff6b6b', orange: '#ff922b', yellow: '#ffd43b', green: '#69db7c', blue: '#74c0fc', purple: '#da77f2', grey: '#adb5bd' },
    },
  },
};
