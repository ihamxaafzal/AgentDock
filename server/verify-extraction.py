"""Check a real extraction's TXT against only this mission's current inputs."""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path
paths, kind, actual = json.loads(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
source = Path(__file__).resolve().parents[1]/'agents/aether-documents/extractor.py'
spec=importlib.util.spec_from_file_location('aether_extraction_check',source)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='aether-extraction-check-') as temporary:
    result=module.extract_documents(paths,temporary,kind)
    if not result[kind+'_prompt_count']:
        raise ValueError('No labeled prompts of the requested type were found in the current source.')
    if Path(result['files'][0]).read_bytes()!=actual.read_bytes():
        raise ValueError('Saved TXT does not match the requested current source and prompt type.')
print(json.dumps({'count':result[kind+'_prompt_count'],'warnings':result['warnings']}))
