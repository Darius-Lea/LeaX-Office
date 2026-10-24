"""Check that the Windows setup embeds the current production application."""
import hashlib, io, json, struct, zipfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
target = root / 'downloads/AI-Headquarters-Setup.exe'
binary = target.read_bytes()
assert binary[:2] == b'MZ', 'Not a Windows executable'
assert hashlib.sha256(binary).hexdigest() == target.with_suffix('.exe.sha256').read_text().split()[0], 'Executable checksum mismatch'
production = root / 'dist/application'
expected = json.loads((production / 'application-manifest.json').read_text())
offset, payload = 0, None
while True:
    end = binary.find(b'PK\x05\x06', offset)
    if end < 0: break
    offset = end + 4
    if end + 22 > len(binary): continue
    size, central, comment = struct.unpack_from('<IIH', binary, end + 12)
    start = end - size - central
    if start < 0 or binary[start:start + 4] != b'PK\x03\x04': continue
    try:
        archive = zipfile.ZipFile(io.BytesIO(binary[start:end + 22 + comment]))
        if 'application-manifest.json' in archive.namelist():
            assert payload is None, 'Ambiguous application payload'
            payload = archive
    except zipfile.BadZipFile: continue
assert payload is not None, 'No embedded application'
actual = json.loads(payload.read('application-manifest.json'))
assert actual == expected, 'Installer is stale: embedded manifest differs from current production build'
assert len(payload.namelist()) == len(set(payload.namelist())), 'Duplicate entries'
assert set(payload.namelist()) == set(expected['files']) | {'application-manifest.json'}, 'Unexpected entries'
for name, digest in expected['files'].items():
    assert hashlib.sha256(payload.read(name)).hexdigest() == digest, 'Embedded mismatch: ' + name
    assert hashlib.sha256((production / name).read_bytes()).hexdigest() == digest, 'Production mismatch: ' + name
print(f"Verified installer parity: {expected['version']}, {len(expected['files'])} matching files; executable checksum matches.")
