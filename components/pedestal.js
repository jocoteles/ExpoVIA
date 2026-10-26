/**
 * Componente: pedestal
 * Cria o pedestal central e posiciona o instrumento na altura ideal de manipulação.
 *
 * Princípios ECS:
 * - Altura, raio e cor definidos no schema com padrões literais autônomos.
 */
AFRAME.registerComponent('pedestal', {
    schema: {
        height: { type: 'number', default: 0.85 },
        radius: { type: 'number', default: 0.30 },
        color: { type: 'color', default: '#202433' }
    },

    init: function () {
        this.el.setAttribute('position', { x: 0, y: this.data.height, z: 0 });
        let cylinder = this.el.querySelector('.pedestal-base') || this.el.querySelector('a-cylinder');
        if (!cylinder) {
            cylinder = document.createElement('a-cylinder');
            cylinder.classList.add('pedestal-base');
            this.el.insertBefore(cylinder, this.el.firstChild);
        }
        cylinder.setAttribute('radius', this.data.radius);
        cylinder.setAttribute('height', this.data.height);
        cylinder.setAttribute('color', this.data.color);
        cylinder.setAttribute('position', { x: 0, y: -this.data.height / 2, z: 0 });
    }
});
