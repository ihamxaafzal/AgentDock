"""Pure extraction: document content is data, never executable instructions."""
from __future__ import annotations
import io
import hashlib
import json
import re
import sys
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

LABEL = re.compile(r"^\s*(?:[\W_]*?)?(?:image[\s_-]*prompts?|visual[\s_-]*prompts?)\s*(?:\*\*)?\s*(?:\d+\s*)?(?::|[-â€“â€”]|$)\s*(?:\*\*)?\s*(.*)$", re.I)
BOUNDARY = re.compile(r"^\s*(?:[\W_]*?)?(?:(?:(?:image|text)[\s_-]*to[\s_-]*video|i2v|t2v)[\s_-]*prompts?|video[\s_-]*prompts?|voice[\s_-]*(?:over|narration)?|narration|audio[\s_-]*prompts?|sound[\s_-]*(?:effects?|design)|negative[\s_-]*prompts?)\s*(?::|[-â€“â€”]|$)", re.I)
VIDEO_LABEL = re.compile(r"^\s*(?:[\W_]*?)?(?:(?:image|text)[\s_-]*to[\s_-]*video|video|i2v|t2v|motion|animation)[\s_-]*prompts?\s*(?:\*\*)?\s*(?:\d+\s*)?(?::|[-â€“â€”]|$)\s*(?:\*\*)?\s*(.*)$", re.I)
SCENE = re.compile(r"^\s*(?:[#*_>\-]+\s*)?((?:scene|shot|sequence)\s*[#:]?\s*\d+[^\n]*)$", re.I)
NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
# Recognize section labels in flattened copied text without splitting ordinary scene references.
_INLINE_LABEL = r'(?:(?:image|text)[\s_-]*to[\s_-]*video|image|visual|video|i2v|t2v|motion|animation)[\s_-]*prompts?\s*:'
INLINE_SPLIT = re.compile(r'(?<!\S)(?=(?:scene|shot|sequence)\s*[#:]?\s*\d+\s+(?:' + _INLINE_LABEL + r')|' + _INLINE_LABEL + r'|(?:voice(?:[\s_-]*(?:over|narration))?|narration|audio[\s_-]*prompt|negative[\s_-]*prompt)\s*:)', re.I)


def expanded_lines(lines):
    for line, page in lines:
        parts = INLINE_SPLIT.split(line)
        if len(parts) <= 1:
            yield line, page
        else:
            for part in parts:
                if part.strip(): yield part.rstrip(), page



def _key(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())


def _strings(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [text for item in value for text in _strings(item)]
    if isinstance(value, dict):
        for key in ('prompt', 'text', 'content_text', 'content', 'content_list', 'image_prompt', 'imagePrompt', 'video_prompt', 'videoPrompt', 'image_to_video_prompt', 'imageToVideoPrompt', 'text_to_video_prompt'):
            if key in value:
                return _strings(value[key])
    return []


def json_prompts(node, scene='', prompt_kind='image'):
    items = []
    accepted = {'image', 'imageprompt', 'visualprompt'} if prompt_kind == 'image' else {'video', 'videoprompt', 'imagetovideoprompt', 'texttovideoprompt', 'motionprompt', 'animationprompt', 'i2v', 't2v'}
    keys = {'imageprompt', 'imageprompts', 'visualprompt', 'visualprompts'} if prompt_kind == 'image' else {'videoprompt', 'videoprompts', 'imagetovideoprompt', 'imagetovideoprompts', 'texttovideoprompt', 'texttovideoprompts', 'motionprompt', 'animationprompt'}
    def visit(value, inherited='', image_scope=False):
        if isinstance(value, list):
            for child in value:
                visit(child, inherited, image_scope)
        elif isinstance(value, dict):
            current = value.get('scene') or value.get('scene_title') or value.get('scene_number') or value.get('scene_order') or inherited
            kind = _key(value.get('type', value.get('kind', '')))
            if kind in accepted:
                prompt = '\n'.join(_strings(value))
                if prompt:
                    items.append({'scene': str(current), 'prompt': prompt, 'original_block': prompt, 'page': None})
                return
            if kind in {'image', 'imageprompt', 'visualprompt', 'video', 'videoprompt', 'imagetovideoprompt', 'texttovideoprompt', 'voicenarration', 'voiceover', 'narration', 'audio'}:
                return
            if image_scope:
                strings = _strings(value)
                if strings:
                    prompt = '\n'.join(strings)
                    items.append({'scene': str(current), 'prompt': prompt, 'original_block': prompt, 'page': None})
                    return
            for key, child in value.items():
                normalized = _key(key)
                if normalized in keys:
                    visit(child, current, True)
                elif normalized not in ('imageprompt', 'imageprompts', 'visualprompt', 'visualprompts', 'videoprompt', 'videoprompts', 'imagetovideoprompt', 'imagetovideoprompts', 'texttovideoprompt', 'texttovideoprompts', 'voicenarration', 'voicenarrations', 'voiceover', 'narration', 'instructions', 'systemprompt'):
                    if isinstance(child, (dict, list)):
                        visit(child, current, False)
        elif isinstance(value, str):
            if image_scope:
                items.append({'scene': str(inherited), 'prompt': value, 'original_block': value, 'page': None})
            else:
                items.extend(text_prompts([(line, None) for line in value.splitlines()], inherited, prompt_kind))
    visit(node, scene)
    return items


def text_prompts(lines, initial_scene='', prompt_kind='image'):
    items, active, prompt_lines = [], [], []
    scene, active_scene, page = initial_scene, '', None
    def flush():
        nonlocal active, prompt_lines
        if active:
            prompt = '\n'.join(prompt_lines).strip('\n')
            if prompt.strip():
                items.append({'scene': active_scene, 'prompt': prompt, 'original_block': '\n'.join(active).strip('\n'), 'page': page})
        active, prompt_lines = [], []
    for line, line_page in expanded_lines(lines):
        marker = (VIDEO_LABEL if prompt_kind == 'video' else LABEL).match(line)
        scene_match = SCENE.match(line)
        if marker:
            flush()
            active_scene, page = scene, line_page
            active, prompt_lines = [line], [marker.group(1)] if marker.group(1) else []
        elif scene_match:
            flush()
            scene = scene_match.group(1).rstrip('*').strip()
        elif BOUNDARY.match(line) or VIDEO_LABEL.match(line) or (prompt_kind == 'video' and LABEL.match(line)) or re.match(r'^\s*#{1,6}\s+', line):
            flush()
        elif active:
            active.append(line)
            prompt_lines.append(line)
    flush()
    return items


def read_docx(path):
    with zipfile.ZipFile(path) as archive:
        info = archive.getinfo('word/document.xml')
        if info.file_size > 100_000_000:
            raise ValueError('DOCX document text is too large to read safely.')
        root = ET.fromstring(archive.read(info))
    result = []
    for p in root.iter(NS + 'p'):
        segments = []
        for node in p.iter():
            if node.tag == NS + 't': segments.append(node.text or '')
            elif node.tag == NS + 'tab': segments.append('\t')
            elif node.tag in (NS + 'br', NS + 'cr'): segments.append('\n')
        result.extend((line, None) for line in ''.join(segments).split('\n'))
    return result


def read_pdf(path):
    # pypdf is vendored so this tool does not depend on the model's shell/Python PATH.
    vendor = str(Path(__file__).parent / 'vendor')
    if vendor not in sys.path: sys.path.insert(0, vendor)
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    if reader.is_encrypted and not reader.decrypt(''):
        raise ValueError('This PDF is password-protected. Supply an unlocked copy.')
    lines, empty = [], []
    for i, page in enumerate(reader.pages, 1):
        content = page.extract_text(extraction_mode='layout') or ''
        if not content.strip(): empty.append(i)
        lines.extend((line, i) for line in content.splitlines())
    return lines, empty


def extract_documents(paths, output_dir=None, prompt_kind='image'):
    if prompt_kind not in ('image', 'video'): raise ValueError('Unsupported prompt kind.')
    if not isinstance(paths, list) or not paths or not all(isinstance(p, str) and p.strip() for p in paths):
        raise ValueError('Supply one or more absolute document paths in the required document order.')
    all_items, documents, warnings = [], [], []
    seen_documents = set()
    for document_index, value in enumerate(paths, 1):
        path = Path(value).expanduser()
        if not path.is_absolute() or not path.is_file():
            raise ValueError(f'Document not found at the exact supplied path: {value}')
        scope_file = path.parent / '.aether-prompt-kind'
        if scope_file.is_file():
            selected = scope_file.read_text(encoding='utf-8').strip()
            if selected in ('image', 'video') and selected != prompt_kind:
                raise ValueError(f'This CURRENT Aether task permits {selected} prompts only. Use extract_{selected}_prompts and return its one TXT file; do not extract the other type for verification.')
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''): digest.update(chunk)
        fingerprint = digest.digest()
        if fingerprint in seen_documents:
            warnings.append({'source': str(path), 'message': 'Duplicate document skipped; its prompts are already included once.'})
            continue
        seen_documents.add(fingerprint)
        suffix = path.suffix.lower()
        empty_pages = []
        if suffix == '.docx': items = text_prompts(read_docx(path), prompt_kind=prompt_kind)
        elif suffix == '.pdf':
            lines, empty_pages = read_pdf(path)
            items = text_prompts(lines, prompt_kind=prompt_kind)
        elif suffix == '.json':
            items = json_prompts(json.loads(path.read_text(encoding='utf-8-sig')), prompt_kind=prompt_kind)
        elif suffix in ('.txt', '.md', '.markdown'):
            raw = path.read_bytes()
            encoding = 'utf-16' if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'
            items = text_prompts([(line, None) for line in raw.decode(encoding).splitlines()], prompt_kind=prompt_kind)
        else:
            raise ValueError(f'Unsupported document type {suffix}. Supply DOCX, a text PDF, TXT, Markdown or JSON.')
        if empty_pages:
            warnings.append({'source': str(path), 'pages_without_text': empty_pages, 'message': 'These pages need OCR; no content was invented for them.'})
        if not items:
            warnings.append({'source': str(path), 'message': f'No explicitly labeled {prompt_kind} prompts were found. Ask for the intended section or labeling; do not guess.'})
        documents.append({'document_order': document_index, 'source': str(path), 'count': len(items)})
        for position, item in enumerate(items, 1):
            all_items.append({'document_order': document_index, 'position_in_document': position, 'source': str(path), **item})
    profile_home = Path(__file__).resolve().parents[2]
    root_home = profile_home.parent.parent if profile_home.parent.name == 'profiles' else profile_home
    output = Path(output_dir) if output_dir else root_home / 'shared' / 'aether-extractions'
    output.mkdir(parents=True, exist_ok=True)
    stem = prompt_kind + '-prompts-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:10]
    txt_path = output / (stem + '.txt')
    # File contains prompt bodies only: one blank line between consecutive prompts.
    text = '\n\n'.join(item['prompt'].replace('\r\n', '\n').strip('\r\n') for item in all_items).replace('\n', '\r\n')
    txt_path.write_text(text, encoding='utf-8-sig', newline='')
    return {'success': True, prompt_kind + '_prompt_count': len(all_items), 'documents': documents, 'items': all_items, 'files': [str(txt_path)], 'warnings': warnings, 'preview': [{'scene': i['scene'], 'prompt': i['prompt'][:1000]} for i in all_items[:3]], 'order_policy': 'Source sequence preserved; not numerically sorted. Original documents were not modified.'}
