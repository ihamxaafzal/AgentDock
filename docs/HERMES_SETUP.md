# Connect your Hermes profiles

AgentDock ships no Hermes profile roster, role prompts, personal settings, or profile keys. Create and configure the profiles you want to use, then describe their routing capabilities in your private `.env` file. This guide covers the AgentDock-specific pieces; follow the current [Hermes quickstart](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/quickstart.md), [profiles guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md), and [API server guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md) for Hermes installation details.

## 1. Create your own profiles

Create one coordinator profile and one or more worker profiles. These names are examples; use names that match your own Hermes setup.

```powershell
hermes profile create my-coordinator
hermes profile create my-worker
hermes profile list
```

Choose a working model/provider for each profile and test a normal Hermes chat. Each profile has its own model settings, credentials, tools, memory, and `SOUL.md`. AgentDock does not ship profile prompts or fill in a user's agent identity. Configure each worker for the capabilities you assign to it below.

## 2. Configure Hermes delegation

Install and enable the official `advanced-delegation` plugin in your coordinator profile. Hermes 0.22.5 or newer is required by the current plugin guide.

```powershell
hermes -p my-coordinator plugins install advanced-delegation --enable
hermes -p my-coordinator delegation config
```

Choose **Profile routes**. Add every worker profile that the coordinator may use. Each route name must exactly match that worker's Hermes profile name (`profile` in `.env`). Profile routes are an allowlist; profiles omitted from the list cannot be delegated. The coordinator does not need the workers to install the advanced-delegation plugin. See the [official advanced-delegation guide](https://github.com/NousResearch/hermes-official-plugins/blob/main/advanced-delegation/README.md).

Only allow profiles whose keys, terminal access, tools, and `SOUL.md` you trust. Profile-routed delegation uses the target profile's own credentials, tools, and instructions.

## 3. Install optional AgentDock plugins

Install only the plugin needed by a capability you plan to use. These local plugin folders are included in this repository; Hermes gateway sessions do not automatically load project-local plugin folders.

```powershell
hermes -p my-worker plugins install C:\path\to\AgentDock\agents\aether-documents --enable
hermes -p my-worker plugins install C:\path\to\AgentDock\agents\aether-scenes --enable
```

Repeat a plugin install for each profile that needs its tools. `aether-documents` supports the `image-extraction` and `video-extraction` capabilities. `aether-scenes` supports `scene-authoring`. Research and narration workflows use Hermes's `web` toolset. Image generation uses your own browser-accessible Flow tooling; those tools are not bundled here.

Review each plugin's tools and permissions in Hermes before enabling it. Hermes CLI syntax and plugin dependency prompts can vary by version; check `hermes plugins --help` if your install command differs.

## 4. Start the API gateway

AgentDock supports either a shared multi-profile gateway or separate profile gateways.

### Shared multi-profile gateway

Use this option when your Hermes release supports profile multiplexing. Enable the API server on its host/default profile. Set an `API_SERVER_KEY` in each named profile's own `.env`; a named profile route uses that profile's key.

In the host profile's `.env`:

```dotenv
API_SERVER_ENABLED=true
API_SERVER_PORT=8642
API_SERVER_KEY=replace-with-a-unique-host-key
```

In each named profile's `.env`, set its own unique `API_SERVER_KEY`. Enable multiplexing in the host profile's Hermes configuration, then restart and check the gateway:

```powershell
hermes config set gateway.multiplex_profiles true
hermes gateway restart
hermes gateway status
```

The shared API base URL is `http://127.0.0.1:8642`. A named profile route has the form `http://127.0.0.1:8642/p/<profile>/v1`. Confirm the `/p/<profile>/v1/models` route responds for every configured profile. Do not reuse one API key across profiles.

### Separate profile gateways

If multiplexing is unavailable or you prefer separate listeners, set `API_SERVER_ENABLED=true`, a distinct `API_SERVER_PORT`, and a distinct `API_SERVER_KEY` in each profile's `.env`. Start a gateway for each profile:

```powershell
hermes -p my-coordinator gateway
hermes -p my-worker gateway
```

Use each listener's base URL, for example `http://127.0.0.1:8643/v1` and `http://127.0.0.1:8644/v1`, in `HERMES_AGENTS`. Do not add `/p/<profile>` to a separate listener URL.

## 5. Configure AgentDock profiles and capabilities

Copy the template and edit the private `.env` file:

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace the sample Hermes IDs, profile names, URLs, and keys. A minimal JSON shape is:

```json
[
  {
    "id": "coordinator",
    "name": "My Coordinator",
    "profile": "my-coordinator",
    "url": "http://127.0.0.1:8642/p/my-coordinator",
    "key": "COORDINATOR_PROFILE_API_KEY",
    "nativeCoordinator": true
  },
  {
    "id": "worker-one",
    "name": "My Worker",
    "profile": "my-worker",
    "url": "http://127.0.0.1:8642/p/my-worker",
    "key": "WORKER_PROFILE_API_KEY",
    "reportsTo": "coordinator",
    "capabilities": ["image-extraction", "topic-research"]
  }
]
```

The example shows generic labels only. In the `.env` file:

- `id` is a unique AgentDock identifier. Use letters, numbers, `_`, or `-`.
- `name` is the display name shown in your live room.
- `profile` must match the actual Hermes profile name and the coordinator's Profile routes allowlist entry.
- `url` is a loopback API URL. The shared gateway form includes `/p/<profile>`; a separate gateway uses its own root URL.
- `key` is the API key for that exact Hermes profile. Use unique keys and keep this file private.
- `nativeCoordinator: true` selects the profile that runs native Hermes delegation. Mark exactly one profile.
- `reportsTo` is the AgentDock `id` of the coordinator. Set it for delegated workers.
- `capabilities` is an optional array of generic routing labels. Assign each capability to exactly one worker.

### Enter API keys and preserve the JSON format

Find `API_SERVER_KEY` in the selected Hermes profile's private `.env`. On a default Windows desktop install, named profiles are usually under `%LOCALAPPDATA%\hermes\profiles\<profile>\.env`; the default profile uses `%LOCALAPPDATA%\hermes\.env`. Other installs commonly use `~/.hermes` or the directory set by `HERMES_HOME`. Use the actual data directory, rather than the desktop application's `win-unpacked` folder.

Copy only the value after `API_SERVER_KEY=` into that profile's `"key":"..."` field in AgentDock's `.env`. This is the Hermes gateway secret, not your model provider API key. If the profile has no server key, configure a unique secret in Hermes first and restart its gateway. Keep credentials private.

The JSON block above illustrates the structure. In `.env`, write the whole setting on one line, following `.env.example`:

```dotenv
HERMES_AGENTS='[{"id":"coordinator","name":"My Coordinator","profile":"your-coordinator-profile","url":"http://127.0.0.1:8642/p/your-coordinator-profile","key":"COORDINATOR_PROFILE_KEY","nativeCoordinator":true}]'
```

Replace both occurrences of `your-coordinator-profile` with an existing Hermes profile name and replace `COORDINATOR_PROFILE_KEY` with that profile's server key. The example is a connection check with one coordinator; add capability-assigned workers for delegated workflows. AgentDock rejects unchanged template placeholders before contacting Hermes.

Keep the outer single quotes and inner JSON double quotes. Use straight quotes, separate objects with commas, and do not leave a comma before `]` or `}`. If a key contains a JSON-special character such as a double quote or backslash, escape it as required by JSON. Save as `.env`, not `.env.txt`, and restart AgentDock after editing. When `HERMES_AGENTS` is present, setting `HERMES_API_KEY` does not replace its per-profile `key` fields.

| Error | What to check |
| --- | --- |
| `HERMES_AGENTS must be a JSON array` | Restore the one-line format from `.env.example`; check quotes, commas, and square brackets. |
| Placeholder configuration | Replace sample names in both `profile` and `url`, and replace each sample `key`. |
| Authentication failed / HTTP 401 or 403 | Use the routed profile's own `API_SERVER_KEY` in its `HERMES_AGENTS` entry. |
| HTTP 404 | Verify the profile exists and `/p/<profile>/v1/models` is reachable on a shared gateway with multiplexing enabled. For separate gateways, use that listener's root URL without `/p/<profile>`. |

### Capability and tool mapping

| Capability | Hermes toolset needed | Included plugin |
| --- | --- | --- |
| `image-extraction` | `aether_documents` | `agents/aether-documents` |
| `video-extraction` | `aether_video_documents` | `agents/aether-documents` |
| `topic-research` | `web` | Hermes tools |
| `narration-writing` | `web` | Hermes tools |
| `scene-authoring` | `aether_scenes` | `agents/aether-scenes` |
| `image-generation` | `aether_flow`, `computer_use`, `terminal` | Your own Flow/browser tools |

One Hermes profile can handle several capabilities if it has the required tools. Each workflow requires exactly one configured worker for each requested capability. For a combined image-and-video extraction request, assign one worker to each of those two capabilities. If a capability is missing or assigned more than once, AgentDock reports a configuration error before dispatch.

The legacy single-profile `HERMES_API_URL` and `HERMES_API_KEY` settings remain available for basic direct chat, but specialized workflows require a coordinator and capability-assigned workers in `HERMES_AGENTS`.

## 6. Set local runtime paths

Native Hermes delegation needs the Hermes installation paths. Set these in `.env` and restart AgentDock:

```dotenv
HERMES_HOME=C:/Users/YOUR_NAME/AppData/Local/hermes
HERMES_SOURCE_DIR=C:/path/to/hermes-agent
HERMES_NATIVE_PYTHON=C:/path/to/hermes-python/python.exe
HERMES_EXTRACTION_DIR=C:/Users/YOUR_NAME/AppData/Local/hermes/shared/agentdock-extractions
AETHER_CONCURRENT_MISSIONS=5
```

Use the paths from your own installation. `HERMES_NATIVE_PYTHON` must be able to import the Hermes CLI and the dependencies required by the installed document plugins. `HERMES_EXTRACTION_DIR` is the shared local destination the document and scene tools use for verified text artifacts.

## 7. Connect and verify

1. Start the Hermes API gateway(s) and confirm each profile's `/v1/models` endpoint responds with its expected profile model ID.
2. Confirm the coordinator has native Hermes access and Profile routes enabled for the worker profiles you intend to use.
3. Start AgentDock with `npm start` or `Start AgentDock.cmd`.
4. Open `http://127.0.0.1:4317`, select **Connect locally**, and review the displayed profile names.
5. Enable task sending in the connection dialog and send a small request for a capability you configured.
6. Open **Tasks & results** and verify the coordinator and assigned worker results.

An **Unobserved** profile means AgentDock has no task status to show for it; it does not prove that Hermes is idle or offline. A request timeout also does not prove that a worker stopped. Inspect Hermes before manually sending duplicate work.
