/**
 * =========================================================================
 * DESBLOQUEIO DE ÁUDIO WEBXR
 * =========================================================================
 * Desbloqueia o Web Audio Context suspenso por políticas de autoplay do navegador
 * assim que qualquer interação do usuário (clique, toque ou enter-vr) acontecer.
 */

function unlockAudioContext() {
    if (typeof THREE !== 'undefined' && THREE.AudioContext) {
        const ctx = THREE.AudioContext.getContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }
    }
}

window.unlockAudioContext = unlockAudioContext;
window.addEventListener('click', unlockAudioContext);
window.addEventListener('touchstart', unlockAudioContext);
window.addEventListener('keydown', unlockAudioContext);

document.addEventListener('DOMContentLoaded', () => {
    const scene = document.querySelector('a-scene');
    if (scene) scene.addEventListener('enter-vr', unlockAudioContext);
});
