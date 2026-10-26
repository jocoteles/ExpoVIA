/**
 * Componente: room-floor
 * Gera a plataforma composta por um disco circular no chão envolto por um parapeito circular.
 * O parapeito é composto por dois anéis (torus) a ~0,5 m e ~0,9 m do chão, sustentados
 * por 6 colunas equidistantes fixadas ao solo. Os anéis passam por fora dos totens e painéis.
 *
 * Princípios ECS:
 * - Cores e dimensões expostas no schema com padrões literais autônomos.
 * - Leitura não-destrutiva de window.CONFIG.PLATFORM_RADIUS como fallback se radius não for especificado.
 */
AFRAME.registerComponent('room-floor', {
    schema: {
        radius: { type: 'number', default: NaN },
        color: { type: 'color', default: '#1a1f2c' },
        ringColor: { type: 'color', default: '#3a7bd5' },
        roughness: { type: 'number', default: 0.8 },
        metalness: { type: 'number', default: 0.2 },
        ringWidth: { type: 'number', default: 0.05 },
        showRing: { type: 'boolean', default: true },
        showTimeline: { type: 'boolean', default: false },
        showRailing: { type: 'boolean', default: true },
        lowerRingHeight: { type: 'number', default: 0.5 },
        upperRingHeight: { type: 'number', default: 0.9 },
        columnCount: { type: 'int', default: 6 },
        columnRadius: { type: 'number', default: 0.02 },
        tubeRadius: { type: 'number', default: 0.025 },
        columnAngleOffset: { type: 'number', default: 30 }
    },

    init: function () {
        const defaultRadius = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.PLATFORM_RADIUS) || 1.85;
        const r = !isNaN(this.data.radius) ? this.data.radius : defaultRadius;

        // 1. Disco circular no chão
        const floor = document.createElement('a-circle');
        floor.setAttribute('radius', r);
        floor.setAttribute('rotation', '-90 0 0');
        floor.setAttribute('position', '0 0.001 0');
        floor.setAttribute('material', {
            color: this.data.color,
            roughness: this.data.roughness,
            metalness: this.data.metalness
        });
        this.el.appendChild(floor);

        // Borda perimétrica luminosa no chão
        if (this.data.showRing && this.data.ringColor) {
            const ring = document.createElement('a-ring');
            ring.setAttribute('radius-inner', r - this.data.ringWidth);
            ring.setAttribute('radius-outer', r);
            ring.setAttribute('rotation', '-90 0 0');
            ring.setAttribute('position', '0 0.002 0');
            ring.setAttribute('material', {
                color: this.data.ringColor,
                emissive: this.data.ringColor,
                emissiveIntensity: 0.3
            });
            this.el.appendChild(ring);
        }

        // Linha do tempo circular proporcional ao raio da plataforma (Hall)
        if (this.data.showTimeline) {
            const timeline = document.createElement('a-ring');
            const inner = r * 0.72;
            const outer = inner + 0.03;
            timeline.setAttribute('radius-inner', inner);
            timeline.setAttribute('radius-outer', outer);
            timeline.setAttribute('rotation', '-90 0 0');
            timeline.setAttribute('position', '0 0.002 0');
            timeline.setAttribute('material', {
                color: '#ffffff',
                opacity: 0.3,
                transparent: true
            });
            this.el.appendChild(timeline);
        }

        // 2. Parapeito circular (2 anéis torus + 6 colunas equidistantes presas ao chão)
        if (this.data.showRailing) {
            const railingMat = {
                color: this.data.ringColor,
                metalness: 0.6,
                roughness: 0.3,
                emissive: this.data.ringColor,
                emissiveIntensity: 0.2
            };

            // Anel inferior (~0,5 m do chão)
            const lowerTorus = document.createElement('a-torus');
            lowerTorus.setAttribute('radius', r);
            lowerTorus.setAttribute('radius-tubular', this.data.tubeRadius);
            lowerTorus.setAttribute('segments-tubular', 64);
            lowerTorus.setAttribute('segments-radial', 16);
            lowerTorus.setAttribute('rotation', '-90 0 0');
            lowerTorus.setAttribute('position', { x: 0, y: this.data.lowerRingHeight, z: 0 });
            lowerTorus.setAttribute('material', railingMat);
            this.el.appendChild(lowerTorus);

            // Anel superior (~0,9 m do chão)
            const upperTorus = document.createElement('a-torus');
            upperTorus.setAttribute('radius', r);
            upperTorus.setAttribute('radius-tubular', this.data.tubeRadius);
            upperTorus.setAttribute('segments-tubular', 64);
            upperTorus.setAttribute('segments-radial', 16);
            upperTorus.setAttribute('rotation', '-90 0 0');
            upperTorus.setAttribute('position', { x: 0, y: this.data.upperRingHeight, z: 0 });
            upperTorus.setAttribute('material', railingMat);
            this.el.appendChild(upperTorus);

            // 6 Colunas equidistantes presas ao chão
            const count = this.data.columnCount;
            const h = this.data.upperRingHeight;
            const colRadius = this.data.columnRadius;
            const offset = this.data.columnAngleOffset;

            for (let i = 0; i < count; i++) {
                const deg = offset + i * (360 / count);
                const rad = THREE.MathUtils.degToRad(deg);
                const cx = -Math.sin(rad) * r;
                const cz = -Math.cos(rad) * r;

                const col = document.createElement('a-cylinder');
                col.setAttribute('radius', colRadius);
                col.setAttribute('height', h);
                col.setAttribute('position', { x: cx, y: h / 2, z: cz });
                col.setAttribute('material', railingMat);
                this.el.appendChild(col);
            }
        }
    }
});
