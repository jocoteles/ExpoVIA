/**
 * =========================================================================
 * VARIÁVEIS GLOBAIS DE CONFIGURAÇÃO (Parametrização da Exposição)
 * =========================================================================
 * Disponibilizado em window.CONFIG para parametrização geral da exposição.
 * Os componentes A-Frame NÃO dependem rigidamente deste objeto (princípios ECS),
 * utilizando valores padrão em seus schemas e tratando CONFIG apenas como fallback.
 */

const CONFIG = {
    // Dimensão circular correspondente à área de segurança (Guardian) do Quest 2
    ROOM_RADIUS: 1.5,
    PLATFORM_RADIUS: 1.85,
    ROOM_FLOOR_COLOR: '#1a1f2c',
    ROOM_RING_COLOR: '#3a7bd5',

    // Distâncias radiais relativas ao raio da sala (ROOM_RADIUS)
    // Totens, anéis e painéis adaptam-se automaticamente a qualquer alteração no ROOM_RADIUS
    get TOTEM_DISTANCE() { return this.ROOM_RADIUS * 0.75; },
    get PANEL_DISTANCE() { return this.ROOM_RADIUS * 0.90; },

    // Posicionamento e dimensões dos totens de teletransporte
    TOTEM_HEIGHT: 0.9,
    TOTEM_RADIUS: 0.18,
    TOTEM_COLOR: '#2c3e50',
    TOTEM_ORB_COLOR: '#00d2ff',

    // Pedestal central para as réplicas manipuláveis
    PEDESTAL_HEIGHT: 0.85,
    PEDESTAL_RADIUS: 0.30,

    // Painéis expositivos
    PANEL_ELEVATION: 1.5,   // Altura do centro do painel em relação ao solo
    PANEL_BG_COLOR: '#0d131f',
    PANEL_BORDER_COLOR: '#00d2ff',

    // Instrumentos em escala real adjacentes (visíveis na abertura angular)
    FULLSCALE_DISTANCE: 5.5,
    FULLSCALE_HEIGHT: 1.5,

    // Caminho padrão de assets (Diretriz 9)
    ASSETS_PATH: 'assets/',

    // Transição entre salas (teleporte)
    TELEPORT_FADE_MS: 300,          // duração do escurecimento / clareamento
    TELEPORT_MIN_BLACK_MS: 500,     // tempo mínimo em preto após a troca (evita "piscar")
    TELEPORT_SETTLE_FRAMES: 3,      // frames estáveis exigidos antes de clarear
    TELEPORT_TIMEOUT_MS: 15000,     // desiste de esperar um asset que nunca chega
    TELEPORT_MESSAGE: 'Aguardando teleporte…'
};

window.CONFIG = CONFIG;
