/**
 * SFX Catalog Definitions
 */

export interface SfxItem {
  id: string
  name: string
  category: 'transitions' | 'ui' | 'foley'
  duration: number // in seconds
  description: string
  assetPath: string
}

export const SFX_CATEGORIES = [
  { id: 'all', label: 'Todos' },
  { id: 'transitions', label: 'Transiciones' },
  { id: 'ui', label: 'UI & Interfaz' },
  { id: 'foley', label: 'Ambiente & Foley' },
] as const

export const SFX_ITEMS: SfxItem[] = [
  // --- Transiciones ---
  {
    id: 'whoosh-fast',
    name: 'Whoosh Rápido',
    category: 'transitions',
    duration: 0.5,
    description: 'Transición de movimiento veloz para cortes dinámicos',
    assetPath: '/assets/audio/sfx/whoosh-fast.wav',
  },
  {
    id: 'swish-cinematic',
    name: 'Swish Cinemático',
    category: 'transitions',
    duration: 0.8,
    description: 'Barrido con reverb espacial para cambios de plano épicos',
    assetPath: '/assets/audio/sfx/swish-cinematic.wav',
  },
  {
    id: 'glitch-digital',
    name: 'Glitch Digital',
    category: 'transitions',
    duration: 0.4,
    description: 'Interferencia cibernética y corte abrupto de señal',
    assetPath: '/assets/audio/sfx/glitch-digital.wav',
  },
  {
    id: 'riser-tension',
    name: 'Riser de Tensión',
    category: 'transitions',
    duration: 2.0,
    description: 'Subida progresiva de tono para crear suspenso',
    assetPath: '/assets/audio/sfx/riser-tension.wav',
  },
  {
    id: 'impact-boom',
    name: 'Impacto Grave (Boom)',
    category: 'transitions',
    duration: 1.5,
    description: 'Golpe de bajos profundos con pegada cinematográfica',
    assetPath: '/assets/audio/sfx/impact-boom.wav',
  },

  // --- UI & Interfaz ---
  {
    id: 'click-soft',
    name: 'Click Suave',
    category: 'ui',
    duration: 0.1,
    description: 'Pulsación táctil sutil para botones y selecciones',
    assetPath: '/assets/audio/sfx/click-soft.wav',
  },
  {
    id: 'bubble-pop',
    name: 'Pop de Burbuja',
    category: 'ui',
    duration: 0.2,
    description: 'Sonido alegre y limpio para apariciones de elementos',
    assetPath: '/assets/audio/sfx/bubble-pop.wav',
  },
  {
    id: 'chime-success',
    name: 'Chime de Éxito',
    category: 'ui',
    duration: 1.0,
    description: 'Acorde armónico brillante para logros o tareas completadas',
    assetPath: '/assets/audio/sfx/chime-success.wav',
  },
  {
    id: 'bell-notification',
    name: 'Campana de Notificación',
    category: 'ui',
    duration: 1.2,
    description: 'Tono metálico limpio para alertas y recordatorios',
    assetPath: '/assets/audio/sfx/bell-notification.wav',
  },
  {
    id: 'keyboard-click',
    name: 'Teclado Mecánico',
    category: 'ui',
    duration: 0.15,
    description: 'Pulsación mecánica con switch táctil',
    assetPath: '/assets/audio/sfx/keyboard-click.wav',
  },

  // --- Ambiente & Foley ---
  {
    id: 'applause',
    name: 'Aplausos',
    category: 'foley',
    duration: 2.5,
    description: 'Ovación cálida para momentos estelares',
    assetPath: '/assets/audio/sfx/applause.wav',
  },
  {
    id: 'paper-rustle',
    name: 'Crujido de Papel',
    category: 'foley',
    duration: 0.8,
    description: 'Paso de página y textura orgánica de papel',
    assetPath: '/assets/audio/sfx/paper-rustle.wav',
  },
  {
    id: 'wind-breeze',
    name: 'Brisa de Viento',
    category: 'foley',
    duration: 3.0,
    description: 'Atmósfera envolvente de aire natural',
    assetPath: '/assets/audio/sfx/wind-breeze.wav',
  },
  {
    id: 'footsteps',
    name: 'Pasos',
    category: 'foley',
    duration: 1.2,
    description: 'Caminar constante con resonancia de superficie',
    assetPath: '/assets/audio/sfx/footsteps.wav',
  },
]
