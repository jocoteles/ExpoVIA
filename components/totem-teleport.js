/**
 * Componente: totem-teleport
 * Detecta o toque na esfera (orb) do totem ou clique para teletransportar.
 * Posicionado em coordenadas polares (angle e radius).
 *
 * Princípios ECS:
 * - Dimensões e cores definidas no schema com valores padrão independentes de variáveis globais.
 * - Desacoplamento da busca pelo gerenciador de salas (room-manager) e desbloqueio resiliente de áudio.
 */
AFRAME.registerComponent('totem-teleport', {
    schema: {
        target: { type: 'string', default: 'hall' },
        label: { type: 'string', default: '' },
        angle: { type: 'number', default: 0 },
        radius: { type: 'number', default: 1.0 },
        height: { type: 'number', default: 0.9 },
        totemRadius: { type: 'number', default: 0.18 },
        color: { type: 'color', default: '#2c3e50' },
        orbColor: { type: 'color', default: '#00d2ff' }
    },

    init: function () {
        this.roomManager = null;
        this.hands = [];
        this.orbRadius = this.data.totemRadius * 0.45;
        this.orbWorldPos = new THREE.Vector3();
        this.handWorldPos = new THREE.Vector3();
        this.isTeleporting = false;
        this.el.classList.add('clickable');

        // Posicionamento em coordenadas polares (angle e radius)
        const rad = THREE.MathUtils.degToRad(this.data.angle);
        this.el.setAttribute('position', {
            x: -Math.sin(rad) * this.data.radius,
            y: 0,
            z: -Math.cos(rad) * this.data.radius
        });
        this.el.setAttribute('rotation', { x: 0, y: this.data.angle, z: 0 });

        // Base cilíndrica
        let cylinder = this.el.querySelector('a-cylinder') || document.createElement('a-cylinder');
        cylinder.classList.add('clickable');
        cylinder.setAttribute('radius', this.data.totemRadius);
        cylinder.setAttribute('height', this.data.height);
        cylinder.setAttribute('color', this.data.color);
        cylinder.setAttribute('position', { x: 0, y: this.data.height / 2, z: 0 });
        if (!cylinder.parentElement) this.el.appendChild(cylinder);

        // Esfera luminosa (alvo do toque)
        let orb = this.el.querySelector('.totem-orb') || document.createElement('a-sphere');
        orb.classList.add('totem-orb', 'clickable');
        orb.setAttribute('radius', this.orbRadius);
        orb.setAttribute('color', this.data.orbColor);
        orb.setAttribute('material', { emissive: this.data.orbColor, emissiveIntensity: 0.6 });
        orb.setAttribute('position', { x: 0, y: this.data.height + 0.1, z: 0 });
        if (!orb.parentElement) this.el.appendChild(orb);
        this.orb = orb;

        // Rótulo textual do totem usando troika-text para suporte total a acentos
        let textEl = this.el.querySelector('a-troika-text') || this.el.querySelector('a-text');
        let labelText = this.data.label;
        if (!labelText && textEl) {
            labelText = textEl.getAttribute('value');
        }
        if (labelText) {
            if (!textEl) {
                textEl = document.createElement('a-troika-text');
                this.el.appendChild(textEl);
            }
            const formatted = typeof labelText === 'string' ? labelText.replace(/\\n/g, '\n') : labelText;
            textEl.setAttribute('value', formatted);
            textEl.setAttribute('align', 'center');
            textEl.setAttribute('anchor', 'center');
            textEl.setAttribute('baseline', 'center');
            textEl.setAttribute('font-size', 0.065);
            textEl.setAttribute('position', { x: 0, y: this.data.height + 0.42, z: 0 });
            textEl.setAttribute('color', '#ffffff');
        }

        // Suporte a clique direto para testes no desktop
        this.el.addEventListener('click', () => this.teleport());
    },

    getRoomManager: function () {
        if (this.roomManager) return this.roomManager;
        const scene = this.el.sceneEl || (typeof document !== 'undefined' && document.querySelector('a-scene'));
        const container = scene
            ? (scene.querySelector('[room-manager]') || scene.querySelector('#room-container'))
            : (typeof document !== 'undefined' ? document.querySelector('#room-container') : null);
        if (container && container.components && container.components['room-manager']) {
            this.roomManager = container.components['room-manager'];
        }
        return this.roomManager;
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

    tick: function () {
        if (this.isTeleporting || !this.orb) return;

        if (this.hands.length === 0 && typeof document !== 'undefined') {
            this.hands = document.querySelectorAll('[hand-tracking-controls], [hand-tracking-grab-controls]');
        }

        this.orb.object3D.getWorldPosition(this.orbWorldPos);

        // Verifica toque físico de qualquer uma das mãos na esfera
        for (let i = 0; i < this.hands.length; i++) {
            const tracking = this.hands[i].components && (
                this.hands[i].components['hand-tracking-controls'] ||
                this.hands[i].components['hand-tracking-grab-controls']
            );
            if (tracking && tracking.bones) {
                const tip = tracking.getBone('index-finger-tip');
                if (tip) {
                    tip.getWorldPosition(this.handWorldPos);
                    if (this.handWorldPos.distanceTo(this.orbWorldPos) <= this.orbRadius + 0.02) {
                        this.teleport();
                        return;
                    }
                }
            }
        }
    },

    teleport: function () {
        const rm = this.getRoomManager();
        if (this.isTeleporting || !rm) return;
        this.safeUnlockAudio();
        // Ignora toques durante a transição ou se já está na sala de destino
        if (rm.isBusy() || rm.data.currentRoom === this.data.target) return;
        this.isTeleporting = rm.loadRoom(this.data.target);
    }
});
