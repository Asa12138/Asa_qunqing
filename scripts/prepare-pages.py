#!/usr/bin/env python3
"""Copy only public website files into the Pages artifact. No website build step."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
output = root / '_site'
if output.exists():
    shutil.rmtree(output)
output.mkdir()
for name in ['assets', 'audio', 'data', 'images', 'vendor']:
    shutil.copytree(root / name, output / name, ignore=shutil.ignore_patterns('.DS_Store', '__pycache__', '*.tmp'))
for file in root.iterdir():
    if file.is_file() and (file.suffix in {'.html', '.css', '.js'} or file.name == '.nojekyll'):
        shutil.copy2(file, output / file.name)
print(f'Prepared {sum(p.stat().st_size for p in output.rglob("*") if p.is_file()) / 1024**2:.2f} MiB for GitHub Pages')
