/**
 * Componente: exhibit-panel
 * Posiciona e estiliza painéis expositivos em distribuição circular.
 *
 * Princípios ECS:
 * - Cores e distâncias padronizadas no schema.
 * - Suporte opcional a leitura de window.CONFIG.PANEL_DISTANCE e PANEL_ELEVATION como fallback,
 *   sem depender obrigatoriamente de sua existência no escopo global.
 */
AFRAME.registerComponent('exhibit-panel', {
    schema: {
        angle: { type: 'number', default: NaN },
        distance: { type: 'number', default: NaN },
        elevation: { type: 'number', default: NaN },
        width: { type: 'number', default: 1.3 },
        height: { type: 'number', default: 0.8 },
        bgColor: { type: 'color', default: '#0d131f' },
        borderColor: { type: 'color', default: '#00d2ff' },
        titleColor: { type: 'color', default: '' },
        hasBorder: { type: 'boolean', default: false }
    },

    init: function () {
        const defaultDist = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.PANEL_DISTANCE) || 1.35;
        const defaultElev = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.PANEL_ELEVATION) || 1.5;
        const dist = !isNaN(this.data.distance) ? this.data.distance : defaultDist;
        const elev = !isNaN(this.data.elevation) ? this.data.elevation : defaultElev;

        // Cálculo de posição e rotação se ângulo for fornecido
        if (!isNaN(this.data.angle)) {
            const rad = THREE.MathUtils.degToRad(this.data.angle);
            const x = -Math.sin(rad) * dist;
            const z = -Math.cos(rad) * dist;
            this.el.setAttribute('position', { x: x, y: elev, z: z });
            this.el.setAttribute('rotation', { x: 0, y: this.data.angle, z: 0 });
        } else {
            const currentPos = this.el.getAttribute('position') || { x: 0, y: 0, z: 0 };
            this.el.setAttribute('position', {
                x: currentPos.x,
                y: elev,
                z: currentPos.z
            });
        }

        // Fundo do painel
        let bgPlane = this.el.querySelector('.panel-bg') || this.el.querySelector('a-plane:not(.panel-border)');
        if (!bgPlane) {
            bgPlane = document.createElement('a-plane');
            bgPlane.classList.add('panel-bg');
            this.el.insertBefore(bgPlane, this.el.firstChild);
        }
        bgPlane.setAttribute('width', this.data.width);
        bgPlane.setAttribute('height', this.data.height);
        bgPlane.setAttribute('color', this.data.bgColor);

        // Moldura externa luminosa
        if (this.data.hasBorder) {
            let borderPlane = this.el.querySelector('.panel-border');
            if (!borderPlane) {
                borderPlane = document.createElement('a-plane');
                borderPlane.classList.add('panel-border');
                this.el.insertBefore(borderPlane, bgPlane);
            }
            borderPlane.setAttribute('width', this.data.width + 0.02);
            borderPlane.setAttribute('height', this.data.height + 0.02);
            borderPlane.setAttribute('position', { x: 0, y: 0, z: -0.005 });
            borderPlane.setAttribute('material', { color: this.data.borderColor, shader: 'flat' });
        }

        // Estilização do título (primeiro texto)
        const texts = this.el.querySelectorAll('a-troika-text, a-text');
        if (texts.length >= 1) {
            const titleEl = texts[0];
            if (!titleEl.getAttribute('position')) {
                titleEl.setAttribute('position', { x: -0.58, y: 0.28, z: 0.01 });
            }
            if (!titleEl.getAttribute('anchor')) {
                titleEl.setAttribute('anchor', 'left');
            }
            if (!titleEl.getAttribute('font-size')) {
                titleEl.setAttribute('font-size', 0.05);
            }
            if (!titleEl.getAttribute('max-width')) {
                titleEl.setAttribute('max-width', this.data.width - 0.15);
            }
            if (this.data.titleColor) {
                titleEl.setAttribute('color', this.data.titleColor);
            } else if (!titleEl.getAttribute('color')) {
                titleEl.setAttribute('color', this.data.borderColor);
            }
        }

        // Estilização do corpo do texto (segundo texto)
        if (texts.length >= 2) {
            const bodyEl = texts[1];
            if (!bodyEl.getAttribute('position')) {
                bodyEl.setAttribute('position', { x: -0.58, y: 0.18, z: 0.01 });
            }
            if (!bodyEl.getAttribute('anchor')) {
                bodyEl.setAttribute('anchor', 'left');
            }
            if (!bodyEl.getAttribute('baseline')) {
                bodyEl.setAttribute('baseline', 'top');
            }
            if (!bodyEl.getAttribute('font-size')) {
                bodyEl.setAttribute('font-size', 0.034);
            }
            if (!bodyEl.getAttribute('max-width')) {
                bodyEl.setAttribute('max-width', this.data.width - 0.15);
            }
            if (!bodyEl.getAttribute('line-height')) {
                bodyEl.setAttribute('line-height', 1.25);
            }
            if (!bodyEl.getAttribute('color')) {
                bodyEl.setAttribute('color', '#ffffff');
            }
        }
    }
});
