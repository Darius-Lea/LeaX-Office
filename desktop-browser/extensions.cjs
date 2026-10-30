'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createExtensionManager({root, browserSession, dialog, getWindow, onChange}) {
  const active = [];
  fs.mkdirSync(root, {recursive:true, mode:0o700});
  function inspect(folder) {
    const manifestPath = path.join(folder, 'manifest.json');
    const stat = fs.lstatSync(manifestPath);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('The folder must contain a regular manifest.json under 1 MB.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest.name !== 'string' || !manifest.name.trim() || typeof manifest.version !== 'string' || ![2,3].includes(manifest.manifest_version)) throw new Error('Choose an unpacked Chromium extension with a valid version 2 or 3 manifest.');
    const permissions = [...(manifest.permissions || []), ...(manifest.optional_permissions || [])].filter(value => typeof value === 'string');
    const hosts = [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])].filter(value => typeof value === 'string');
    return {name:manifest.name.slice(0,100),version:manifest.version.slice(0,40),permissions:[...new Set(permissions)],hosts:[...new Set(hosts)]};
  }
  function copyFolder(source, destination) {
    const sourceRoot = fs.realpathSync(source);
    let fileCount = 0, totalBytes = 0;
    function copy(from,to) {
      const stat = fs.lstatSync(from);
      if (stat.isSymbolicLink()) throw new Error('Extension folders containing symbolic links are not supported.');
      if (stat.isDirectory()) {
        fs.mkdirSync(to,{recursive:true,mode:0o700});
        for (const name of fs.readdirSync(from)) copy(path.join(from,name),path.join(to,name));
        return;
      }
      if (!stat.isFile()) throw new Error('The extension folder contains an unsupported file type.');
      fileCount++; totalBytes += stat.size;
      if (fileCount > 2500 || totalBytes > 50*1024*1024) throw new Error('Extension size limit is 2,500 files and 50 MB.');
      if (!path.resolve(from).toLowerCase().startsWith((sourceRoot+path.sep).toLowerCase())) throw new Error('The extension contains a file outside its selected folder.');
      fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});
      fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
    }
    fs.mkdirSync(destination,{recursive:true,mode:0o700});
    for (const name of fs.readdirSync(sourceRoot)) copy(path.join(sourceRoot,name),path.join(destination,name));
    return inspect(destination);
  }
  function list() { return active.map(({name,version})=>({name,version})); }
  async function loadSaved() {
    for (const directoryName of fs.readdirSync(root)) {
      if (!/^[a-f0-9]{20}$/.test(directoryName)) continue;
      try {
        const directory=path.join(root,directoryName), manifest=inspect(directory);
        const ext=await browserSession.extensions.loadExtension(directory,{allowFileAccess:false});
        active.push({id:ext.id,directory:directoryName,name:manifest.name,version:manifest.version});
      } catch (error) { console.warn('Saved LeaX extension did not load:',directoryName,String(error.message||error)); }
      if (active.length>=8) break;
    }
    onChange(list());
  }
  async function manage() {
    const ownerWindow=getWindow();
    const names=active.length?active.map(item=>item.name+' '+item.version).join('\n'):'None installed';
    const menu=await dialog.showMessageBox(ownerWindow,{type:'info',title:'LeaX AI Browser extensions',message:'Manage extensions',detail:'Installed: '+names+'\n\nLeaX can load unpacked Chromium extension folders with a limited subset of Chrome extension features. Chrome Web Store packages (.crx) and many extensions are not supported. Extensions may read or change websites within their requested permissions. LeaX does not verify extensions; install only ones you trust.',buttons:['Install from folder…','Remove an extension…','Done'],defaultId:2,cancelId:2,noLink:true});
    if(menu.response===0) {
      if(active.length>=8) { await dialog.showMessageBox(ownerWindow,{type:'info',title:'Extension limit',message:'This browser preview supports up to eight installed extensions.',buttons:['OK'],noLink:true});return; }
      const picked=await dialog.showOpenDialog(ownerWindow,{title:'Select an unpacked Chromium extension folder',properties:['openDirectory']});
      if(picked.canceled||!picked.filePaths[0])return;
      const id=crypto.randomBytes(10).toString('hex'),stage=path.join(root,'.install-'+id),destination=path.join(root,id);
      try {
        const manifest=copyFolder(picked.filePaths[0],stage);
        if(active.some(item=>item.name===manifest.name))throw new Error('An extension with this name is already installed. Remove it before installing an update.');
        const requested=[...manifest.permissions.map(value=>'Permission: '+value),...manifest.hosts.map(value=>'Website access: '+value)];
        const approval=await dialog.showMessageBox(ownerWindow,{type:'warning',title:'Review extension permissions',message:'Install '+manifest.name+' '+manifest.version+'?',detail:'This code can affect websites in the browser profile. Requested access:\n\n'+(requested.length?requested.join('\n'):'No manifest permissions are listed; other extension APIs may still be used.')+'\n\nLeaX has not verified this extension. Install it only if you trust its source.',buttons:['Install extension','Cancel'],defaultId:1,cancelId:1,noLink:true});
        if(approval.response!==0){fs.rmSync(stage,{recursive:true,force:true});return;}
        fs.renameSync(stage,destination);
        const ext=await browserSession.extensions.loadExtension(destination,{allowFileAccess:false});
        active.push({id:ext.id,directory:id,name:manifest.name,version:manifest.version});
        onChange(list());
      } catch(error) {
        try{fs.rmSync(stage,{recursive:true,force:true});}catch{}
        try{fs.rmSync(destination,{recursive:true,force:true});}catch{}
        await dialog.showMessageBox(ownerWindow,{type:'error',title:'Extension not installed',message:String(error.message||error),buttons:['OK'],noLink:true});
      }
    } else if(menu.response===1) {
      if(!active.length){await dialog.showMessageBox(ownerWindow,{type:'info',title:'No extensions',message:'There are no extensions to remove.',buttons:['OK'],noLink:true});return;}
      const selected=await dialog.showMessageBox(ownerWindow,{type:'warning',title:'Remove extension',message:'Choose an extension to remove',detail:'Removing an extension does not clear saved website sign-ins.',buttons:[...active.map(item=>item.name),'Cancel'],cancelId:active.length,defaultId:active.length,noLink:true});
      const item=active[selected.response];
      if(item){browserSession.extensions.removeExtension(item.id);active.splice(selected.response,1);fs.rmSync(path.join(root,item.directory),{recursive:true,force:true});onChange(list());}
    }
  }
  return {list,loadSaved,manage};
}
module.exports={createExtensionManager};