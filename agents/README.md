# Hermes plugins

AgentDock does not publish Hermes profiles, profile prompts, example rosters, or personal agent settings. Create and configure your own Hermes profiles, then connect them in your private `.env` file.

This folder contains optional AgentDock integrations that you may install into profiles you own:

- `aether-documents` reads supported local documents and extracts image or video prompts.
- `aether-scenes` validates and saves structured scene packs.

Assign the matching AgentDock capability to a Hermes worker in `HERMES_AGENTS`. Install and configure each plugin in Hermes as described in the [Hermes setup guide](../docs/HERMES_SETUP.md). The research and narration workflows use the Hermes `web` toolset. Google Flow image generation also requires your own browser-accessible Flow integration and toolset; those tools are not bundled here.

Each profile, model, key, prompt, tool permission, and memory setting belongs to the profile owner. Keep your Hermes profile configuration and API keys out of this repository.

The document plugin bundles pypdf 6.10.0 under its BSD license; see [PYPDF-LICENSE.txt](aether-documents/PYPDF-LICENSE.txt). See the [official advanced-delegation plugin documentation](https://github.com/NousResearch/hermes-official-plugins/blob/main/advanced-delegation/README.md) for Hermes delegation setup.
