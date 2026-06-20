const CACHE = "kwork-feed-v1";
const ASSETS = ["./","./index.html","./style.css","./app.js","./parser.js","./storage.js",
  "./manifest.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE).then((c)=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then((ks)=>Promise.all(ks.filter((k)=>k!==CACHE).map((k)=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",(e)=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then((c)=>c||fetch(e.request)));});
