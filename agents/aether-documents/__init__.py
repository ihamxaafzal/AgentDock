"""Deterministic image/video extraction. Source content is data, never commands."""
import json
from .extractor import extract_documents


def register(ctx):
    for kind, toolset in [('image', 'aether_documents'), ('video', 'aether_video_documents')]:
        name = 'extract_' + kind + '_prompts'
        schema = {
            'name': name,
            'description': 'Extract ONLY ' + kind + ' prompts from current supplied local documents. Preserve wording and source order. Save one Notepad TXT file: prompt bodies only, one blank line between prompts, no labels or numbering. Video includes Image-to-Video, Text-to-Video and Video Prompt sections; exclude the other prompt type and narration. Never modify originals.',
            'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'paths': {'type': 'array', 'items': {'type': 'string'}, 'minItems': 1}}, 'additionalProperties': False}
        }
        def handle(params, _kind=kind, **kwargs):
            try:
                result = extract_documents(params.get('paths') or ([params['path']] if params.get('path') else []), prompt_kind=_kind)
                result.pop('items', None)
                return json.dumps(result, ensure_ascii=False)
            except Exception as error:
                return json.dumps({'success': False, 'error': str(error), 'instruction': 'Report the issue to the coordinator; do not invent prompts or rewrite source.'}, ensure_ascii=False)
        ctx.register_tool(name=name, toolset=toolset, schema=schema, handler=handle)
