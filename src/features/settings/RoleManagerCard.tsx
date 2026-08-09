import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RoleChangeDialog } from '@/features/users/RoleChangeDialog'

const roleFormSchema = z.object({
  userId: z.string().uuid('El ID de usuario debe ser un UUID válido'),
})

type RoleFormValues = z.output<typeof roleFormSchema>

/**
 * Gestión de roles (temporal hasta el módulo 9): input de UUID que abre el
 * RoleChangeDialog compartido (selector de rol + auto-degradación bloqueada +
 * confirmación). El selector real de usuarios llega con el módulo Usuarios.
 */
export function RoleManagerCard() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { userId: '' },
  })

  function onSubmit(values: RoleFormValues) {
    setPendingUserId(values.userId.trim())
    setDialogOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="text-celtas-orange size-4" />
          Roles de usuario
        </CardTitle>
        <CardDescription>
          Promueve a un cliente a admin o degrada a un admin a cliente. El
          selector de usuarios llega en el módulo Usuarios; por ahora pega el
          UUID.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role-user-id">Usuario (ID)</Label>
            <Input
              id="role-user-id"
              placeholder="UUID del usuario (ej. 3fa85f64-5717-4562-b3fc-2c963f66afa6)"
              aria-invalid={Boolean(errors.userId)}
              {...register('userId')}
            />
            {errors.userId ? (
              <p className="text-celtas-red text-xs">{errors.userId.message}</p>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button type="submit">Cambiar rol</Button>
          </div>
        </form>
      </CardContent>

      <RoleChangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={pendingUserId ?? ''}
        currentRole="admin"
      />
    </Card>
  )
}