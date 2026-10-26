/**
 * =========================================================================
 * GERENCIADOR DE PWA E SERVICE WORKER
 * =========================================================================
 * Ativação do PWA e Service Worker EXCLUSIVAMENTE no GitHub Pages.
 * Nos modos locais (Wi-Fi ou cabo/adb), o Service Worker permanece desativado
 * para evitar problemas de cache e garantir carregamento direto e inspeção (Ctrl+Alt+i).
 */

const isGitHubPages = location.hostname.endsWith('github.io');

if ('serviceWorker' in navigator) {
    if (isGitHubPages) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('[PWA] Service Worker registrado. Escopo:', reg.scope);
                initTemplateAssetDiscovery(reg);
            }).catch(err => {
                console.warn('[PWA] Falha ao registrar Service Worker:', err);
            });
        });
    } else {
        console.log('[PWA] Ambiente local/desenvolvimento: Service Worker desativado.');
        navigator.serviceWorker.getRegistrations().then(regs => {
            for (let r of regs) r.unregister();
        });
    }
}

/**
 * Varre todas as tags <template> do DOM após o carregamento da página,
 * extrai todas as URLs de recursos (modelos 3D, texturas, áudios e vídeos)
 * e envia a lista ao Service Worker para download em segundo plano.
 */
function initTemplateAssetDiscovery(reg) {
    setTimeout(() => {
        const urls = new Set();
        const mediaExts = ['.glb', '.gltf', '.webp', '.jpg', '.jpeg', '.png', '.mp3', '.m4a', '.mp4', '.webm'];

        function extractFromText(text) {
            if (!text) return;
            const parts = text.split(/[;\s,'"()]+/);
            for (let part of parts) {
                part = part.trim();
                if (!part) continue;
                if (mediaExts.some(ext => part.toLowerCase().endsWith(ext))) {
                    if (part.includes(':')) {
                        part = part.split(':')[1].trim();
                    }
                    if (part.startsWith('/')) part = part.slice(1);
                    if (!part.startsWith('http') && !part.startsWith('assets/') && !part.startsWith('libs/')) {
                        const base = (window.CONFIG && window.CONFIG.ASSETS_PATH) ? window.CONFIG.ASSETS_PATH : 'assets/';
                        part = base + part;
                    }
                    urls.add(part);
                }
            }
        }

        document.querySelectorAll('template').forEach(tpl => {
            const content = tpl.content;
            content.querySelectorAll('*').forEach(el => {
                for (let attr of el.attributes) {
                    if (mediaExts.some(ext => attr.value.toLowerCase().includes(ext))) {
                        extractFromText(attr.value);
                    }
                }
            });
        });

        // Inclui arquivos dependentes de molduras glTF (binário e texturas)
        urls.forEach(url => {
            if (url.endsWith('fancy_picture_frame_01_4k.gltf')) {
                const dir = url.substring(0, url.lastIndexOf('/'));
                urls.add(dir + '/fancy_picture_frame_01.bin');
                ['canvas_diff_4k.jpg', 'canvas_nor_gl_4k.jpg', 'canvas_rough_4k.jpg', 'diff_4k.jpg', 'nor_gl_4k.jpg', 'rough_4k.jpg'].forEach(tex => {
                    urls.add(dir + '/textures/fancy_picture_frame_01_' + tex);
                });
            } else if (url.endsWith('fancy_picture_frame_02_4k.gltf')) {
                const dir = url.substring(0, url.lastIndexOf('/'));
                urls.add(dir + '/fancy_picture_frame_02.bin');
                ['canvas_diff_4k.jpg', 'canvas_nor_gl_4k.jpg', 'canvas_rough_4k.jpg', 'diff_4k.jpg', 'nor_gl_4k.jpg', 'rough_4k.jpg'].forEach(tex => {
                    urls.add(dir + '/textures/fancy_picture_frame_02_' + tex);
                });
            }
        });

        const assetList = Array.from(urls);
        console.log(`[PWA] Descobertos ${assetList.length} assets através das tags <template>. Sincronizando com Service Worker...`);

        const targetWorker = reg.active || reg.installing || reg.waiting || navigator.serviceWorker.controller;
        if (targetWorker) {
            targetWorker.postMessage({ type: 'CACHE_ASSETS', urls: assetList });
        }

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'CACHE_PROGRESS') {
                console.log(`[PWA Precache] Progresso: ${event.data.current}/${event.data.total} assets verificados (${event.data.cached} novos baixados).`);
            }
        });
    }, 1500);
}
