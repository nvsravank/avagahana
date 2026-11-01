<p align="center">
  <a href="https://www.youtube.com/watch?v=bNGapwE9Y4M">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/hero-video-dark.png">
      <img alt="Watch the Avagahana launch video on YouTube. The still shows a cloud architecture drawn by Avagahana: an operator calls an API gateway and a function, which hand jobs to a server inside a private network; a queue feeds three workers, and results go to analytics and an audit log." src="https://sravannerella.com/avagahana/readme/hero-video-light.png">
    </picture>
  </a>
</p>

# Avagahana

**See how it all connects.**

Your agent writes a map in plain Markdown. You read it as a diagram you can explore,
at your own pace. Avagahana (Telugu: అవగాహన) means understanding.

[Watch the video](https://www.youtube.com/watch?v=bNGapwE9Y4M) ·
[Read the article](https://medium.com/@nvsravank/your-agent-knows-the-code-now-you-can-see-the-picture-28357fd11261) ·
[Gallery](https://sravannerella.com/avagahana/gallery/) ·
[Install](#install) ·
[Map format](docs/map-format.md) ·
[Viewer API](docs/map-viewer-api.md)

## Let the agent draw

Ask your agent to explain something. It writes a map in Markdown and Mermaid, text it
already knows, never an image. You see the picture, and it redraws as the file changes.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/let-the-agent-draw-dark.png">
  <img alt="On the left, the Markdown of a small map: a title, a sentence, and a Mermaid flowchart of two readers, a product service, a cache and a database. On the right, the diagram it becomes." src="https://sravannerella.com/avagahana/readme/let-the-agent-draw-light.png">
</picture>

Two skills come with it: `illuminate-concept` for one idea, `trace-architecture` for a
whole repository. A strict checker finds the mistakes in a map before you open it.

## See the whole

Begin with the whole system, then open it one level at a time: its parts, then
everything inside. Or read the same map as an outline, by keyboard or screen reader.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/see-the-whole-levels-dark.png">
  <img alt="The same shop at three levels. First the system as one closed box between a customer and a card provider; then its parts: web app, API, orders service, payments and the orders database; then everything inside each of them." src="https://sravannerella.com/avagahana/readme/see-the-whole-levels-light.png">
</picture>

## Go one level deeper

Step into one box and the world around it stays in view, faded. Every part has a page
of its own: what it connects to, the views it appears in, where it runs in each
environment.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/go-one-level-deeper-dark.png">
  <img alt="The page of an order handler: what calls it and what it calls, small pictures of the three views it appears in, and the two environments it runs on." src="https://sravannerella.com/avagahana/readme/go-one-level-deeper-light.png">
</picture>

## Watch it move

A sequence plays on the diagram it happens in, one message at a time. Here two
readers miss the same cache entry at the same moment, and the database is asked
twice.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/watch-it-move-dark.png">
  <img alt="Four moments of a sequence on the same small diagram: two readers ask the product service; the cache misses for both; both go to the database; both get the row, twice." src="https://sravannerella.com/avagahana/readme/watch-it-move-light.png">
</picture>

[See it play](https://sravannerella.com/avagahana/gallery/?map=cache-miss&seq=when-many-miss-at-once),
then the quieter way: one reader rebuilds, the others wait.

## Know what to trust

Not everything an agent explains is equally certain. Each box and arrow can say how
sure it is: verified, inferred, a hypothesis, or unsourced.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/know-what-to-trust-dark.png">
  <img alt="A shop system under investigation. Small marks on boxes and arrows say which parts were seen in a trace, which were reasoned, which are guesses, and which are hearsay." src="https://sravannerella.com/avagahana/readme/know-what-to-trust-light.png">
</picture>

## Notice what changed

Come back to a map and a small button says what changed since you last looked, for
you alone. A planned change marks what is added, changed and removed; Before and
After lays two versions on the same picture.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/notice-what-changed-dark.png">
  <img alt="A checkout platform with ringed plus and tilde signs on the parts a release adds or changes." src="https://sravannerella.com/avagahana/readme/notice-what-changed-light.png">
</picture>

## Follow a thing through its life

Walk an order through its states, one step at a time. Walk a query through its tables,
with a warning where a join multiplies rows.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/follow-a-thing-through-its-life-dark.png">
  <img alt="The states of an order, from awaiting payment through charging to retrying, lit step by step while the rest of the diagram waits in grey." src="https://sravannerella.com/avagahana/readme/follow-a-thing-through-its-life-light.png">
</picture>

## Make it yours

Two colours and a font become a theme, in light and dark. Any view renders to SVG or
PNG for a document or a slide.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/make-it-yours-dark.png">
  <img alt="The same diagram twice: above in the built-in theme, below in a brand theme with its own colours and a serif font." src="https://sravannerella.com/avagahana/readme/make-it-yours-light.png">
</picture>

## Carry it with you

Pack a map into one HTML file, the viewer inside it. It opens anywhere, with no server
and no network.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://sravannerella.com/avagahana/readme/carry-it-with-you-dark.png">
  <img alt="A map opened from a single file, with its toolbar and a quiet footer: Built with Avagahana." src="https://sravannerella.com/avagahana/readme/carry-it-with-you-light.png">
</picture>

*Avagahana is a reader by design: a map changes when its text changes. There is no
MCP server, and no comments or shared editing.*

## Install

Python 3.9+ is required.

### Claude Code

```
/plugin marketplace add nvsravank/avagahana
/plugin install avagahana@avagahana
```

For a local test, add the checkout path instead of the GitHub name, or start
`claude --plugin-dir /absolute/path/to/avagahana/repo`.

### Codex

```
codex plugin marketplace add nvsravank/avagahana
codex plugin add avagahana@avagahana
```

For a local test, replace `nvsravank/avagahana` with the absolute checkout path.
You can also install from the Avagahana source in the app's plugin browser.
Start a new chat after installation. Remove an old Sphuta installation to avoid
loading both skills.

### Maps folder (shared by both clients)

On first use, the skill asks for an existing maps folder and saves its absolute path
in `~/.config/avagahana/maps-dir`. To set or change it yourself:

```sh
mkdir -p ~/.config/avagahana
printf '%s\n' '/absolute/path/to/maps' > ~/.config/avagahana/maps-dir
```

`AVAGAHANA_MAP_DIR`, when present in the agent's command environment, overrides that
file. No maps are stored in the plugin or moved during installation. Standalone
relay commands still accept `--maps-dir` or `AVAGAHANA_MAP_DIR`.

See [docs/deploy-targets.md](docs/deploy-targets.md) for the package layout.

## Components

Each part works alone and is tested alone.

| Folder | What it is | Runs alone as |
|---|---|---|
| `map-viewer/` | Embeddable, read-only map viewer. Plain ES modules. | `import { mount } from './map-viewer/index.js'` in any page; no server needed. |
| `atlas/` | The first page: lists maps from a source, hosts the viewer, owns the URL. | Open `atlas/index.html` and pick a folder (Chromium), or let the server serve it. |
| `relay-server/` | Optional local server, Python 3.9+ standard library. Serves maps and pushes updates. | `python3 relay-server/serve_maps.py --maps-dir <folder>` |

Also here: `format/` (the map format and checker), `skills/` (the shared agent
skills), `examples/` (sample maps and an embed example), and `docs/` (the contracts).
The repository itself is the plugin: one copy of each component, no build step.

## Contracts

- [Map viewer API](docs/map-viewer-api.md)
- [Map source](docs/map-source.md)
- [Relay server HTTP API](docs/relay-server-api.md)
- [Map format](docs/map-format.md)

## Validation

Run `bash scripts/validate.sh` for dependency, format, plugin, relay and browser
checks. Chrome, Chromium or Edge is required; set `AVAGAHANA_CHROME` to its
executable when not discovered automatically. CI runs this command on pushes and
pull requests. `scripts/check.sh` is the lightweight pre-commit check: the dependency
rule between parts, and the clean check. No build step; standard library only for
Python.

## Licence

MIT. See `LICENSE`.
