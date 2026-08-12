import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin `globals: true` en vitest.config.ts, RTL no hace auto-cleanup:
// desmontamos el árbol después de cada test para evitar estado colgado
// entre tests.
afterEach(() => {
  cleanup()
})

// jsdom no implementa Pointer Capture ni scrollIntoView; Radix Select los usa
// al abrir el listbox y al enfocar el item seleccionado. Sin estos polyfills,
// cualquier test que interactúe con un Select lanza
// "target.hasPointerCapture is not a function" / "scrollIntoView is not a function".
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom no implementa ResizeObserver; Radix lo usa vía react-use-size (Select,
// DatePicker/Calendar, etc.) al montar. Sin el stub, cualquier test que monte
// un componente con estos primitivos lanza "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
