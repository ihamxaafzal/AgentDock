export const CAPABILITIES = Object.freeze({
  images: 'image-extraction',
  video: 'video-extraction',
  research: 'topic-research',
  narration: 'narration-writing',
  scenes: 'scene-authoring',
  imageGeneration: 'image-generation'
});

const defaultToolsets = Object.freeze({
  'image-extraction': ['aether_documents'],
  'video-extraction': ['aether_video_documents'],
  'topic-research': ['web'],
  'narration-writing': ['web'],
  'scene-authoring': ['aether_scenes'],
  'image-generation': ['aether_flow', 'computer_use', 'terminal']
});

export function resolveCapability(endpoints = [], capability) {
  const matches = endpoints.filter(endpoint => endpoint.capabilities?.includes(capability));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`More than one Hermes profile has the "${capability}" capability. Assign it to exactly one profile.`);
  throw new Error(`No Hermes profile is assigned the "${capability}" capability. Add it to a worker's capabilities array in HERMES_AGENTS and restart AgentDock.`);
}

export function delegatedTask(endpoint, capability, goal, context) {
  return {
    profile: endpoint.profile || endpoint.id,
    toolsets: defaultToolsets[capability],
    goal,
    context
  };
}
