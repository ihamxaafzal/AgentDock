"""Verify the current saved pack against its plan/drafts without modifying it."""
import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path

plan_path, output_dir, expected = sys.argv[1:]
plan_path = Path(plan_path).resolve()
plan = json.loads(plan_path.read_text(encoding='utf-8-sig'))
if plan_path.name != 'scene-plan.json' or plan_path.parent.name != plan.get('id') or plan.get('outputName') != expected:
    raise ValueError('Scene result does not belong to the current plan.')
spec = importlib.util.spec_from_file_location('aether_scene_builder', Path(__file__).resolve().parents[1] / 'agents/aether-scenes/builder.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
data = (Path(output_dir) / expected).read_bytes()
text = data.decode('utf-8-sig').replace('\r\n', '\n')
blocks = re.findall(r'Scene (\d+)\nImage Prompt: ([\s\S]*?)\n\nImage-to-Video Prompt: ([\s\S]*?)\n\nVoice: ([\s\S]*?)(?=\n\nScene \d+\n|\Z)', text)
if len(blocks) != len(plan['scenes']):
    raise ValueError('Saved pack is missing assigned scene blocks.')
scenes = []
image_separator = ' Keep decorative materials within the charcoal, ivory and restrained crimson/salmon palette. Maintain consistent anatomy, subject identity and lighting across the sequence. '
motion_separator = ' Animate only the supplied still-image content and the narrated action. '
for assigned, (number, image, video, voice) in zip(plan['scenes'], blocks):
    if int(number) != assigned['scene'] or voice != assigned['voice'] or not image.startswith(builder.STYLE + ' '):
        raise ValueError('Saved pack changed the current scene order, voice or style.')
    description, rules = image[len(builder.STYLE) + 1:].split(image_separator, 1)
    motion = video.split(motion_separator, 1)[0]
    calls = []
    if assigned['calloutCount']:
        prefix = f"Add exactly {assigned['calloutCount']} callouts with thin ivory leader lines and small circular endpoints: "
        if not rules.startswith(prefix):
            raise ValueError('Saved pack changed an assigned callout budget.')
        pairs = rules[len(prefix):].split('. Use clean ivory-white sans-serif typography.', 1)[0]
        for pair in pairs.split('; '):
            match = re.fullmatch('“([^”]+)” pointing to (.+)', pair)
            if not match:
                raise ValueError('Invalid saved callout label or target.')
            calls.append({'label': match[1], 'target': match[2]})
    scenes.append({'scene': int(number), 'description': description, 'motion': motion, 'callouts': calls})
with tempfile.TemporaryDirectory(prefix='aether-scene-verify-') as temporary:
    built = builder.build_scenes(str(plan_path), scenes, temporary)
    if (Path(temporary) / expected).read_bytes() != data:
        raise ValueError('Saved pack differs from the current plan and exact output format.')
print(json.dumps({'verified': True, 'name': expected, 'scene_count': built['scene_count'], 'total_callouts': built['total_callouts']}))
