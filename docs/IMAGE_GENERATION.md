# Optional Google Flow image generation

AgentDock can route image-generation jobs to a Hermes profile you configure. This is an optional integration. The Google Flow tools and service access are not included in this repository, and no personal image-generation profile or prompt is shipped.

## Requirements

- Google Chrome installed on the computer running Hermes.
- A Chrome profile that you control and have signed in to Google Flow.
- Access to Google Flow and an available image model.
- A Hermes worker configured with the `image-generation` capability and your Flow tools: `aether_flow`, `computer_use`, and `terminal`.
- The coordinator's Profile routes allowlist must include the worker's exact Hermes profile name.

AgentDock defaults to Chrome's `Default` profile and the standard Windows Chrome executable path. Set these optional environment variables in the private `.env` file if your setup differs:

```dotenv
AETHER_IMAGE_OUTPUT_DIR=C:/Users/YOUR_NAME/Pictures/AgentDock
AETHER_FLOW_CHROME_PROFILE=Default
AETHER_FLOW_CHROME_EXECUTABLE=C:/Program Files/Google/Chrome/Application/chrome.exe
```

Without `AETHER_IMAGE_OUTPUT_DIR`, generated files are saved under `~/Pictures/AgentDock/<job-id>`. Use an absolute folder the Hermes worker can access. Restart AgentDock after changing the environment.

## Prepare the Hermes worker

Install or configure the Flow workflow tools in your own Hermes environment and verify that the chosen profile can access them. Add `image-generation` to exactly one worker's `capabilities` array in `HERMES_AGENTS`. Review its Chrome access, terminal access, profile instructions, and permissions before allowing delegation.

The worker must support the job tools `read_flow_image_job`, `pause_flow_image_job`, and recording saved image outputs through the Flow integration. AgentDock does not provide these tools or the worker's `SOUL.md` instructions.

## Submit an image job

Attach a `.txt` or `.md` prompt list, or paste prompts after an instruction such as:

```text
Generate one image for each prompt below:

Image Prompt: A cinematic, anatomically accurate 3D illustration of a red blood cell moving through a capillary, dramatic rim lighting, dark background.

Image Prompt: A detailed illustration of a healthy alveolus exchanging oxygen and carbon dioxide, realistic tissue, clean labels omitted.
```

Prompts may be separated by blank lines or labeled `Image Prompt:`. Each must contain at least 25 characters. AgentDock preserves prompt order and wording. The configured job requests Image mode, 9:16 aspect ratio, Nano Banana 2.1, and one output per prompt; the worker should report a genuine blocker if those settings are unavailable rather than silently switching models.

The workflow creates a new Flow project per batch and processes one prompt at a time. Image-generation batches are serialized so they do not use the same Chrome profile concurrently. If login, browser access, model availability, or service allowance is missing, the mission should pause with the actual reason. AgentDock verifies every recorded image path and file before marking the task complete.

Review the output folder before sharing generated images. Google Flow's separate terms and policies apply to generated content.
