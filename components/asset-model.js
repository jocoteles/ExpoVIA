/**
 * Componente: asset-model
 * Carrega modelos 3D com resolução dinâmica a partir de basePath configurável.
 *
 * Princípios ECS:
 * - O caminho base (basePath) é propriedade do schema, com fallback seguro para window.CONFIG.ASSETS_PATH ou 'assets/'.
 */
AFRAME.registerComponent('asset-model', {
    schema: {
        src: { type: 'string' },
        basePath: { type: 'string', default: 'assets/' }
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
    }
});
