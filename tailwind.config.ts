import type { Config } from 'tailwindcss'

/**
 * Configuración de Tailwind para el panel admin de Celtas.
 * Los tokens de color de marca viven aquí (y se reflejan en `@theme` de
 * src/index.css) — los componentes usan `bg-celtas-black`, `text-celtas-cream`,
 * etc., nunca hex directos.
 */
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'celtas-black': '#0D0D0D',
        'celtas-orange': '#E8590C',
        'celtas-red': '#C1121F',
        // Rojo claro para TEXTO sobre fondo oscuro: el rojo de marca (#C1121F)
        // da 3.12:1 sobre negro (falla WCAG AA de 4.5:1 para texto normal);
        // #F87171 da 7.03:1. Los iconos/acentos pueden seguir usando el rojo
        // de marca (contraste no-texto 3:1).
        'celtas-red-light': '#F87171',
        'celtas-gold': '#FFB800',
        'celtas-cream': '#F5F1E8',
      },
    },
  },
} satisfies Config
