# Security and privacy

AgentDock is a local bridge between a browser room and the Hermes profiles you configure. It is designed for local use, not as an internet-facing service or a replacement for operating-system access controls.

## Local boundary

- The server binds to `127.0.0.1` by default and validates local Host and Origin values.
- A per-process request token protects browser API calls for the current local session.
- Hermes API keys stay in the server-side `.env` file. Browser JavaScript does not receive profile keys.
- Do not expose the service through a tunnel, port forward, reverse proxy, or firewall rule without separately designing and reviewing an authenticated remote-access layer.

These controls reduce accidental exposure on the local machine. They do not protect against malware or another process already running as your Windows user.

## Local data

The `data/` folder can contain mission prompts and results, uploaded document copies, logs, generated plans, and image-job records. Git ignores the folder, but AgentDock does not encrypt its contents. Protect the project directory and computer with your normal disk and account security.

The `.env` file contains profile names, gateway URLs, API keys, and local paths. Keep it private. `.env.example` uses generic placeholders. The repository does not include personal Hermes profile rosters, profile prompts, or private agent instructions.

AgentDock reads uploaded files as source data; originals are not modified or executed. Scanned PDF pages need OCR before upload. Only attach documents you are authorized to share with your configured Hermes profiles and enabled tools.

## Network and external services

- **Hermes:** mission briefs, selected documents, and API requests are sent by the local server to the configured Hermes gateway. Hermes tools and provider settings determine any additional destinations.
- **Web research:** workers assigned research or narration capabilities may use Hermes web-search tools. Search providers can receive the query content needed to perform the search.
- **Google Flow:** the optional image-generation capability uses your Chrome profile and Google Flow account. Output files are saved locally. AgentDock does not store your Google password.
- **Hardware panel:** RAM and optional NVIDIA readings are collected locally by the hardware sampler and are not sent to Hermes.

Review each Hermes profile's tools, memory, and provider settings before sending confidential content. Demo mode uses simulated results and does not contact Hermes.

## Publishing safeguards

The repository ignores `.env`, all `.env.*` files except `.env.example`, `data/`, `backups/`, `work/`, `node_modules/`, `dist/`, and local logs. Check `git status --ignored` before publishing. Do not force-add private files or include real keys, prompts, or uploaded documents in public issues.

If you find a security issue, follow the private reporting instructions in the root [SECURITY.md](../SECURITY.md).
