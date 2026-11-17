#!/usr/bin/env python3
"""Bundle the Meetup sync Lambda without third-party Python dependencies."""

from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZipInfo
import sys

source = Path(__file__).with_name('import-meetup-events.py')
target = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist/meetup-events.zip')
target.parent.mkdir(parents=True, exist_ok=True)
handler = source.read_bytes()
entry = ZipInfo('index.py', date_time=(1980, 1, 1, 0, 0, 0))
entry.create_system = 3
entry.external_attr = 0o100644 << 16
entry.internal_attr = 0
entry.compress_type = ZIP_STORED

with ZipFile(target, 'w', compression=ZIP_STORED) as archive:
    archive.writestr(entry, handler)
print(target)
