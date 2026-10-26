/**
 * Componente: auto-height
 * Ajusta a altura de <a-image> proporcionalmente à largura mantendo o aspect ratio original da imagem.
 *
 * Princípios ECS:
 * - Totalmente autônomo e baseado em eventos do próprio elemento (materialtextureloaded).
 */
AFRAME.registerComponent('auto-height', {
    init: function () {
        const updateHeight = (e) => {
            const mesh = this.el.getObject3D('mesh');
            const texture = (e && e.detail && e.detail.texture) ||
                (mesh && mesh.material && mesh.material.map);
            if (texture && texture.image && texture.image.width && texture.image.height) {
                const img = texture.image;
                const aspect = img.height / img.width;
                const currentWidth = parseFloat(this.el.getAttribute('width')) || 1;
                this.el.setAttribute('height', currentWidth * aspect);
            }
        };

        this.el.addEventListener('materialtextureloaded', updateHeight);
        // Executa imediatamente caso a imagem já esteja em cache
        updateHeight();
    }
});
