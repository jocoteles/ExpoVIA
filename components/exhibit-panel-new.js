/**
 * Componente: exhibit-panel-new
 * Exibe uma imagem ou vídeo (detectado pela extensão do arquivo) com dimensões configuráveis,
 * e opcionalmente uma moldura em glTF que acompanha proporcionalmente o tamanho da mídia.
 *
 * Princípios ECS:
 * - Resolução de caminho base (basePath) configurável via schema, com fallback seguro para window.CONFIG.ASSETS_PATH ou 'assets/'.
 * - Sem dependência direta de variáveis globais externas.
 */
AFRAME.registerComponent('exhibit-panel-new', {
    schema: {
        src: { type: 'string' },
        loop: { type: 'boolean', default: true }, // autoreplay do vídeo; ignorado para imagem
        width: { type: 'number', default: 0.5 },
        height: { type: 'number', default: NaN }, // NaN = calculada automaticamente pela proporção original

        frameSrc: { type: 'string', default: '' },
        frameDepth: { type: 'number', default: 0.02 },
        frameWidthRatio: { type: 'number', default: 1.15 },
        frameHeightRatio: { type: 'number', default: 1.15 },
        basePath: { type: 'string', default: 'assets/' }
    },

    init: function () {
        const d = this.data;
        const basePath = d.basePath ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.ASSETS_PATH) ||
            'assets/';

        const resolve = (path) => {
            if (!path) return '';
            if (path.startsWith('http')) return path;
            if (path.startsWith('/')) return path.slice(1);
            if (path.startsWith('assets/')) return path;
            return basePath + path;
        };

        const isVideo = /\.(mp4|webm|ogv|mov)$/i.test(d.src);
        let currentHeight = !isNaN(d.height) ? d.height : d.width;

        this.el.setAttribute('geometry', { primitive: 'plane', width: d.width, height: currentHeight });

        // Função de ajuste da escala e renderização da moldura
        const updateFrame = () => {
            if (!this.frame) return;
            const obj = this.frame.getObject3D('mesh');
            if (!obj) return;

            // Oculta o canvas opaco interno do modelo glTF para evitar sobreposição na pintura
            obj.traverse((child) => {
                if (child.isMesh && child.name.toLowerCase().includes('canvas')) {
                    child.visible = false;
                }
            });

            // Calcula o tamanho original da moldura no seu próprio espaço local
            const box = new THREE.Box3();
            obj.updateWorldMatrix(true, true);
            const invWorld = obj.matrixWorld.clone().invert();
            obj.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    if (!child.geometry.boundingBox) {
                        child.geometry.computeBoundingBox();
                    }
                    const childMat = child.matrixWorld.clone().premultiply(invWorld);
                    const childBox = child.geometry.boundingBox.clone().applyMatrix4(childMat);
                    box.union(childBox);
                }
            });

            const size = new THREE.Vector3();
            if (!box.isEmpty()) {
                box.getSize(size);
            }

            const baseW = size.x > 0 ? size.x : 1;
            const baseH = size.y > 0 ? size.y : 1;

            const sx = (d.width / baseW) * d.frameWidthRatio;
            const sy = (currentHeight / baseH) * d.frameHeightRatio;
            const sz = (sx + sy) / 2;

            this.frame.setAttribute('scale', { x: sx, y: sy, z: sz });
        };

        let hasUpdatedSize = false;
        const updateHeightAndFrame = (naturalW, naturalH) => {
            if (naturalW && naturalH && !hasUpdatedSize) {
                hasUpdatedSize = true;
                currentHeight = !isNaN(d.height) ? d.height : d.width * (naturalH / naturalW);
                this.el.setAttribute('geometry', 'height', currentHeight);
                updateFrame();
            }
        };

        if (isVideo) {
            let sceneEl = this.el.sceneEl || (typeof document !== 'undefined' && document.querySelector('a-scene'));
            let assets = sceneEl ? sceneEl.querySelector('a-assets') : null;
            if (!assets && sceneEl) {
                assets = document.createElement('a-assets');
                sceneEl.appendChild(assets);
            }
            const video = document.createElement('video');
            const videoId = 'exhibit-video-' + Math.random().toString(36).slice(2, 9);
            video.setAttribute('id', videoId);
            video.setAttribute('src', resolve(d.src));
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('crossorigin', 'anonymous');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.defaultMuted = true;
            video.autoplay = true;
            video.loop = d.loop;
            video.preload = 'auto';

            const checkVideoSize = () => {
                if (video.videoWidth && video.videoHeight) {
                    updateHeightAndFrame(video.videoWidth, video.videoHeight);
                }
            };

            video.addEventListener('loadedmetadata', checkVideoSize, { once: true });
            video.addEventListener('loadeddata', checkVideoSize, { once: true });
            video.addEventListener('canplay', checkVideoSize, { once: true });

            const playVideo = () => {
                video.muted = true;
                const p = video.play();
                if (p !== undefined) {
                    p.catch(() => {
                        const onUserGesture = () => {
                            video.play().catch(() => { });
                            window.removeEventListener('click', onUserGesture);
                            window.removeEventListener('touchstart', onUserGesture);
                        };
                        window.addEventListener('click', onUserGesture);
                        window.addEventListener('touchstart', onUserGesture);
                    });
                }
            };

            video.addEventListener('canplay', playVideo, { once: true });
            if (assets) {
                assets.appendChild(video);
            } else {
                document.body.appendChild(video);
            }
            this.el.setAttribute('material', { shader: 'flat', src: '#' + videoId });
            this.videoEl = video;
            playVideo();
        } else {
            this.el.setAttribute('material', { shader: 'flat', src: resolve(d.src) });
        }

        // Moldura opcional em glTF
        if (d.frameSrc) {
            this.frame = document.createElement('a-entity');
            this.frame.setAttribute('gltf-model', resolve(d.frameSrc));
            this.frame.setAttribute('position', { x: 0, y: 0, z: -d.frameDepth });
            this.frame.addEventListener('model-loaded', () => updateFrame());
            this.el.appendChild(this.frame);
        }

        // Altura automática (proporção original) e escala da moldura, resolvidas quando a textura carrega
        this.el.addEventListener('materialtextureloaded', (e) => {
            const tex = e.detail && e.detail.texture;
            if (tex) {
                tex.generateMipmaps = false;
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
            }
            const img = tex && tex.image;
            if (img) {
                const naturalW = img.videoWidth || img.naturalWidth || img.width;
                const naturalH = img.videoHeight || img.naturalHeight || img.height;
                updateHeightAndFrame(naturalW, naturalH);
            }
        });
    },

    remove: function () {
        if (this.videoEl) {
            this.videoEl.pause();
            this.videoEl.removeAttribute('src');
            this.videoEl.load();
            if (this.videoEl.parentElement) {
                this.videoEl.parentElement.removeChild(this.videoEl);
            }
        }
    }
});
