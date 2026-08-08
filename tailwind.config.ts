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
        'celtas-gold': '#FFB800',
        'celtas-cream': '#F5F1E8',
      },
    },
  },
} satisfies Config
