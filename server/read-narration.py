import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'agents/aether-documents'))
from extractor import read_docx,read_pdf
out=[]
for arg in sys.argv[1:]:
 p=Path(arg);suffix=p.suffix.lower()
 if suffix=='.docx':text='\n'.join(t for t,_ in read_docx(p))
 elif suffix=='.pdf':
  lines,empty=read_pdf(p)
  if empty:raise ValueError('Scanned/empty PDF pages need OCR; provide full readable narration.')
  text='\n'.join(t for t,_ in lines)
 elif suffix in {'.txt','.md','.markdown'}:text=p.read_text(encoding='utf-8-sig')
 else:raise ValueError('For scene narration, use TXT, Markdown, DOCX or a text PDF.')
 out.append(text)
print(json.dumps(out,ensure_ascii=False))
