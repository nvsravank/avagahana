# Avagahana

Clear diagrams for AI agents. An agent writes a map as plain text; a person reads it
as an interactive diagram. Text in, never images, so it is a cheap channel for an
agent to explain visually.

Avagahana (Telugu: అవగాహన): understanding, comprehension, awareness.

## Components

Each part works alone and is tested alone.

| Folder | What it is | Runs alone as |
|---|---|---|
| `map-viewer/` | Embeddable, read-only map viewer. Plain ES modules. | `import { mount } from './map-viewer/index.js'` in any page; no server needed. |
| `atlas/` | The first page: lists maps from a source, hosts the viewer, owns the URL. | Open `atlas/index.html` and pick a folder (Chromium), or let the server serve it. |
| `relay-server/` | Optional local server, Python 3.9+ standard library. Serves maps and pushes updates. | `python3 relay-server/serve_maps.py --maps-dir <folder>` |

Also here: `format/` (the map format and checker), `skills/` (the shared agent
skills: `illuminate-concept`, and `trace-architecture` for a whole project or repository),
`examples/` (sample maps and an embed example), and `docs/` (the contracts).
The repository itself is the plugin: one copy of each component, no build step.

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

## Contracts

- [Map viewer API](docs/map-viewer-api.md)
- [Map source](docs/map-source.md)
- [Relay server HTTP API](docs/relay-server-api.md)
- [Map format](docs/map-format.md)

## Rules

- No build step. Standard library only for Python.
- `scripts/check.sh` before every commit: dependency rule between parts, clean check.

## Validation

Run `bash scripts/validate.sh` for dependency, format, plugin, relay and browser
checks. Chrome, Chromium or Edge is required; set `AVAGAHANA_CHROME` to its
executable when not discovered automatically. CI runs this command on pushes and
pull requests. `scripts/check.sh` remains the lightweight pre-commit check.

## Licence

MIT. See `LICENSE`.
