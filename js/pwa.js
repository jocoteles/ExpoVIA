/**
 * =========================================================================
 * GERENCIADOR DE PWA E SERVICE WORKER
 * =========================================================================
 * Ativação do PWA e Service Worker EXCLUSIVAMENTE no GitHub Pages.
 * Nos modos locais (Wi-Fi ou cabo/adb), o Service Worker permanece desativado
 * para evitar problemas de cache e garantir carregamento direto e inspeção (Ctrl+Alt+i).
 */

const isGitHubPages = location.hostname.endsWith('github.io') || location.search.includes('pwa=1');

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
            if (!event.data) return;

            if (event.data.type === 'CACHE_START') {
                console.log(`[PWA] Nova versão / assets detectados (${event.data.totalToDownload} pendentes). Baixando...`);
                updateCacheHUD('Assets das salas em carregamento...');
            } else if (event.data.type === 'CACHE_PROGRESS') {
                console.log(`[PWA Precache] Progresso: ${event.data.current}/${event.data.total} assets baixados.`);
            } else if (event.data.type === 'CACHE_COMPLETE') {
                console.log('[PWA Precache] Sincronização concluída com sucesso.');
                updateCacheHUD('Assets carregados!', true);
            }
        });
    }, 1500);
}

/**
 * =========================================================================
 * MENSAGEM HUD TRANSLÚCIDA EM VR (Acompanha a cabeça do usuário)
 * =========================================================================
 * Exibe uma notificação translúcida na câmera do usuário informando o status
 * do carregamento em segundo plano e a remove após 3 segundos da conclusão.
 */
let hudEntity = null;
let hudTimeout = null;

function updateCacheHUD(text, isComplete = false) {
    const head = document.getElementById('head') || document.querySelector('a-camera');
    if (!head) {
        setTimeout(() => updateCacheHUD(text, isComplete), 200);
        return;
    }

    if (!hudEntity) {
        hudEntity = document.createElement('a-entity');
        hudEntity.setAttribute('id', 'hud-cache-notification');
        // Fixado na câmera: 1.1m à frente, -0.22m em Y (campo visual confortável, sem bloquear a visão direta)
        hudEntity.setAttribute('position', '0 -0.22 -1.1');

        // Fundo sutil translúcido para garantir contraste e legibilidade em qualquer fundo
        const bg = document.createElement('a-plane');
        bg.setAttribute('id', 'hud-cache-bg');
        bg.setAttribute('width', '0.78');
        bg.setAttribute('height', '0.12');
        bg.setAttribute('material', 'color: #0b1528; opacity: 0.55; transparent: true');
        bg.setAttribute('position', '0 0 -0.005');
        hudEntity.appendChild(bg);

        // Texto translúcido via Troika-text
        const txt = document.createElement('a-troika-text');
        txt.setAttribute('id', 'hud-cache-text');
        txt.setAttribute('value', text);
        txt.setAttribute('align', 'center');
        txt.setAttribute('anchor', 'center');
        txt.setAttribute('baseline', 'center');
        txt.setAttribute('font-size', '0.038');
        txt.setAttribute('color', '#00d2ff');
        txt.setAttribute('fill-opacity', '0.85');
        hudEntity.appendChild(txt);

        head.appendChild(hudEntity);
    } else {
        const txt = hudEntity.querySelector('#hud-cache-text');
        if (txt) {
            txt.setAttribute('value', text);
            if (isComplete) {
                txt.setAttribute('color', '#50fa7b');
                txt.setAttribute('fill-opacity', '0.9');
            }
        }
    }

    if (isComplete) {
        if (hudTimeout) clearTimeout(hudTimeout);
        hudTimeout = setTimeout(() => {
            if (hudEntity && hudEntity.parentNode) {
                hudEntity.parentNode.removeChild(hudEntity);
                hudEntity = null;
            }
        }, 3000);
    }
}

