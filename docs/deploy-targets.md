# Plugin installation

The repository root is the plugin root for both Claude Code and Codex. Each client
installs the complete repository; the skill, server, checker, viewer and atlas exist
only once. There is no deployment bundle or generation step.

```
.claude-plugin/plugin.json          Claude metadata
.claude-plugin/marketplace.json     Claude catalog, source ./
.codex-plugin/plugin.json           Codex metadata, skills ./skills/
.agents/plugins/marketplace.json    Codex catalog, source ./
skills/map/SKILL.md                 shared skill, no client substitutions
skills/map/references/              diagram-specific guides
docs/map-format.md                 full format reference, no copied version
relay-server/  map-viewer/  atlas/  format/   shared runtime components
```

## Paths and configuration

The agent resolves the plugin root from the installed skill's absolute path:
`skills/map/SKILL.md` is two directories below that root. Commands use absolute paths
to bundled scripts, independent of the agent's current working directory. References
in the skill and diagram guides are relative to their respective Markdown files.

The shared skill reads `AVAGAHANA_MAP_DIR` from its command environment, otherwise
`~/.config/avagahana/maps-dir` (one absolute path, plain text). On first use, if neither
is set, it asks for an existing maps folder and saves the path in that settings file.
This file is outside the plugin and survives reinstalls. Nothing writes to the plugin
cache. No Claude `userConfig` or client-specific substitution is used.

This file is a skill setting, not a relay setting. When launching the relay directly,
pass `--maps-dir` or set `AVAGAHANA_MAP_DIR` as before.

## Install and test

See the README for commands for each client, including installation from a local
checkout before publishing. GitHub installs fetch the public repository; no
credentials are needed. After reinstalling, start a new chat, request a map, and verify write,
check, show, point, and live reload. Existing Sphuta installations should be removed
so the old and new skills do not compete.

`scripts/check.sh` checks the root manifests and catalogs, shared skill location,
map samples, and component dependencies. If the Claude CLI is installed it also
validates the root plugin. No rebuild or synchronization of copied files is needed.
