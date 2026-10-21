"""Build the native Windows x64 GUI setup with an embedded, secret-free app snapshot.
Requires Go >=1.24 and network access to pinned Go modules. No Windows execution occurs.
Usage: python scripts/build-native-installer.py --go /path/to/go
"""
import argparse, hashlib, os, pathlib, subprocess, zipfile
parser=argparse.ArgumentParser();parser.add_argument('--go',default='go');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];installer=root/'installer';out=root/'downloads';out.mkdir(exist_ok=True)
files=[]
for folder in ['src','public','scripts']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file() and p.suffix in {'.ts','.js','.html','.css','.ps1','.py'})
files.extend(root.glob('*.md'));files.extend([root/'package.json',root/'package-lock.json'])
with zipfile.ZipFile(installer/'payload.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(files):
        entry=zipfile.ZipInfo(p.relative_to(root).as_posix(),date_time=(2026,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o100600<<16;z.writestr(entry,p.read_bytes())
subprocess.run([args.go,'run','github.com/akavel/rsrc@v0.10.2','-manifest','app.manifest','-arch','amd64','-o','app_windows_amd64.syso'],cwd=installer,check=True)
env={**os.environ,'GOOS':'windows','GOARCH':'amd64','CGO_ENABLED':'0'}
target=out/'AI-Headquarters-Setup.exe'
subprocess.run([args.go,'build','-trimpath','-ldflags=-H windowsgui -s -w','-o',str(target),'.'],cwd=installer,env=env,check=True)
(target.with_suffix('.exe.sha256')).write_text(hashlib.sha256(target.read_bytes()).hexdigest()+'  '+target.name+'\n')
print(f'Built {target.name}: {target.stat().st_size:,} bytes. Unsigned; actual Windows installation untested by this build.')
