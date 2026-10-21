import {build,transform} from 'esbuild';
import {mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const argument=process.argv.indexOf('--out');const output=resolve(argument<0?join(root,'dist','application'):process.argv[argument+1]);
if(output===root||dirname(output)===output||root.startsWith(output+sep))throw Error('Choose a separate production output folder');
try{const entries=await readdir(output);if(entries.length&&!entries.includes('application-manifest.json'))throw Error('Refusing to replace a non-production folder: '+output)}catch(error){if(error.code!=='ENOENT')throw error}
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
async function put(name,data){const target=join(output,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,data)}
await build({entryPoints:[join(root,'src/server.ts')],outfile:join(output,'runtime/server.mjs'),bundle:true,minify:true,platform:'node',target:'node24',format:'esm',sourcemap:false,legalComments:'none'});
for(const name of await readdir(join(root,'public'))){
 if(!/\.(js|css|html)$/.test(name))continue;
 let value=await readFile(join(root,'public',name),'utf8');
 if(/\.(js|css)$/.test(name))value=(await transform(value,{minify:true,loader:name.endsWith('.css')?'css':'js',target:'es2022',legalComments:'none'})).code;
 await put('public/'+name,value);
}
const vendors={
 'three.module.js':'build/three.module.js','three.core.js':'build/three.core.js',
 'FontLoader.js':'examples/jsm/loaders/FontLoader.js','TextGeometry.js':'examples/jsm/geometries/TextGeometry.js',
 'office-font.json':'examples/fonts/helvetiker_regular.typeface.json',
};
for(const [name,path] of Object.entries(vendors)){
 let value=await readFile(join(root,'node_modules/three',path),'utf8');
 if(name.endsWith('.js'))value=(await transform(value.replace(/from 'three'/g,"from '/vendor/three.module.js'"),{minify:true,loader:'js',target:'es2022',legalComments:'none'})).code;
 await put('vendor/'+name,value);
}
const helper=await readFile(join(root,'scripts/configure-local-ai.mjs'),'utf8');
await put('scripts/configure-local-ai.mjs',(await transform(helper,{minify:true,loader:'js',platform:'node',target:'node24',legalComments:'none'})).code);
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
await put('package.json',JSON.stringify({name:pkg.name,version:pkg.version,private:true,type:'module'}));
await put('THIRD_PARTY_NOTICES.md',await readFile(join(root,'THIRD_PARTY_NOTICES.md')));
const hashes={};async function walk(folder){for(const item of await readdir(join(output,folder),{withFileTypes:true})){const name=folder?folder+'/'+item.name:item.name;if(item.isDirectory())await walk(name);else hashes[name]=createHash('sha256').update(await readFile(join(output,name))).digest('hex')}}await walk('');
await put('application-manifest.json',JSON.stringify({format:1,version:pkg.version,entry:'runtime/server.mjs',files:hashes},null,2));
console.log('Production application built: '+Object.keys(hashes).length+' files. Original source, business data, development documents and source maps excluded.');
