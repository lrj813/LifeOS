"""Export a portable, offline mock UI next to the original handoff materials."""
import hashlib
import json
import shutil
from pathlib import Path
from build_preview import build, DEST, ROOT

def export():
    build()
    target = ROOT.parent / '交互原型'
    target.mkdir(exist_ok=True)
    # Copy only the build allowlist; never export source/config/runtime or Git history.
    for p in DEST.iterdir():
        if p.is_file() and (p.suffix in {'.js', '.css', '.html'} or p.name == '.nojekyll'):
            shutil.copyfile(p, target / p.name)
    if (DEST / 'assets').exists():
        shutil.copytree(DEST / 'assets', target / 'assets', dirs_exist_ok=True)
    manifest = {str(p.relative_to(target)): hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file() and p.name not in {'manifest.json', '.DS_Store'}}
    (target / 'manifest.json').write_text(json.dumps({'mode':'isolated memory-only mock','files':manifest},ensure_ascii=False,indent=2)+'\n')
    entry = ROOT.parent / '打开交互原型.html'
    entry.write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>打开 LifeOS 交互原型</title><meta http-equiv="refresh" content="0;url=交互原型/index.html"><p><a href="交互原型/index.html">打开 LifeOS 交互原型</a> · 模拟数据，无需模型配置。</p></html>\n')
    print('Offline entry:', entry)

if __name__ == '__main__':
    export()
