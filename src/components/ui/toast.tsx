import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2 } from 'lucide-react'

/**
 * Mini-sistema de toasts sin dependencias (no se trajo sonner a propósito:
 * para una mejora de UX menor no se justifica una librería nueva).
 * - <ToastProvider> se monta una vez en App y renderiza los toasts en un
 *   portal fijo al viewport (no depende del overflow de la tabla).
 * - useToast() expone show(message) con auto-dismiss de 2s.
 * Los timeouts se limpian al desmontar el provider para no setState post-unmount.
 */

interface ToastItem {
  id: number
  message: string
}

interface ToastContextValue {
  show: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<number[]>([])

  const show = useCallback((message: string) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, message }])
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2000)
    timersRef.current.push(timer)
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="bg-celtas-black border-border animate-in fade-in-0 zoom-in-95 flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm text-celtas-cream shadow-lg"
            >
              <CheckCircle2 className="text-celtas-gold size-4 shrink-0" />
              {toast.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>')
  }
  return ctx
}
