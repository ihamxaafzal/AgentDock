# AgentDock user guide

## Choose a mode

- **Demo universe:** explore the simulated room, roster, motion, tasks, activity, and results. Nothing is sent to Hermes. The sample cast is separate from live Hermes configuration.
- **Hermes Agent · local:** connect the profiles in your private `.env` file. The app shows the names and roles you chose for those profiles.

Use the connection control in the upper-right corner to switch modes. Live profile credentials and model settings remain on the local server.

## Understand the room

- **Command room:** isometric animated room, live roster, worker labels, system pulse, and activity state.
- **Profile roster:** select a profile to inspect its current status, role, and workspace. Send new live missions to the configured coordinator; workers receive delegated assignments.
- **Tasks & results:** inspect mission cards, dependencies, assignment status, results, downloadable files, and failures that can be retried.
- **Live Activity:** review activity visible to this AgentDock session. Export the current view as JSON or clear completed entries from the view.
- **Connection menu:** choose Demo or connect to your local Hermes API gateway.

The system pulse reads local machine hardware. It is not a model health or mission progress measurement.

## Send a mission

1. Connect to Hermes and choose the configured coordinator profile.
2. Enter a direction. You can paste source text or attach documents.
3. Enable **Allow me to send tasks from this room** in the connection settings.
4. Click **Send direction** once. Each submission is its own mission and does not automatically continue a previous prompt.
5. Watch the roster, activity, or **Tasks & results** for the coordinator and worker updates.

New missions use only the current request and attachments. Old mission results and uploaded files are not automatically reused.

### Attachments

AgentDock accepts DOCX, text-based PDF, TXT, Markdown, and JSON. Attach up to 20 files, with a combined limit of 50 MB. You may also provide a local path in your request. Source files are read as data; originals are not edited or executed. Scanned PDFs need OCR before upload.

Prompt extraction preserves original order and wording. Repeated prompts in the current source are kept; duplicate copies of the same uploaded document are processed once. Prompt results are plain TXT files.

## Plan multiple tasks

Start each task on a new line with a unique number:

```text
Task 1: Research three evidence-backed facts about octopuses.
Task 2: Write a 50-second U.S. English narration based on Task 1.
Task 3: Extract image prompts from the attached document.
```

State dependencies explicitly, such as `Task 2 after Task 1`. You can also refer to the result by its task number in the request. AgentDock checks duplicate numbers, missing references, and dependency cycles before dispatch. Independent tasks can run while a prerequisite waits. A failed prerequisite blocks only its dependent tasks; unrelated tasks can continue.

The planner does not impose a two- or three-task request limit. Hermes model and worker capacity still determine how much work can run at once.

## Supported capability workflows

These examples describe work types. Assign the corresponding generic capability to a Hermes profile in `HERMES_AGENTS`; the app does not require any particular profile name.

### Extract image prompts

Attach a source document or paste scene text, then ask:

```text
Extract only the image prompts from the attached document. Preserve the original order and wording.
```

The worker assigned `image-extraction` uses `aether_documents`. It excludes video prompts and narration. The result is one downloadable TXT file with prompt bodies separated by a blank line.

### Extract video or motion prompts

```text
Extract only video prompts from the attached document. Include Image-to-Video and Text-to-Video prompts; exclude still images and voiceover.
```

The worker assigned `video-extraction` uses `aether_video_documents`. The extractor recognizes labels such as Video Prompt, Image-to-Video, Text-to-Video, I2V, and T2V. Unlabeled blocks are not guessed. The result is a plain TXT file.

### Extract both prompt types

```text
Use both image and video extraction capabilities on the attached document. Return separate files.
```

Assign `image-extraction` and `video-extraction` to exactly one worker each. Both receive the same exact source paths, and AgentDock returns two separate TXT files.

### Research topics and sources

```text
Research 10 surprising animal-science video topics. For each, include an accurate hook, one or two sourced facts, a visual angle, and direct evidence links.
```

Assign `topic-research` to a worker with Hermes `web` tools. Topic research does not require an input document. Search providers can rate-limit requests; a worker should disclose when it cannot verify a claim.

### Write narration

```text
Write a 60-second U.S. English narration about this topic. Verify factual claims and include source links after the narration.
```

Assign `narration-writing` to a worker with Hermes `web` tools. AgentDock checks the spoken-word minimum, preserves the complete narration, and provides an estimated duration. The recorded timing depends on delivery.

### Create a structured scene pack

```text
Turn this narration into 8 biomedical scenes with 4 total callouts. Keep every narration sentence in order. Script: ...
```

Assign `scene-authoring` to a worker with the included `aether-scenes` plugin. AgentDock builds the scene plan, preserves the exact narration chunks, applies the requested callout budget, and validates the saved result. Visual guidance is provided by the current request and the included plugin; no personal scene-style profile is shipped.

### Generate images through Google Flow

This optional workflow needs `image-generation`, your own Google Flow access, Chrome profile, and Hermes tools for Flow, computer use, and terminal operations. These services and tools are not included. Attach a TXT or Markdown prompt list or paste prompts with at least 25 characters each. AgentDock creates a separate job, processes prompts in order, and verifies that every image exists on disk before marking the task complete. Read [Google Flow setup](IMAGE_GENERATION.md) before configuring it.

## Read results and recover work

- Open **Tasks & results** and select a card to read its response or download its files.
- Use **Retry** only for failed tasks after reviewing the failure reason.
- Use the mission picker in the coordinator workspace to inspect one mission.
- Mission status, prompts, outputs, uploaded copies, and logs are saved under `data/` and excluded from Git.
- Restarting AgentDock resumes observation of an existing Hermes run and starts queued missions when capacity permits. It does not intentionally resubmit a run after a connection timeout.

A timeout does not prove that Hermes stopped. Check the Hermes session before sending a duplicate request.

## Room settings

Open the gear menu in the upper-right corner.

| Setting | Options and effect |
| --- | --- |
| Concurrent missions | 1–256 independent missions; default 5. Reducing the limit does not cancel active work. Linked tasks wait for prerequisites. |
| Animation rate | 20 FPS, 30 FPS, or Eco at 12 FPS. Lower rates use fewer visual updates. |
| Team-break duration | 5–600 seconds; default 30 seconds. Changes apply to visual breaks only. |
| Time between break groups | 10–3,600 seconds; default 90 seconds. Each group waits for the current group to return. |
| Agents per break | Random (2 or 3), 2, or 3 profiles. The coordinator remains at command. New work interrupts a break. |
| Reduce animation | Reduces nonessential movement for accessibility and comfort. |
| Pause room animation | Stops visual room updates while Hermes missions continue. |
| Reset visual identities | Clears browser-stored display names, roles, and colors. It does not change Hermes profiles. |

The current room uses offline-rendered lighting and furniture with lightweight live robot sprites. Lighting intensity and camera orbit controls are unavailable in this fixed isometric reference mode. Changing them would not affect Hermes work.

The system pulse reads local RAM and, when `nvidia-smi` is available, NVIDIA GPU name, memory, utilization, and temperature. It refreshes about every five seconds. These measurements are local and are not sent to Hermes.

## Profile appearance and activity

Select a profile to set a browser-only display name, role, or color. These presentation choices are saved in browser storage and do not edit Hermes configuration. Use **Reset visual identities** to clear them.

Live Activity displays events observed in this AgentDock room. It does not monitor unrelated Hermes sessions or total account conversations. Exported activity is a local JSON download and may include task text; keep it private.
