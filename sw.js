// Service Worker: estratégia híbrida + precache dinâmico via varredura de templates
const CACHE_NAME = 'exposicao-virtual-v4'; // incremente sempre que mudar PRECACHE_CORE ou CDN_MAP

// ---------- PRECACHE CORE (mínimo essencial) ----------
// Baixados sempre durante a instalação do Service Worker.
const PRECACHE_CORE = [
    './',
    'index.html',
    'manifest.json',
    'libs/aframe.min.js',
    'libs/aframe-extras.min.js',
    'libs/aframe-environment-component.min.js',
    'libs/aframe-troika-text.min.js',
    'libs/aframe-inspector.min.js',
    'libs/meshopt_decoder.js',
    'libs/models/left.glb',
    'libs/models/right.glb',
    'js/pwa.js',
    'js/config.js',
    'js/audio-unlock.js',
    'components/room-manager.js',
    'components/room-floor.js',
    'components/totem-teleport.js',
    'components/pedestal.js',
    'components/exhibit-panel.js',
    'components/exhibit-panel-new.js',
    'components/wall-panel.js',
    'components/panel-audio.js',
    'components/fullscale-model.js',
    'components/asset-model.js',
    'components/auto-height.js',
    'assets/icon-192.png',
    'assets/icon-512.png'
];

// ---------- Mapeamento explícito CDN -> local ----------
// Chave = hostname + pathname EXATOS, como o navegador envia.
const CDN_MAP = {
    'cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js': 'libs/meshopt_decoder.js',

    // hand-tracking-controls (usado por hand-tracking-grab-controls) — caminho padrão A-Frame 1.8
    'cdn.aframe.io/controllers/oculus-hands/unity/left.glb': 'libs/models/left.glb',
    'cdn.aframe.io/controllers/oculus-hands/unity/right.glb': 'libs/models/right.glb',

    // Fallbacks: se algum dia o A-Frame mudar para v4/ ou hands/ lowPoly
    'cdn.aframe.io/controllers/oculus-hands/v4/left.glb': 'libs/models/left.glb',
    'cdn.aframe.io/controllers/oculus-hands/v4/right.glb': 'libs/models/right.glb',
    'cdn.aframe.io/controllers/hands/leftHandLow.glb': 'libs/models/left.glb',
    'cdn.aframe.io/controllers/hands/rightHandLow.glb': 'libs/models/right.glb',
};

function resolveLocal(reqUrl) {
    const key = reqUrl.hostname + reqUrl.pathname;
    const rel = CDN_MAP[key];
    if (!rel) return null;
    return new URL(rel, self.registration.scope).href;
}

// ---------- INSTALL ----------
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        const results = await Promise.allSettled(
            PRECACHE_CORE.map(async (item) => {
                const url = new URL(item, self.registration.scope).href;
                try {
                    const r = await fetch(url, { cache: 'no-cache' });
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    await cache.put(url, r);
                    return { url, ok: true };
                } catch (err) {
                    console.warn('[SW] Falha precache core:', url, '->', err.message);
                    return { url, ok: false, err: err.message };
                }
            })
        );

        const falhas = results
            .filter(x => x.value && !x.value.ok)
            .map(x => x.value.url);
        if (falhas.length) {
            console.warn('[SW] Falhas no precache core:', falhas.length, falhas);
        } else {
            console.log('[SW] Precache core completo:', PRECACHE_CORE.length, 'itens.');
        }

        await self.skipWaiting();
    })());
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ---------- CACHE DINÂMICO DE TEMPLATES (Plano B) ----------
let isDynamicCaching = false;

async function notifyClients(msg) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const client of clients) {
        try {
            client.postMessage(msg);
        } catch (e) {
            // Ignora cliente fechado
        }
    }
}

async function cacheDynamicAssets(urls, client) {
    if (!Array.isArray(urls) || !urls.length || isDynamicCaching) return;
    isDynamicCaching = true;

    try {
        const cache = await caches.open(CACHE_NAME);
        const total = urls.length;

        // 1. Identifica quais assets NÃO estão no cache (demanda novo cache / nova versão)
        const pendingUrls = [];
        for (const relUrl of urls) {
            const fullUrl = new URL(relUrl, self.registration.scope).href;
            const existing = await cache.match(fullUrl);
            if (!existing) {
                pendingUrls.push(fullUrl);
            }
        }

        // Se todos os assets já estão em cache, nenhuma mensagem visual é necessária
        if (pendingUrls.length === 0) {
            console.log(`[SW] Todos os ${total} assets das salas já estão no cache. Nenhuma sincronização necessária.`);
            return;
        }

        console.log(`[SW] Nova versão / assets não cacheados detectados: baixando ${pendingUrls.length} de ${total} arquivos...`);
        await notifyClients({
            type: 'CACHE_START',
            totalToDownload: pendingUrls.length,
            total: total
        });

        let cachedCount = 0;
        for (let i = 0; i < pendingUrls.length; i++) {
            const fullUrl = pendingUrls[i];
            try {
                const res = await fetch(fullUrl, { cache: 'no-cache' });
                if (res && res.status === 200) {
                    await cache.put(fullUrl, res);
                    cachedCount++;
                }
            } catch (err) {
                console.warn('[SW] Falha ao cachear asset de sala:', fullUrl, err.message);
            }

            // Envia feedback de progresso a cada 5 arquivos ou ao concluir
            if ((i + 1) % 5 === 0 || i + 1 === pendingUrls.length) {
                await notifyClients({
                    type: 'CACHE_PROGRESS',
                    current: i + 1,
                    total: pendingUrls.length,
                    cached: cachedCount
                });
            }
        }

        console.log(`[SW] Sincronização concluída: ${cachedCount} novos baixados de ${pendingUrls.length} pendentes.`);
        await notifyClients({
            type: 'CACHE_COMPLETE',
            cached: cachedCount,
            total: pendingUrls.length
        });
    } finally {
        isDynamicCaching = false;
    }
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CACHE_ASSETS' && Array.isArray(event.data.urls)) {
        event.waitUntil(cacheDynamicAssets(event.data.urls, event.source));
    }
});

// ---------- HELPERS ----------

function isImmutable(url) {
    const u = new URL(url);
    if (u.pathname.includes('/libs/')) return true;
    if (/\.[0-9a-f]{6,}\.(js|css|woff2?|png|jpg|webp|glb|gltf)$/i.test(u.pathname)) return true;
    return false;
}

function isMedia(url) {
    return /\.(glb|gltf|bin|webm|mp4|m4a|mp3|png|jpg|jpeg|webp|svg)$/i.test(new URL(url).pathname);
}

// Fatia um Response em cache para atender a um Range request (offline)
async function rangeFromCache(request, cachedResponse) {
    const rangeHeader = request.headers.get('range');
    if (!rangeHeader) return cachedResponse;

    const buffer = await cachedResponse.arrayBuffer();
    const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (!match) return cachedResponse;

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : buffer.byteLength - 1;
    const slice = buffer.slice(start, end + 1);

    const headers = new Headers(cachedResponse.headers);
    headers.set('Content-Range', `bytes ${start}-${end}/${buffer.byteLength}`);
    headers.set('Content-Length', String(slice.byteLength));
    headers.set('Accept-Ranges', 'bytes');

    return new Response(slice, {
        status: 206,
        statusText: 'Partial Content',
        headers
    });
}

// ---------- FETCH ----------
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || !req.url.startsWith('http')) return;

    const reqUrl = new URL(req.url);
    const sameOrigin = reqUrl.origin === self.location.origin;

    // 1) Requisições para CDN mapeadas → arquivo local
    const localUrl = resolveLocal(reqUrl);
    if (localUrl) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(localUrl);
            if (cached) return cached;

            try {
                const res = await fetch(localUrl);
                if (res && res.status === 200) {
                    cache.put(localUrl, res.clone());
                }
                return res;
            } catch (err) {
                return new Response('Recurso local não encontrado: ' + localUrl, {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }
        })());
        return;
    }

    // 2) Imutáveis e mídia (mesma origem) → CACHE-FIRST
    if (sameOrigin && (isImmutable(req.url) || isMedia(req.url))) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(req.url);

            if (cached) {
                return req.headers.get('range') ? rangeFromCache(req, cached) : cached;
            }

            try {
                const fetchReq = isMedia(req.url)
                    ? new Request(req.url, { method: 'GET', credentials: 'same-origin' })
                    : req;

                const res = await fetch(fetchReq);
                if (res && res.status === 200 && sameOrigin) {
                    cache.put(req.url, res.clone());
                }
                return res;
            } catch (err) {
                return new Response('Offline e sem cópia em cache para este recurso.', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }
        })());
        return;
    }

    // 3) HTML / navegação / outros → NETWORK-FIRST com fallback
    event.respondWith((async () => {
        try {
            const networkResponse = await fetch(req);
            if (networkResponse && networkResponse.status === 200 && sameOrigin) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((c) => c.put(req, clone));
            }
            return networkResponse;
        } catch (err) {
            let cached = await caches.match(req);
            if (!cached) cached = await caches.match(req.url);

            if (!cached && req.mode === 'navigate') {
                const indexUrl = new URL('index.html', self.registration.scope).href;
                const rootUrl = new URL('./', self.registration.scope).href;
                cached = (await caches.match(indexUrl)) || (await caches.match(rootUrl));
            }

            if (cached) return cached;

            return new Response('Offline e sem dados em cache para este recurso.', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    })());
});