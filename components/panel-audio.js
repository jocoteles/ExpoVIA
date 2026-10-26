/**
 * Sistema e Componente: panel-audio
 * Toca a locução de um painel quando o usuário o toca com a ponta do indicador (hand tracking)
 * ou clica nele (testes no desktop). Funciona em entidades com wall-panel ou exhibit-panel.
 *
 * Princípios ECS:
 * - O controle de áudio ativo único (singleton de reprodução) é gerenciado pelo Sistema 'panel-audio',
 *   eliminando variáveis globais soltas.
 * - O caminho base de áudio é parametrizável via schema (basePath), com fallback gracioso para window.CONFIG.ASSETS_PATH.
 * - Desbloqueio seguro do Web Audio sem dependência forçada de funções globais externas.
 *
 * Comportamentos:
 * - Toque do dedo indicador ou clique disparam a narração (uma vez por toque).
 * - Só uma narração toca por vez; tocar outro painel interrompe a anterior.
 * - Se o painel já está narrando, um novo toque nele é ignorado.
 * - Ao trocar de sala, o painel é removido e sua narração é interrompida.
 * - Gestão de sessão por visitante via WebXR / Page Visibility:
 *   - Se o óculos fica fora da cabeça (ou a aplicação oculta) por mais de 2 segundos, o sistema
 *     assume troca de visitante e reseta o ciclo.
 *   - Somente o primeiro acesso ao Hall de cada visitante toca o áudio introdutório (evita repetições cansativas ao retornar).
 *   - Se a troca de usuário ocorrer enquanto se estiver no Hall, o áudio toca automaticamente para o novo visitante assim que recoloca o óculos.
 *   - Ajustes rápidos no rosto (< 2s) apenas pausam e retomam a narração sem reiniciar a experiência.
 * - Se o navegador bloquear o autoplay por falta de gesto do usuário, o componente
 *   agenda retry para o primeiro gesto (clique, toque, tecla ou enter-vr).
 */

AFRAME.registerSystem('panel-audio', {
    init: function () {
        this.activeAudio = null;
        this.pausedAudio = null;
        this.hallAudioPlayed = false;
        this.hallAudioComp = null;
        this.hiddenStartTime = null;
        this._boundSession = null;

        this.setupVisibilityTracking();
    },

    registerHallAudio: function (comp) {
        this.hallAudioComp = comp;
    },

    unregisterHallAudio: function (comp) {
        if (this.hallAudioComp === comp) {
            this.hallAudioComp = null;
        }
    },

    setActiveAudio: function (audioComp) {
        if (this.activeAudio && this.activeAudio !== audioComp) {
            this.activeAudio.stopPlayback();
        }
        this.activeAudio = audioComp;
    },

    getActiveAudio: function () {
        return this.activeAudio;
    },

    clearActiveAudio: function (audioComp) {
        if (this.activeAudio === audioComp) {
            this.activeAudio = null;
        }
        if (this.pausedAudio === audioComp) {
            this.pausedAudio = null;
        }
    },

    stopAll: function () {
        if (this.activeAudio) {
            this.activeAudio.stopPlayback();
            this.activeAudio = null;
        }
        if (this.pausedAudio) {
            this.pausedAudio.stopPlayback();
            this.pausedAudio = null;
        }
    },

    isUserInHall: function () {
        const scene = this.sceneEl || (typeof document !== 'undefined' && document.querySelector('a-scene'));
        if (!scene) return false;
        const container = scene.querySelector('[room-manager]') || scene.querySelector('#room-container');
        const rm = container && container.components && container.components['room-manager'];
        if (rm && rm.data) {
            return rm.data.currentRoom === 'hall' && rm.state === 'idle';
        }
        return !!scene.querySelector('#hall-content');
    },

    setupVisibilityTracking: function () {
        // 1. Rastreamento da sessão WebXR (Meta Quest e outros HMDs)
        const bindSession = () => {
            const session = this.sceneEl.xrSession ||
                (this.sceneEl.renderer && this.sceneEl.renderer.xr && this.sceneEl.renderer.xr.getSession && this.sceneEl.renderer.xr.getSession());
            if (session && this._boundSession !== session) {
                this._boundSession = session;
                session.addEventListener('visibilitychange', () => {
                    this.handleVisibilityChange(session.visibilityState);
                });
            }
        };

        this.sceneEl.addEventListener('enter-vr', () => {
            bindSession();
            setTimeout(bindSession, 100);
        });

        this.sceneEl.addEventListener('exit-vr', () => {
            this._boundSession = null;
            this.handleVisibilityChange('hidden');
        });

        if (this.sceneEl.is('vr-mode')) {
            bindSession();
        }

        // 2. Rastreamento padrão do documento (desktop, abas do navegador)
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                this.handleVisibilityChange(document.visibilityState);
            });
        }
    },

    handleVisibilityChange: function (state) {
        const isVisible = (state === 'visible');

        if (!isVisible) {
            // Óculos fora da cabeça (ou app oculto)
            if (this.hiddenStartTime === null) {
                this.hiddenStartTime = Date.now();
            }
            if (this.activeAudio) {
                this.pausedAudio = this.activeAudio;
                this.activeAudio.pausePlayback();
            }
        } else {
            // Óculos recolocado na cabeça (ou app visível)
            if (this.hiddenStartTime !== null) {
                const elapsed = Date.now() - this.hiddenStartTime;
                this.hiddenStartTime = null;

                if (elapsed >= 2000) {
                    // Mais de 2 segundos fora da cabeça: novo visitante!
                    this.hallAudioPlayed = false;

                    if (this.pausedAudio) {
                        this.pausedAudio.stopPlayback();
                        this.pausedAudio = null;
                    }

                    // Se a troca de usuário ocorreu enquanto já se estava no Hall, toca imediatamente
                    if (this.isUserInHall() && this.hallAudioComp) {
                        this.hallAudioComp.startPlayback();
                        this.hallAudioPlayed = true;
                    }
                } else {
                    // Menos de 2 segundos: ajuste rápido no rosto, retoma narração anterior
                    if (this.pausedAudio) {
                        this.pausedAudio.resumePlayback();
                        this.pausedAudio = null;
                    }
                }
            }
        }
    }
});

AFRAME.registerComponent('panel-audio', {
    schema: {
        src: { type: 'string' },
        basePath: { type: 'string', default: 'assets/' },
        touchFront: { type: 'number', default: 0.03 },  // margem de toque à frente da face (m)
        touchBack: { type: 'number', default: 0.05 },   // margem de toque atrás da face (m)
        armDelay: { type: 'number', default: 500 },     // carência (ms) antes de armar a detecção
        autoplay: { type: 'boolean', default: false }   // toca automaticamente ao entrar na sala
    },

    init: function () {
        const src = this.data.src || '';
        const basePath = this.data.basePath ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.ASSETS_PATH) ||
            'assets/';
        const fullPath = (src.startsWith('/') || src.startsWith('http'))
            ? src
            : basePath + src;

        this.audio = new Audio(fullPath);
        this.audio.preload = 'auto';

        this.hands = [];
        this.lastHandQuery = -Infinity;
        this.targets = null;
        this.touching = false;
        this.armed = false;
        this.initTime = performance.now();
        this.tipWorldPos = new THREE.Vector3();
        this.tipLocalPos = new THREE.Vector3();

        // Estado do retry por gesto (usado quando o autoplay é bloqueado pelo navegador)
        this._gestureRetryBound = false;
        this._gestureRetryHandler = null;

        this.el.classList.add('clickable');
        this.el.addEventListener('click', () => this.startPlayback());

        // Autoplay: dispara apenas no primeiro acesso do visitante ao Hall
        if (this.data.autoplay) {
            if (this.system) {
                this.system.registerHallAudio(this);
            }

            this._onRoomReady = () => {
                if (this.system) {
                    if (!this.system.hallAudioPlayed) {
                        this.system.hallAudioPlayed = true;
                        this.startPlayback();
                    }
                } else {
                    this.startPlayback();
                }
            };
            const scene = this.el.sceneEl || (typeof document !== 'undefined' && document.querySelector('a-scene'));
            const container = scene
                ? (scene.querySelector('[room-manager]') || scene.querySelector('#room-container'))
                : (typeof document !== 'undefined' ? document.querySelector('#room-container') : null);
            if (container) container.addEventListener('room-ready', this._onRoomReady);
        }
    },

    safeUnlockAudio: function () {
        if (typeof window !== 'undefined' && typeof window.unlockAudioContext === 'function') {
            window.unlockAudioContext();
            return;
        }
        if (typeof THREE !== 'undefined' && THREE.AudioContext) {
            const ctx = THREE.AudioContext.getContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume();
            }
        }
    },

    /**
     * Monta (uma vez) a lista de superfícies tocáveis: cada alvo tem o objeto 3D de referência,
     * meia-largura, meia-altura e a faixa de profundidade local aceita.
     */
    getTargets: function () {
        if (this.targets) return this.targets;
        const targets = [];
        const front = this.data.touchFront;
        const back = this.data.touchBack;
        const wp = this.el.components['wall-panel'];

        if (wp) {
            const d = wp.data;
            const hasTiltBase = d.tiltHeight > 0;
            const hBase = hasTiltBase ? Math.min(d.tiltHeight, d.height) : 0;
            const hTop = hasTiltBase ? Math.max(0.01, d.height - d.tiltHeight) : d.height;
            const wallTop = this.el.querySelector('.wall-panel-wall');
            const wallBase = this.el.querySelector('.wall-panel-base');
            if (!wallTop) return targets; // parede ainda não criada; tenta de novo no próximo frame

            targets.push({
                obj: wallTop.object3D, halfW: d.width / 2, halfH: hTop / 2,
                zMin: -d.depth / 2 - back, zMax: d.depth / 2 + front
            });
            if (hasTiltBase && wallBase) {
                targets.push({
                    obj: wallBase.object3D, halfW: d.width / 2, halfH: hBase / 2,
                    zMin: -d.depth / 2 - back, zMax: d.depth / 2 + front
                });
            }
        } else {
            const ep = this.el.components['exhibit-panel'];
            if (!ep) return targets;
            targets.push({
                obj: this.el.object3D, halfW: ep.data.width / 2, halfH: ep.data.height / 2,
                zMin: -back, zMax: front
            });
        }
        this.targets = targets;
        return targets;
    },

    tick: function (time) {
        if (this.hands.length === 0) {
            if (time - this.lastHandQuery < 1000) return;
            this.lastHandQuery = time;
            // Aceita tanto hand-tracking-controls (core) quanto hand-tracking-grab-controls (extras)
            if (typeof document !== 'undefined') {
                this.hands = Array.from(document.querySelectorAll(
                    '[hand-tracking-controls], [hand-tracking-grab-controls]'
                ));
            }
            if (this.hands.length === 0) return;
        }

        const targets = this.getTargets();
        if (targets.length === 0) return;

        // Garante matrizes de mundo atualizadas antes do worldToLocal
        for (let k = 0; k < targets.length; k++) {
            targets[k].obj.updateWorldMatrix(true, false);
        }

        let touchingNow = false;
        for (let i = 0; i < this.hands.length && !touchingNow; i++) {
            const handEl = this.hands[i];
            const tracking = handEl.components && (
                handEl.components['hand-tracking-controls'] ||
                handEl.components['hand-tracking-grab-controls']
            );
            if (!tracking || !tracking.bones) continue;
            const tip = tracking.getBone('index-finger-tip');
            if (!tip) continue;
            tip.getWorldPosition(this.tipWorldPos);

            for (let j = 0; j < targets.length; j++) {
                const t = targets[j];
                this.tipLocalPos.copy(this.tipWorldPos);
                t.obj.worldToLocal(this.tipLocalPos);
                const p = this.tipLocalPos;
                if (Math.abs(p.x) <= t.halfW && Math.abs(p.y) <= t.halfH &&
                    p.z >= t.zMin && p.z <= t.zMax) {
                    touchingNow = true;
                    break;
                }
            }
        }

        // Só dispara com a detecção armada e numa transição limpa "sem toque" -> "com toque".
        if (this.armed && touchingNow && !this.touching) this.startPlayback();
        this.touching = touchingNow;

        // Arma a detecção após a carência E após ter visto ao menos um frame sem toque.
        if (!this.armed && !touchingNow &&
            performance.now() - this.initTime >= this.data.armDelay) {
            this.armed = true;
        }
    },

    startPlayback: function () {
        if (!this.audio) return;
        this.safeUnlockAudio();

        if (this.system) {
            this.system.setActiveAudio(this);
            if (this.data.autoplay) {
                this.system.hallAudioPlayed = true;
            }
        }

        if (!this.audio.paused && !this.audio.ended) return; // já está narrando
        this.audio.currentTime = 0;

        const playback = this.audio.play();
        if (playback && typeof playback.catch === 'function') {
            playback.catch(() => {
                // Caso típico: primeiro carregamento da página, sem gesto do usuário ainda.
                console.warn('panel-audio: reprodução bloqueada, aguardando gesto', this.data.src);
                this._scheduleGestureRetry();
            });
        }
    },

    pausePlayback: function () {
        if (!this.audio || this.audio.paused) return;
        this.audio.pause();
    },

    resumePlayback: function () {
        if (!this.audio || !this.audio.paused || this.audio.ended) return;
        this.safeUnlockAudio();
        const playback = this.audio.play();
        if (playback && typeof playback.catch === 'function') {
            playback.catch(() => {});
        }
    },

    stopPlayback: function () {
        if (!this.audio) return;
        this.audio.pause();
        this.audio.currentTime = 0;
        if (this.system) {
            this.system.clearActiveAudio(this);
        }
        this._unbindGestureRetry();
    },

    // -------------------------------------------------------------------------
    // Retry de autoplay bloqueado por política do navegador
    // -------------------------------------------------------------------------
    _scheduleGestureRetry: function () {
        if (this._gestureRetryBound) return;
        this._gestureRetryBound = true;

        const retry = () => {
            // Se outro painel assumiu o áudio ativo no sistema, cancela retry deste
            const active = this.system ? this.system.getActiveAudio() : null;
            if (active && active !== this) {
                this._unbindGestureRetry();
                return;
            }
            // Se já está tocando, nada a fazer
            if (this.audio && !this.audio.paused && !this.audio.ended) {
                this._unbindGestureRetry();
                return;
            }
            // Tenta novamente
            this.startPlayback();
        };

        this._gestureRetryHandler = retry;
        window.addEventListener('click', retry);
        window.addEventListener('touchstart', retry);
        window.addEventListener('keydown', retry);
        document.addEventListener('enter-vr', retry);
    },

    _unbindGestureRetry: function () {
        if (!this._gestureRetryBound) return;
        this._gestureRetryBound = false;
        const h = this._gestureRetryHandler;
        if (h) {
            window.removeEventListener('click', h);
            window.removeEventListener('touchstart', h);
            window.removeEventListener('keydown', h);
            document.removeEventListener('enter-vr', h);
        }
        this._gestureRetryHandler = null;
    },

    remove: function () {
        if (this.data.autoplay && this.system) {
            this.system.unregisterHallAudio(this);
        }
        // Remove o listener de autoplay antes de qualquer outra limpeza
        if (this._onRoomReady) {
            const scene = this.el.sceneEl || (typeof document !== 'undefined' && document.querySelector('a-scene'));
            const container = scene
                ? (scene.querySelector('[room-manager]') || scene.querySelector('#room-container'))
                : (typeof document !== 'undefined' ? document.querySelector('#room-container') : null);
            if (container) container.removeEventListener('room-ready', this._onRoomReady);
            this._onRoomReady = null;
        }
        this._unbindGestureRetry();
        this.stopPlayback();
        if (this.audio) {
            this.audio.removeAttribute('src');
            this.audio.load();
            this.audio = null;
        }
    }
});
