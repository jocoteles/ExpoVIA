/**
 * Componente: fullscale-model
 * Posiciona instrumentos em tamanho real adjacentes à sala ativa.
 *
 * Princípios ECS:
 * - Distância, altura, escala e basePath parametrizados no schema com padrões literais autônomos.
 * - Leitura não-destrutiva de window.CONFIG.ASSETS_PATH como fallback de basePath.
 */
AFRAME.registerComponent('fullscale-model', {
    schema: {
        src: { type: 'string' },
        basePath: { type: 'string', default: 'assets/' },
        distance: { type: 'number', default: 5.5 },
        height: { type: 'number', default: 1.5 },
        offsetY: { type: 'number', default: 0 },
        offsetZ: { type: 'number', default: 0 },
        scale: { type: 'vec3', default: { x: 1, y: 1, z: 1 } }
    },

    init: function () {
        const basePath = this.data.basePath ||
            (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.ASSETS_PATH) ||
            'assets/';
        const src = this.data.src || '';
        const fullPath = (src.startsWith('/') || src.startsWith('http') || src.startsWith(basePath) || src.startsWith('assets/'))
            ? src
            : basePath + src;

        this.el.setAttribute('gltf-model', fullPath);
        this.el.setAttribute('scale', this.data.scale);

        const currentPos = this.el.getAttribute('position') || { x: 0, y: 0, z: 0 };
        const targetZ = -(this.data.distance + this.data.offsetZ);
        const targetY = this.data.height + this.data.offsetY;
        this.el.setAttribute('position', {
            x: currentPos.x,
            y: targetY,
            z: targetZ
        });
    }
});
