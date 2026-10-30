self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.pathname.startsWith('/uploads/'))return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open('kx1').then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));
});
