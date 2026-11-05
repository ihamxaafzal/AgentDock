export function isScoutRequest(message) {
  const intro = message.split(/\b(?:scene|shot)\s*\d+|\b(?:image|video|image-to-video)\s+prompt\s*:/i)[0];
  if (/\b(?:script[ -]?scout)\b/i.test(intro)) return true;
  if (/\bextract\b[\s\S]{0,80}\b(?:images?|video)\s+prompts?\b/i.test(intro)) return false;
  return /\b(?:topics?|ideas?|titles?|facts?)\b/i.test(intro) && /\b(?:find|suggest|give|research|viral|trending|shocking|surprising|medical|nature|animals?|biology|scout)\b/i.test(intro);
}

export function prepareScoutDirection(message, endpoints) {
  const endpoint = resolveCapability(endpoints, CAPABILITIES.research);
  const task = delegatedTask(endpoint, CAPABILITIES.research, 'Research the exact current brief below using current, credible sources.', 'Use only evidence found for this request. Return useful findings and source links.');
  return {
    taskType: 'research', requiredProfiles: [endpoint.id],
    message: `Research the current request. Search and open credible sources, distinguish sourced facts from uncertainty, and include source links. Follow the user's requested subject and count; if no count is given, return 10 useful options. Do not invent evidence or performance claims. Return the findings directly in the response. Use delegate_task with exactly this assignment: ${JSON.stringify({tasks:[task]})}\n\nCURRENT USER BRIEF:\n${message}`
  };
}
import { CAPABILITIES, delegatedTask, resolveCapability } from './profile-capabilities.mjs';
