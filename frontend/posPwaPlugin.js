import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Small static-only PWA. Product data and transactions never enter HTTP caches.
// Default service-worker update lifecycle waits for old tabs to close; no
// skipWaiting, no IndexedDB deletion, and no mid-sale forced reload.
export default function posPwaPlugin() {
  let root;
  return {
    name:'10th-west-pos-shell',apply:'build',enforce:'post',
    configResolved(config){root=config.root;},
    transformIndexHtml(html){
      return html.replace('</head>','<link rel="manifest" href="/pos.webmanifest" /></head>');
    },
    generateBundle(_,bundle){
      const logo=fs.readFileSync(path.join(root,'public/brand/10th-west-logo.png')).toString('base64');
      this.emitFile({type:'asset',fileName:'pos-icon.svg',source:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1278 1278"><rect width="1278" height="1278" fill="#090B0F"/><image x="24" width="1230" height="1278" href="data:image/png;base64,${logo}"/></svg>`});
      this.emitFile({type:'asset',fileName:'pos.webmanifest',source:JSON.stringify({id:'/pos',name:'10th West POS',short_name:'10th West POS',start_url:'/#/pos',scope:'/',display:'standalone',background_color:'#FFFFFF',theme_color:'#090B0F',icons:[{src:'/pos-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]})});
      const publicAssets=[];
      const visit=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(/\.(woff2?|css|png|svg|ico)$/.test(entry.name))publicAssets.push('/'+path.relative(path.join(root,'public'),file).replaceAll('\\','/'));}};
      for(const dir of ['fonts','brand'])visit(path.join(root,'public',dir));
      // Cache only emitted app code/styles and explicit essential public assets.
      const assets=[...new Set(['/index.html','/pos.webmanifest','/pos-icon.svg','/images/product-fallback.svg',...Object.keys(bundle).filter(f=>/\.(js|css|html)$/.test(f)).map(f=>'/'+f),...publicAssets])];
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify(assets)+fs.readFileSync(new URL(import.meta.url)));
      fingerprint.update(String(bundle['index.html']?.source || ''));
      for(const asset of publicAssets)fingerprint.update(fs.readFileSync(path.join(root,'public',asset.slice(1))));
      const revision=fingerprint.digest('hex').slice(0,16);
      this.emitFile({type:'asset',fileName:'pos-sw.js',source:`
const CACHE='10th-west-pos-shell-${revision}';
const ASSETS=${JSON.stringify(assets)};
// Existing public styling runtime is the sole cross-origin cache entry. Its
// no-CORS response is deliberately opaque; never apply this to API responses.
const STYLE_RUNTIME='https://cdn.tailwindcss.com/';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async cache=>{
 await cache.addAll(ASSETS.map(url=>new Request(url,{credentials:'omit',cache:'reload'})));
 const style=await fetch(new Request(STYLE_RUNTIME,{mode:'no-cors',credentials:'omit',cache:'reload'}));
 if(style.type!=='opaque'&&!style.ok)throw new Error('Styling runtime unavailable');
 await cache.put(STYLE_RUNTIME,style);
})));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('10th-west-pos-shell-')&&key!==CACHE).map(key=>caches.delete(key))))])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method==='GET'&&url.href===STYLE_RUNTIME){event.respondWith(caches.open(CACHE).then(cache=>cache.match(STYLE_RUNTIME)).then(cached=>cached||fetch(event.request)));return;}
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 const target=event.request.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html')?'/index.html':url.pathname;
 if(!ASSETS.includes(target))return;
 event.respondWith(caches.open(CACHE).then(cache=>cache.match(target)).then(cached=>cached||fetch(event.request)));
});`});
    }
  };
}
