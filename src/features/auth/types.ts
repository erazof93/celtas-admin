/**
 * Tipos del módulo auth — verificados contra el backend real (fuente:
 * src/modules/auth/auth.service.ts, entities/user.entity.ts y el interceptor
 * global TransformInterceptor). El Swagger no documenta schemas de respuesta
 * (content?: never), por eso estos tipos viven acá y no en api.d.ts.
 *
 * Formato de respuesta estándar de la API:
 *   éxito:  { success: true, data: <payload> }
 *   error:  { success: false, message: string, statusCode: number }
 */

export interface AuthUser {
  id: string
  email: string
  fullName: string
  provider: 'local' | 'google'
  googleId: string | null
  phone: string | null
  fcmToken: string | null
  totalSpent: number
  role: 'cliente' | 'admin'
  createdAt: string
  updatedAt: string
}

/** Payload de POST /auth/login y POST /auth/refresh (rotación de tokens). */
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

/** Envelope estándar de éxito de la API. */
export interface ApiSuccess<T> {
  success: true
  data: T
}

/** Envelope estándar de error de la API. */
export interface ApiError {
  success: false
  message: string
  statusCode: number
}
