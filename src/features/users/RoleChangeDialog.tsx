import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldAlert } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/features/auth/store'
import { getApiMessage } from '@/lib/api-errors'
import { useUpdateUserRole } from './hooks'
import type { UserRole } from './types'

const roleSchema = z.object({
  role: z.enum(['cliente', 'admin'], {
    message: 'Selecciona un rol',
  }),
})

type RoleFormValues = z.output<typeof roleSchema>

interface RoleChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** UUID del usuario cuyo rol se va a cambiar. */
  userId: string
  /** Nombre del usuario (para el texto de confirmación). */
  userName?: string
  /** Rol actual del usuario (default del selector). */
  currentRole: UserRole
  /** Se llama tras un cambio exitoso. */
  onSuccess?: () => void
}

/**
 * Diálogo compartido de cambio de rol (Settings y Usuarios).
 *
 * - Selector de rol con el rol actual como default.
 * - Auto-degradación bloqueada en la UI: si el userId es el del admin logueado,
 *   la opción "cliente" queda deshabilitada (no se depende solo del 400 del
 *   backend).
 * - Confirmación explícita antes de mutar (requisito del ROADMAP módulo 8).
 * - El id viaja SOLO en el path de PATCH /users/:id/role (regla de la skill).
 */
export function RoleChangeDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentRole,
  onSuccess,
}: RoleChangeDialogProps) {
  const currentUser = useAuthStore((s) => s.user)
  const updateRoleMutation = useUpdateUserRole()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { role: currentRole },
  })

  const isSelf = Boolean(currentUser && userId === currentUser.id)

  async function onSubmit(values: RoleFormValues) {
    setServerError(null)
    try {
      await updateRoleMutation.mutateAsync({ id: userId, role: values.role })
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      setServerError(getApiMessage(error, 'No se pudo cambiar el rol'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar rol</DialogTitle>
          <DialogDescription>
            {userName ? (
              <>
                Cambiar el rol de <span className="font-semibold text-foreground">{userName}</span>
              </>
            ) : (
              'Cambiar el rol del usuario'
            )}{' '}
            <span className="font-mono text-foreground">{userId}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo cambiar el rol</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          {isSelf ? (
            <Alert variant="destructive">
              <ShieldAlert className="text-celtas-red" />
              <AlertTitle>Este es tu propio usuario</AlertTitle>
              <AlertDescription>
                No puedes quitarte tu rol de admin desde el panel. La opción
                "cliente" está deshabilitada.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="role-change-select">Nuevo rol</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) =>
                    field.onChange(value as UserRole)
                  }
                >
                  <SelectTrigger
                    id="role-change-select"
                    aria-invalid={Boolean(errors.role)}
                  >
                    <SelectValue placeholder="Rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="cliente" disabled={isSelf}>
                      Cliente
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role ? (
              <p className="text-celtas-red-light text-xs">{errors.role.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Confirmar cambio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}