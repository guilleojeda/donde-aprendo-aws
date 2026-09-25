#!/usr/bin/env python3
"""Bundle the Meetup sync Lambda without third-party Python dependencies."""

from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys

source = Path(__file__).with_name('import-meetup-events.py')
target = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist/meetup-events.zip')
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:
    archive.write(source, 'index.py')
print(target)
