"""Build the native Windows x64 GUI setup with an embedded, secret-free app snapshot.
Requires Go >=1.24 and network access to pinned Go modules. No Windows execution occurs.
Usage: python scripts/build-native-installer.py --go /path/to/go
"""
import argparse, hashlib, os, pathlib, subprocess, sys, zipfile
parser=argparse.ArgumentParser();parser.add_argument('--go',default='go');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];installer=root/'installer';out=root/'downloads';out.mkdir(exist_ok=True)
production=root/'dist'/'application'
subprocess.run(['node',str(root/'scripts'/'build-production.mjs'),'--out',str(production)],cwd=root,check=True)
files=[p for p in production.rglob('*') if p.is_file()]
with zipfile.ZipFile(installer/'payload.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(files):
        entry=zipfile.ZipInfo(p.relative_to(production).as_posix(),date_time=(2026,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o100600<<16;z.writestr(entry,p.read_bytes())
subprocess.run([args.go,'test','./...'],cwd=installer,env={**os.environ,'LEAX_TEST_APPLICATION_ARCHIVE':str(installer/'payload.zip')},check=True)
subprocess.run([args.go,'run','github.com/akavel/rsrc@v0.10.2','-manifest','app.manifest','-arch','amd64','-o','app_windows_amd64.syso'],cwd=installer,check=True)
env={**os.environ,'GOOS':'windows','GOARCH':'amd64','CGO_ENABLED':'0'}
target=out/'AI-Headquarters-Setup.exe'
subprocess.run([args.go,'build','-trimpath','-ldflags=-H windowsgui -s -w','-o',str(target),'.'],cwd=installer,env=env,check=True)
(target.with_suffix('.exe.sha256')).write_text(hashlib.sha256(target.read_bytes()).hexdigest()+'  '+target.name+'\n')
subprocess.run([sys.executable,str(root/'scripts'/'verify-installer.py')],cwd=root,check=True)
print(f'Built {target.name}: {target.stat().st_size:,} bytes. Unsigned; actual Windows installation untested by this build.')
