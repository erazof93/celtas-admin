import type { UseFormReturn } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { ZoneFormInput, ZoneFormValues } from './schemas'

interface Props {
  form: UseFormReturn<ZoneFormInput, unknown, ZoneFormValues>
  saving: boolean
  drawing: boolean
  onSubmit: () => void
  onCancel: () => void
}

export function ZoneForm({ form, saving, drawing, onSubmit, onCancel }: Props) {
  const {
    register,
    formState: { errors },
  } = form
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="space-y-4"
    >
      <h3 className="font-semibold">Datos de la zona</h3>
      <fieldset disabled={saving} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="zone-name">Nombre</Label>
          <Input
            id="zone-name"
            maxLength={100}
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
          {errors.name && (
            <p className="text-celtas-red-light text-xs">
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zone-fee">Tarifa (S/)</Label>
          <Input
            id="zone-fee"
            type="number"
            min="0"
            step="0.01"
            aria-invalid={Boolean(errors.fee)}
            {...register('fee')}
          />
          {errors.fee && (
            <p className="text-celtas-red-light text-xs">
              {errors.fee.message}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('active')} />
          Activa
        </label>
        {errors.polygon && (
          <p role="alert" className="text-celtas-red-light text-sm">
            {errors.polygon.message ??
              'Revisa los vértices y el cierre del polígono'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={drawing}>
            {saving ? 'Guardando…' : 'Guardar zona'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar edición
          </Button>
        </div>
      </fieldset>
      <p className="text-muted-foreground text-xs">
        Los cambios se guardan solo al pulsar Guardar zona. No cambia el modo
        operativo.
      </p>
    </form>
  )
}
