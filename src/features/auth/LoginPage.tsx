import { AxiosError } from 'axios'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useLogin } from './hooks'
import type { ApiError } from './types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Schema de login — mismas reglas que el LoginDto del backend
 * (email válido, contraseña obligatoria).
 */
const loginSchema = z.object({
  email: z.string().email('El email no es válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

type LoginFormValues = z.infer<typeof loginSchema>

/** Extrae el mensaje del error normalizado del backend ({ success, message, statusCode }). */
function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiError | undefined
    if (error.response?.status === 429) {
      return 'Demasiados intentos. Espera un minuto e intenta de nuevo.'
    }
    if (data?.message) return data.message
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
      return 'No se pudo conectar con el servidor. Intenta de nuevo.'
    }
  }
  return 'Ocurrió un error inesperado. Intenta de nuevo.'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => navigate('/dashboard', { replace: true }),
    })
  })

  return (
    <div className="bg-celtas-black text-celtas-cream flex min-h-screen items-center justify-center p-4">
      <Card className="border-border bg-card w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            🪓 Celtas <span className="text-celtas-orange">Admin</span>
          </CardTitle>
          <CardDescription>
            Ingresa con tu cuenta de administrador
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="admin@celtas.pe"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-celtas-red-light text-sm">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-celtas-red-light text-sm">
                  {errors.password.message}
                </p>
              )}
            </div>

            {login.isError && (
              <Alert variant="destructive">
                <AlertTitle>No se pudo iniciar sesión</AlertTitle>
                <AlertDescription>
                  {getErrorMessage(login.error)}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="bg-celtas-orange hover:bg-celtas-orange/90 w-full text-white"
              disabled={login.isPending}
            >
              {login.isPending ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
