/**
 * Componente: room-manager
 * Gerencia a troca de salas clonando o conteúdo da tag <template> correspondente,
 * com transição em preto e mensagem "Aguardando teleporte…".
 *
 * Princípios ECS:
 * - Parâmetros de transição expostos no schema do componente (fadeMs, minBlackMs, settleFrames, timeoutMs, message)
 *   com valores padrão independentes de escopo global.
 * - Suporte opcional a leitura de parâmetros de window.CONFIG caso existam, sem criar dependência rígida.
 *
 * Fluxo de loadRoom(roomId):
 *   fadeOut   -> tela escurece (a sala antiga ainda existe)
 *   blackHold -> 2 frames totalmente pretos garantem que o preto foi exibido
 *   (troca)   -> descarta a sala antiga e instancia o template (trabalho pesado, tela já preta)
 *   waiting   -> espera modelos .glb e texturas da nova sala terminarem de carregar
 *   settle    -> envia texturas à GPU, compila shaders e aguarda alguns frames estáveis
 *   fadeIn    -> a tela clareia; só então o usuário vê a sala nova
 *
 * O véu e a mensagem são objetos three.js presos à câmera (funcionam dentro do WebXR,
 * ao contrário de overlays HTML). A máquina de estados roda no tick() do A-Frame,
 * porque window.requestAnimationFrame fica suspenso durante uma sessão imersiva.
 */
AFRAME.registerComponent('room-manager', {
    schema: {
        currentRoom: { type: 'string', default: 'hall' },
        fadeMs: { type: 'number', default: 300 },
        minBlackMs: { type: 'number', default: 500 },
        settleFrames: { type: 'number', default: 3 },
        timeoutMs: { type: 'number', default: 15000 },
        message: { type: 'string', default: 'Aguardando teleporte…' }
    },

    init: function () {
        this.container = this.el;
        this.state = 'idle'; // idle | fadeOut | blackHold | waiting | settle | fadeIn
        this.opacity = 0;
        this.overlayAttached = false;
        this.buildOverlay();
        // Primeira sala: a cena já começa preta e clareia quando tudo estiver carregado
        this.loadRoom(this.data.currentRoom, { instant: true });
    },

    remove: function () {
        if (this.veil && this.veil.parent) this.veil.parent.remove(this.veil);
        if (this.label && this.label.parent) this.label.parent.remove(this.label);
    },

    /** Indica se uma troca de sala está em andamento (usado pelos totens). */
    isBusy: function () {
        return this.state !== 'idle';
    },

    /**
     * Inicia a troca de sala. Retorna true se aceitou o pedido, false se ignorou
     * (troca já em andamento, sala inexistente ou já é a sala atual).
     */
    loadRoom: function (roomId, opts) {
        opts = opts || {};
        if (this.state !== 'idle') return false;
        if (!document.getElementById('template-' + roomId)) {
            console.error('[room-manager] template inexistente: template-' + roomId);
            return false;
        }
        if (!opts.instant && roomId === this.data.currentRoom) return false;

        this.targetRoom = roomId;
        this.fadeT = 0;
        if (opts.instant) {
            this.setOverlay(1);
            this.state = 'blackHold';
            this.holdFrames = 0;
        } else {
            this.state = 'fadeOut';
        }
        return true;
    },

    // ---------------------------------------------------------------------------
    // Véu preto + mensagem, presos à câmera
    // ---------------------------------------------------------------------------
    buildOverlay: function () {
        // Véu: esfera invertida ao redor da cabeça
        this.veil = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 12),
            new THREE.MeshBasicMaterial({
                color: 0x000000, side: THREE.BackSide, transparent: true,
                opacity: 0, depthTest: false, depthWrite: false
            })
        );
        this.veil.renderOrder = 9998;
        this.veil.frustumCulled = false;
        this.veil.visible = false;

        // Mensagem: texto desenhado em canvas (aparece na hora, sem esperar a geração de glifos)
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const teleportMsg = this.data.message ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.TELEPORT_MESSAGE) ||
            'Aguardando teleporte…';
        ctx.fillText(teleportMsg, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        this.label = new THREE.Mesh(
            new THREE.PlaneGeometry(0.5, 0.125),
            new THREE.MeshBasicMaterial({
                map: texture, transparent: true, opacity: 0,
                depthTest: false, depthWrite: false
            })
        );
        this.label.position.set(0, 0, -0.8);
        this.label.renderOrder = 9999;
        this.label.frustumCulled = false;
        this.label.visible = false;
    },

    attachOverlay: function () {
        const camera = this.el.sceneEl && this.el.sceneEl.camera;
        if (!camera) return;
        camera.add(this.veil);
        camera.add(this.label);
        this.overlayAttached = true;
        this.setOverlay(this.opacity);
    },

    setOverlay: function (value) {
        this.opacity = value;
        const visible = value > 0.001;
        this.veil.material.opacity = value;
        this.label.material.opacity = value;
        this.veil.visible = visible;
        this.label.visible = visible;
    },

    // ---------------------------------------------------------------------------
    // Máquina de estados da transição
    // ---------------------------------------------------------------------------
    tick: function (time, delta) {
        if (this.state === 'idle') return;
        if (!this.overlayAttached) {
            this.attachOverlay();
            if (!this.overlayAttached) return;
        }
        const dt = Math.min(delta, 100); // um travamento não pode "pular" o fade

        const fadeMs = this.data.fadeMs ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.TELEPORT_FADE_MS) ||
            300;
        const minBlackMs = this.data.minBlackMs ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.TELEPORT_MIN_BLACK_MS) ||
            500;
        const settleFrames = this.data.settleFrames ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.TELEPORT_SETTLE_FRAMES) ||
            3;

        switch (this.state) {
            case 'fadeOut':
                this.fadeT += dt;
                this.setOverlay(Math.min(1, this.fadeT / fadeMs));
                if (this.opacity >= 1) {
                    this.state = 'blackHold';
                    this.holdFrames = 0;
                }
                break;

            case 'blackHold':
                this.setOverlay(1);
                if (++this.holdFrames >= 2) this.swapRoom();
                break;

            case 'waiting':
                this.checkLoading();
                break;

            case 'settle':
                if (++this.settleFrames >= settleFrames &&
                    performance.now() - this.blackStart >= minBlackMs) {
                    this.state = 'fadeIn';
                    this.fadeT = 0;
                }
                break;

            case 'fadeIn':
                this.fadeT += dt;
                this.setOverlay(Math.max(0, 1 - this.fadeT / fadeMs));
                if (this.opacity <= 0) {
                    this.state = 'idle';
                    this.el.emit('room-ready', { room: this.data.currentRoom });
                }
                break;
        }
    },

    /** Descarta a sala antiga e instancia o template da nova (executado com a tela preta). */
    swapRoom: function () {
        const roomId = this.targetRoom;
        this.blackStart = performance.now();

        this.disposeContainer();
        // Registro de modelos compartilhados (asset-model com clonagem), se existir
        if (typeof window !== 'undefined' && typeof window.modelRegistry !== 'undefined' && window.modelRegistry.clear) {
            window.modelRegistry.clear();
        } else if (typeof modelRegistry !== 'undefined' && modelRegistry.clear) {
            modelRegistry.clear();
        }

        const template = document.getElementById('template-' + roomId);
        const fragment = document.importNode(template.content, true);
        const root = fragment.firstElementChild;

        this.root = root;
        this.rootLoaded = false;
        this.doneModels = new WeakSet();
        this.doneTextures = new WeakSet();

        if (root) {
            // Os listeners são registrados ANTES de inserir a sala, para não perder eventos rápidos
            const markModel = (e) => {
                this.doneModels.add(e.target);
                if (e.type === 'model-error') console.warn('[room-manager] falha ao carregar modelo:', e.detail && e.detail.src);
            };
            root.addEventListener('model-loaded', markModel);
            root.addEventListener('model-error', markModel);
            root.addEventListener('materialtextureloaded', (e) => this.doneTextures.add(e.target));
            root.addEventListener('loaded', (e) => { if (e.target === root) this.rootLoaded = true; });
        }

        this.container.appendChild(fragment);
        this.data.currentRoom = roomId;
        this.state = root ? 'waiting' : 'settle';
        this.settleFrames = 0;
    },

    /** Libera geometrias, materiais e texturas da sala anterior e remove seus elementos. */
    disposeContainer: function () {
        this.container.querySelectorAll('[sound]').forEach(function (el) {
            var soundComp = el.components && el.components.sound;
            if (soundComp) {
                soundComp.stopSound();
                soundComp.mustPlay = false;
                soundComp.data.autoplay = false;
            }
        });
        this.container.object3D.traverse(function (node) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(function (mat) {
                    Object.keys(mat).forEach(function (key) {
                        if (mat[key] && mat[key].isTexture) mat[key].dispose();
                    });
                    mat.dispose();
                });
            }
        });
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    },

    /** Lista o que ainda falta carregar na sala nova (vazio = tudo pronto). */
    listPending: function () {
        if (!this.rootLoaded) return ['sala ainda sendo instanciada'];
        const pending = [];
        this.root.querySelectorAll('[gltf-model], [asset-model]').forEach((el) => {
            if (!this.doneModels.has(el)) pending.push('modelo ' + (el.id || el.tagName));
        });
        this.root.querySelectorAll('*').forEach((el) => {
            const material = el.components && el.components.material;
            const src = material && material.data && material.data.src;
            // Só texturas de arquivo; vídeos (src '#id') são ignorados
            if (typeof src === 'string' && src && src.charAt(0) !== '#' && !this.doneTextures.has(el)) {
                pending.push('textura ' + src);
            }
        });
        return pending;
    },

    checkLoading: function () {
        const timeoutMs = this.data.timeoutMs ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.TELEPORT_TIMEOUT_MS) ||
            15000;
        const pending = this.listPending();
        if (pending.length === 0) {
            this.finishLoading();
        } else if (performance.now() - this.blackStart > timeoutMs) {
            console.warn('[room-manager] tempo esgotado; seguindo sem:', pending);
            this.finishLoading();
        }
    },

    finishLoading: function () {
        this.preUpload();
        console.log('[room-manager] sala "' + this.data.currentRoom + '" pronta em ' +
            Math.round(performance.now() - this.blackStart) + ' ms');
        this.state = 'settle';
        this.settleFrames = 0;
    },

    /**
     * Envia as texturas da sala nova à GPU e compila os shaders enquanto a tela está preta.
     * Sem isso, esse trabalho ocorre no primeiro frame visível e causa engasgo.
     */
    preUpload: function () {
        const sceneEl = this.el.sceneEl;
        if (!sceneEl) return;
        const renderer = sceneEl.renderer;
        if (!renderer || !this.root) return;
        try {
            this.root.object3D.traverse(function (node) {
                if (!node.material) return;
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(function (mat) {
                    Object.keys(mat).forEach(function (key) {
                        const tex = mat[key];
                        if (tex && tex.isTexture && tex.image && !tex.isVideoTexture) {
                            renderer.initTexture(tex);
                        }
                    });
                });
            });
            renderer.compile(sceneEl.object3D, sceneEl.camera);
        } catch (err) {
            console.warn('[room-manager] pré-carregamento na GPU falhou:', err);
        }
    }
});
