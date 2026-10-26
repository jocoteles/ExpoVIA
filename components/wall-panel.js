/**
 * Componente: wall-panel
 * Anteparo de sala: parede com mídia (exhibit-panel), título/créditos e texto explicativo.
 * Suporta inclinação (totem/púlpito): sobe verticalmente do solo até tiltHeight e
 * inclina-se para trás em tiltAngle graus a partir dessa altura, abrigando a mídia e os textos.
 * Posicionamento radial idêntico ao totem-teleport: ângulo medido a partir do eixo -Z
 * (frente da sala), sentido horário — garante que o anteparo sempre fique de frente para o centro.
 * Filhos esperados, na ordem de declaração: <a-troika-text> (título), <a-troika-text>
 * (créditos), <a-troika-text> (texto explicativo — até 4 parágrafos, separados por linha
 * em branco dentro do próprio "value").
 *
 * Princípios ECS:
 * - Parâmetros geométricos e tipográficos contidos no schema.
 * - Leitura não-destrutiva de fallback para window.CONFIG.PANEL_DISTANCE sem acoplamento forçado.
 */
AFRAME.registerComponent('wall-panel', {
    schema: {
        // Parede
        width: { type: 'number', default: 0.6 },
        height: { type: 'number', default: 2.0 },
        depth: { type: 'number', default: 0.06 },
        radius: { type: 'number', default: 1.35 },
        angle: { type: 'number', default: 0 },
        tiltHeight: { type: 'number', default: 0.0 }, // Altura do solo onde ocorre a dobra/inclinação
        tiltAngle: { type: 'number', default: 0.0 },  // Ângulo de inclinação para trás (em graus)

        // Imagem/filme (entidade exhibit-panel-new)
        mediaHeight: { type: 'number', default: 1.7 },
        mediaDepth: { type: 'number', default: -0.006 },

        // Título e créditos
        titleHeight: { type: 'number', default: 1.1 },
        titleWidth: { type: 'number', default: 0.4 },
        titleFontSize: { type: 'number', default: 0.017 },
        titleFont: { type: 'string', default: '' },
        titleColor: { type: 'color', default: '#ffffff' },
        creditsRatio: { type: 'number', default: 0.9 },

        // Texto explicativo
        textHeight: { type: 'number', default: NaN },
        textFontSize: { type: 'number', default: 0.015 },
        textFont: { type: 'string', default: '' },
        textColor: { type: 'color', default: '#ffffff' },
        textWidth: { type: 'number', default: NaN },

        // Margem entre os blocos (em metros)
        textGap: { type: 'number', default: 0.02 }
    },

    init: function () {
        const d = this.data;
        const defaultDist = (typeof window !== 'undefined' && window.CONFIG && window.CONFIG.PANEL_DISTANCE) || 1.35;
        const dist = !isNaN(d.radius) ? d.radius : defaultDist;
        const front = d.depth / 2 + 0.001; // Afasta textos da face da parede
        const matAttr = this.el.getAttribute('material') || 'color: #1a1f2c; roughness: 0.85';

        // 1. Posicionamento radial
        const rad = THREE.MathUtils.degToRad(d.angle);
        this.el.setAttribute('position', { x: -Math.sin(rad) * dist, y: 0, z: -Math.cos(rad) * dist });
        this.el.setAttribute('rotation', { x: 0, y: d.angle, z: 0 });

        // 2. Geometria da Parede (Base reta + Seção inclinada)
        const tiltRad = THREE.MathUtils.degToRad(d.tiltAngle);
        const cosTilt = Math.cos(tiltRad);
        const sinTilt = Math.sin(tiltRad);

        const hasTiltBase = d.tiltHeight > 0;
        const hBase = hasTiltBase ? Math.min(d.tiltHeight, d.height) : 0;
        const hTop = hasTiltBase ? Math.max(0.01, d.height - d.tiltHeight) : d.height;

        // Base vertical da parede (do solo até tiltHeight)
        let wallBase = this.el.querySelector('.wall-panel-base');
        if (hasTiltBase) {
            if (!wallBase) {
                wallBase = document.createElement('a-box');
                wallBase.classList.add('wall-panel-base');
                this.el.appendChild(wallBase);
            }
            wallBase.setAttribute('width', d.width);
            wallBase.setAttribute('height', hBase);
            wallBase.setAttribute('depth', d.depth);
            wallBase.setAttribute('material', matAttr);
            wallBase.setAttribute('position', { x: 0, y: hBase / 2, z: 0 });
            wallBase.setAttribute('rotation', { x: 0, y: 0, z: 0 });
        } else if (wallBase) {
            wallBase.remove();
        }

        // Parede da seção inclinada (ou parede única inteira se tiltHeight == 0)
        let wallTop = this.el.querySelector('.wall-panel-wall');
        if (!wallTop) {
            wallTop = document.createElement('a-box');
            wallTop.classList.add('wall-panel-wall');
            this.el.appendChild(wallTop);
        }
        wallTop.setAttribute('width', d.width);
        wallTop.setAttribute('height', hTop);
        wallTop.setAttribute('depth', d.depth);
        wallTop.setAttribute('material', matAttr);

        // Função auxiliar de transformação para elementos na face inclinada
        // O eixo de rotação de tilt coincide com a aresta frontal compartilhada (y = hBase, z = d.depth / 2)
        const setSlantedTransform = (el, xLocal, sLocal, zLocal) => {
            const dz = zLocal - d.depth / 2;
            el.setAttribute('position', {
                x: xLocal,
                y: hBase + sLocal * cosTilt + dz * sinTilt,
                z: d.depth / 2 - sLocal * sinTilt + dz * cosTilt
            });
            el.setAttribute('rotation', { x: -d.tiltAngle, y: 0, z: 0 });
        };

        setSlantedTransform(wallTop, 0, hTop / 2, 0);

        // 3. Mídia (exhibit-panel-new) - posiciona APENAS se existir no elemento
        let media = this.el.querySelector('[exhibit-panel-new]');
        if (media) {
            const mediaZLocal = d.depth / 2 - d.mediaDepth;
            const sMedia = (d.mediaHeight >= d.tiltHeight && d.tiltHeight > 0)
                ? (d.mediaHeight - d.tiltHeight)
                : d.mediaHeight;
            setSlantedTransform(media, 0, sMedia, mediaZLocal);
        }

        // 4. Fluxo Vertical Matemático e Imediato dos Textos
        const texts = Array.from(this.el.querySelectorAll('a-troika-text'));
        if (texts.length === 0) return;

        // Função de estimativa geométrica tipográfica (largura média de caractere no Troika = ~0.52 da fonte)
        const calcTextHeight = (text, maxWidth, fontSize, lineHeightMultiplier = 1.25) => {
            if (!text) return fontSize;
            const avgCharWidth = fontSize * 0.52;
            const maxChars = Math.max(1, Math.floor(maxWidth / avgCharWidth));
            const paragraphs = text.split('\n');
            let lines = 0;

            paragraphs.forEach(para => {
                const words = para.trim().split(/\s+/);
                if (words.length === 0 || words[0] === '') return;
                let curLine = 0;
                words.forEach(word => {
                    if (curLine === 0) {
                        curLine = word.length;
                    } else if (curLine + 1 + word.length <= maxChars) {
                        curLine += 1 + word.length;
                    } else {
                        lines++;
                        curLine = word.length;
                    }
                });
                if (curLine > 0) lines++;
            });

            return Math.max(1, lines) * (fontSize * lineHeightMultiplier);
        };

        let initialTitleY = (d.titleHeight >= d.tiltHeight && d.tiltHeight > 0)
            ? (d.titleHeight - d.tiltHeight)
            : d.titleHeight;
        let currentY = initialTitleY;

        const title = texts[0];
        const credits = texts.length >= 3 ? texts[1] : null;
        const body = texts.length >= 3 ? texts[2] : (texts.length === 2 ? texts[1] : null);

        // A. TÍTULO
        if (title) {
            title.setAttribute('align', 'center');
            title.setAttribute('anchor', 'center');
            title.setAttribute('baseline', 'top'); // Ancora no topo
            title.setAttribute('font-size', d.titleFontSize);
            title.setAttribute('color', d.titleColor);
            title.setAttribute('max-width', d.titleWidth);
            if (d.titleFont) title.setAttribute('font', d.titleFont);
            setSlantedTransform(title, 0, currentY, front);

            const titleVal = title.getAttribute('value') || '';
            const titleH = calcTextHeight(titleVal, d.titleWidth, d.titleFontSize, 1.2);
            currentY -= (titleH + d.textGap);
        }

        // B. CRÉDITOS
        if (credits) {
            const credFontSize = d.titleFontSize * d.creditsRatio;
            const credWidth = d.titleWidth || (d.width - 0.05);

            credits.setAttribute('align', 'center');
            credits.setAttribute('anchor', 'center');
            credits.setAttribute('baseline', 'top');
            credits.setAttribute('font-size', credFontSize);
            credits.setAttribute('color', d.titleColor);
            credits.setAttribute('max-width', credWidth);
            if (d.titleFont) credits.setAttribute('font', d.titleFont);
            setSlantedTransform(credits, 0, currentY, front);

            const credVal = credits.getAttribute('value') || '';
            const credH = calcTextHeight(credVal, credWidth, credFontSize, 1.2);
            currentY -= (credH + d.textGap * 1.3);
        }

        // C. CORPO EXPLICATIVO (JUSTIFICADO)
        if (body) {
            const bodyWidth = !isNaN(d.textWidth) ? d.textWidth : (d.width - 0.1);
            const calcBodyY = !isNaN(d.textHeight)
                ? ((d.textHeight >= d.tiltHeight && d.tiltHeight > 0) ? (d.textHeight - d.tiltHeight) : d.textHeight)
                : currentY;

            body.setAttribute('align', body.getAttribute('align') || 'justify');
            body.setAttribute('anchor', 'left');
            body.setAttribute('baseline', 'top');
            body.setAttribute('font-size', d.textFontSize);
            body.setAttribute('color', d.textColor);
            body.setAttribute('line-height', 1.3);
            body.setAttribute('max-width', bodyWidth);
            if (d.textFont) body.setAttribute('font', d.textFont);
            setSlantedTransform(body, -bodyWidth / 2, calcBodyY, front);
        }
    }
});
