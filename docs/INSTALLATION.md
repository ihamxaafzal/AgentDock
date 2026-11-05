# Install AgentDock

AgentDock has two modes:

- **Demo mode** shows a simulated team and sample room activity. It does not require Hermes and never runs real tasks.
- **Live mode** connects the local server to the Hermes profiles you configure.

## Requirements

- Windows 10 or 11 for `Start AgentDock.cmd`.
- Node.js 22 or newer and npm.
- Hermes Agent and a local API gateway for live mode.
- Google Chrome and your own Flow integration only if you configure image generation.

Install Hermes separately. AgentDock does not install models, create Hermes profiles, configure providers, or publish any user's profile setup. For current Windows instructions, use Hermes's [quickstart](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/quickstart.md) and [installation guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/installation.md).

## Install and run on Windows

1. Clone this repository or download and extract its ZIP.
2. Open PowerShell in the `AgentDock` folder.
3. Install the pinned dependencies and start the app:

   ```powershell
   npm.cmd ci
   npm.cmd start
   ```

   Or double-click `Start AgentDock.cmd`. The launcher checks for Node.js and installs the pinned dependency if it is missing.
4. Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

The server binds to loopback. Keep its terminal open while you use the app; press `Ctrl+C` to stop it. Set `PORT` in `.env` if another app already uses 4317.

## Configure live Hermes access

1. Create your own Hermes profiles and API gateway(s) by following [Hermes setup](HERMES_SETUP.md).
2. Copy the generic template to a private local file:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

3. Replace all profile IDs, Hermes profile names, URLs, and keys. Mark one profile with `nativeCoordinator: true`; add `reportsTo` and `capabilities` to workers.
4. Configure the coordinator's Hermes Profile routes allowlist to match the Hermes profile names you assigned.
5. Set the Hermes installation paths required for native coordination and artifact plugins.
6. Save `.env` and start or restart AgentDock.
7. In AgentDock, open the connection menu, connect locally, and enable task sending.
8. Send a small mission for one configured capability and confirm its task and worker assignment under **Tasks & results**.

`HERMES_AGENTS` takes precedence over the legacy single-profile `HERMES_API_URL` and `HERMES_API_KEY` settings. Never commit or share `.env` or a real profile API key.

## Repository configuration files

| Path | Purpose |
| --- | --- |
| `.env.example` | Generic starting template with placeholder profile names and keys |
| `.env` | Private local profile URLs, keys, and installation paths; ignored by Git |
| `agents/aether-documents/` | Optional document prompt extraction plugin |
| `agents/aether-scenes/` | Optional structured scene plugin |
| `data/` | Private mission records, uploaded copies, and runtime files; ignored by Git |

AgentDock does not include example Hermes profile prompts or a fixed team roster. Assign only the capabilities your profiles and tools support. The full capability list and JSON schema are in [Hermes setup](HERMES_SETUP.md).

## AgentDock environment settings

Copy `.env.example` to `.env` before changing values. Restart AgentDock after editing the file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4317` | Local web server port. |
| `HERMES_AGENTS` | Generic sample in `.env.example` | Profile IDs, names, API URLs, profile keys, coordinator assignment, worker relations, and capabilities. |
| `HERMES_API_URL` | `http://127.0.0.1:8642` | Legacy single-profile Hermes API base URL. |
| `HERMES_API_KEY` | Unset | Legacy single-profile bearer key. Keep private. |
| `HERMES_HOME` | Unset | Hermes data directory for native coordination and state lookup. |
| `HERMES_SOURCE_DIR` | Unset | Hermes source/runtime working directory used by the native CLI integration. |
| `HERMES_NATIVE_PYTHON` | Unset | Python executable for Hermes CLI, state reading, and scene result verification. |
| `HERMES_EXTRACTION_DIR` | Unset | Shared folder where Hermes document and scene tools save text artifacts. |
| `AETHER_DATA_DIR` | `<project>/data` | Optional private override for mission data, logs, and uploaded copies. |
| `AETHER_CONCURRENT_MISSIONS` | `5` | Initial mission limit; the Room Settings menu can change it from 1 to 256. |
| `AETHER_IMAGE_OUTPUT_DIR` | `~/Pictures/AgentDock` | Optional output folder for your Flow image workflow. |
| `AETHER_FLOW_CHROME_PROFILE` | `Default` | Chrome profile used by the optional Flow workflow. |
| `AETHER_FLOW_CHROME_EXECUTABLE` | Standard Chrome install path | Optional Chrome executable override. |

## Development and static demo build

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
```

`npm run build` creates `dist/`, a static demo build without the live Hermes bridge. Use `npm start` for live operation. `node_modules/`, `dist/`, `.env`, backups, and private data are excluded from Git.

## Troubleshooting

- **The page does not load:** confirm the server terminal is running and open `http://127.0.0.1:4317`. Change `PORT` if the port is occupied.
- **Hermes does not connect:** verify the gateway URL, API server status, profile-specific API key, and `/v1/models` response.
- **A profile is missing:** check its unique `id`, actual Hermes `profile`, URL, key, and local gateway route in `HERMES_AGENTS`, then restart AgentDock.
- **A workflow reports a missing capability:** add the required capability to exactly one worker in `HERMES_AGENTS` and ensure that profile has the matching Hermes tools enabled.
- **Delegation is refused:** check the coordinator's Profile routes allowlist. Every target must exactly match the Hermes profile name configured in AgentDock.
- **A document has no extractable text:** scanned PDFs need OCR before upload.
- **A Flow task pauses:** check your Chrome profile, Flow access, model availability, and service allowance. AgentDock keeps the job state visible for inspection or retry.
