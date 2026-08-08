/**
 * Genera src/types/api.d.ts desde el Swagger JSON del backend.
 *
 * Lee VITE_API_BASE_URL desde .env (con fallback a producción) porque los
 * scripts de npm no cargan .env automáticamente. El archivo generado NUNCA
 * se edita a mano — para regenerarlo basta `pnpm run generate:types`.
 */
import { execSync } from 'node:child_process'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

try {
  loadEnvFile(path.join(root, '.env'))
} catch {
  // sin .env → usamos producción por defecto
}

const baseUrl =
  process.env.VITE_API_BASE_URL ?? 'https://backend-celtas.onrender.com'
const specUrl = `${baseUrl}/docs-json`
const outFile = path.join(root, 'src/types/api.d.ts')

console.log(`▶ Generando tipos desde ${specUrl}`)
execSync(`pnpm exec openapi-typescript "${specUrl}" -o "${outFile}"`, {
  stdio: 'inherit',
})
console.log(`✔ Tipos escritos en ${outFile}`)
