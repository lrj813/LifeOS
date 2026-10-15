"""Build an isolated interactive prototype; never copy credentials/backend/runtime."""
import json
import shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.preview-site'

def build():
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()
    source = (ROOT / 'frontend/index.html').read_text()
    source = source.replace('<title>苟活 · LifeOS</title>', '<title>苟活 · 交互演示</title>')
    source = source.replace('<!-- Preview modules are injected only by scripts/build_preview.py. -->', '<script src="fixture.js"></script><script src="mock-service.js"></script><script src="preview.js"></script>')
    (DEST / 'index.html').write_text(source)
    for p in (ROOT / 'frontend').iterdir():
        if p.is_file() and p.name != 'index.html' and p.suffix in {'.js', '.css'}:
            shutil.copyfile(p, DEST / p.name)
    if (ROOT / 'frontend/assets').exists():
        shutil.copytree(ROOT / 'frontend/assets', DEST / 'assets')
    shutil.copyfile(ROOT / 'preview/adapter.js', DEST / 'preview.js')
    shutil.copyfile(ROOT / 'preview/mock-service.js', DEST / 'mock-service.js')
    entries = json.loads((ROOT / 'data/guide.json').read_text())['entries']
    ids = ['15-01', '04-18', '03-01', '02-11', '05-01', '21-07', '15-06', '04-07']
    guides = [next(e for e in entries if e['guide_id'] == guide_id) for guide_id in ids]
    (DEST / 'fixture.js').write_text('window.PREVIEW_GUIDES = ' + json.dumps(guides, ensure_ascii=False) + ';\n')
    (DEST / '.nojekyll').touch()
    print('Isolated prototype built:', DEST, '(memory-only mock; no AI calls).')

if __name__ == '__main__':
    build()
