export const testProfiles = [
  { id: 'coordinator', name: 'Test Coordinator', profile: 'test-coordinator', nativeCoordinator: true },
  { id: 'images', name: 'Image Worker', profile: 'test-images', reportsTo: 'coordinator', capabilities: ['image-extraction'] },
  { id: 'video', name: 'Video Worker', profile: 'test-video', reportsTo: 'coordinator', capabilities: ['video-extraction'] },
  { id: 'research', name: 'Research Worker', profile: 'test-research', reportsTo: 'coordinator', capabilities: ['topic-research'] },
  { id: 'narration', name: 'Narration Worker', profile: 'test-narration', reportsTo: 'coordinator', capabilities: ['narration-writing'] },
  { id: 'scenes', name: 'Scene Worker', profile: 'test-scenes', reportsTo: 'coordinator', capabilities: ['scene-authoring'] },
  { id: 'images-generation', name: 'Generation Worker', profile: 'test-image-generation', reportsTo: 'coordinator', capabilities: ['image-generation'] }
];
