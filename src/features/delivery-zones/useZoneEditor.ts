import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { getApiMessage, getApiStatus } from '@/lib/api-errors'
import { useSettings } from '../settings/hooks'
import { deliveryModeFromSettings } from '../settings/delivery-mode'
import {
  parseStoreLocation,
  STORE_LOCATION_KEY,
} from '../settings/settings-utils'
import {
  useCreateDeliveryZone,
  useDeleteDeliveryZone,
  useDeliveryZones,
  useUpdateDeliveryZone,
} from './hooks'
import {
  zoneFormSchema,
  type ZoneFormInput,
  type ZoneFormValues,
} from './schemas'
import type { DeliveryZone } from './types'

const emptyForm: ZoneFormInput = {
  name: '',
  fee: '',
  active: true,
  polygon: null,
}
type Action =
  | { kind: 'select' | 'edit' | 'toggle' | 'delete'; zone: DeliveryZone }
  | { kind: 'create' }
  | { kind: 'cancel' }

export function useZoneEditor() {
  const settings = useSettings()
  const catalog = useDeliveryZones()
  const create = useCreateDeliveryZone()
  const update = useUpdateDeliveryZone()
  const remove = useDeleteDeliveryZone()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{
    id: string | null
    session: number
  } | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [pendingAction, setPendingAction] = useState<Action | null>(null)
  const [deleteZone, setDeleteZone] = useState<DeliveryZone | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const form = useForm<ZoneFormInput, unknown, ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: emptyForm,
  })
  const { isDirty } = form.formState
  const polygon = useWatch({ control: form.control, name: 'polygon' })
  const active = useWatch({ control: form.control, name: 'active' })
  const zones = catalog.data ?? []
  const selected = zones.find((zone) => zone.id === selectedId)
  const mode = deliveryModeFromSettings(settings.data)
  const modeKnown =
    settings.isSuccess && (mode === 'DISTANCE' || mode === 'ZONES')
  const activeZones = zones.filter((zone) => zone.active)
  const protectedId =
    mode === 'ZONES' && activeZones.length === 1 ? activeZones[0].id : null
  const busy = create.isPending || update.isPending || remove.isPending
  const locationValue = settings.data?.find(
    (setting) => setting.key === STORE_LOCATION_KEY,
  )?.value
  const location = useMemo(
    () => parseStoreLocation(locationValue),
    [locationValue],
  )

  async function reportError(err: unknown) {
    const status = getApiStatus(err)
    const message = getApiMessage(
      err,
      'El cambio entra en conflicto con el catálogo. Actualiza las zonas antes de volver a intentar.',
    )
    setError(
      status === 409
        ? /última zona activa/i.test(message)
          ? 'No puedes eliminar o desactivar la última zona activa mientras delivery por zonas está operativo.'
          : /solapa|superpone/i.test(message)
            ? 'La zona se superpone con otra zona existente, incluso si está inactiva. Corrige el polígono y vuelve a guardar.'
            : message
        : status === 403
          ? 'Tu cuenta no tiene permisos para administrar zonas.'
          : status === 401
            ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
            : getApiMessage(
                err,
                'No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.',
              ),
    )
    if (status === 409 || status === 404)
      await Promise.all([catalog.refetch(), settings.refetch()])
  }

  function clearEditor() {
    setEditor(null)
    setDrawing(false)
    form.reset(emptyForm)
  }

  async function perform(action: Action) {
    setError(null)
    setNotice(null)
    if (action.kind === 'cancel') {
      clearEditor()
      return
    }
    if (action.kind === 'create') {
      form.reset(emptyForm)
      setSelectedId(null)
      setEditor({ id: null, session: Date.now() })
      setDrawing(true)
      return
    }
    clearEditor()
    setSelectedId(action.zone.id)
    if (action.kind === 'edit') {
      form.reset({
        name: action.zone.name,
        fee: String(action.zone.fee),
        active: action.zone.active,
        polygon: structuredClone(action.zone.polygon),
      })
      setEditor({ id: action.zone.id, session: Date.now() })
    } else if (action.kind === 'delete') {
      if (action.zone.id === protectedId) {
        setError(
          'No puedes eliminar la última zona activa mientras el modo operativo sea Zonas.',
        )
        return
      }
      setDeleteZone(action.zone)
    } else if (action.kind === 'toggle') {
      if (action.zone.id === protectedId) {
        setError(
          'No puedes desactivar la última zona activa mientras el modo operativo sea Zonas.',
        )
        return
      }
      try {
        await update.mutateAsync({
          id: action.zone.id,
          active: !action.zone.active,
        })
        setNotice('Estado actualizado')
      } catch (err) {
        await reportError(err)
      }
    }
  }

  function request(action: Action) {
    if (busy) return
    if (editor && (isDirty || drawing)) setPendingAction(action)
    else void perform(action)
  }

  async function save(values: ZoneFormValues) {
    if (
      !editor ||
      !values.polygon ||
      drawing ||
      busy ||
      !modeKnown ||
      catalog.isError
    )
      return
    if (editor.id === protectedId && !values.active) {
      setError(
        'No puedes desactivar la última zona activa mientras el modo operativo sea Zonas.',
      )
      return
    }
    setError(null)
    try {
      const body = { ...values, polygon: values.polygon }
      const zone = editor.id
        ? await update.mutateAsync({ id: editor.id, ...body })
        : await create.mutateAsync(body)
      clearEditor()
      setSelectedId(zone.id)
      setNotice('Zona guardada')
      const next = pendingAction
      setPendingAction(null)
      if (next) await perform(next)
    } catch (err) {
      await reportError(err)
    }
  }

  async function confirmDelete() {
    if (!deleteZone || busy) return
    if (deleteZone.id === protectedId) {
      setError(
        'No puedes eliminar la última zona activa mientras el modo operativo sea Zonas.',
      )
      return
    }
    try {
      await remove.mutateAsync(deleteZone.id)
      if (selectedId === deleteZone.id) setSelectedId(null)
      setDeleteZone(null)
      setNotice('Zona eliminada')
    } catch (err) {
      await reportError(err)
    }
  }

  return {
    settings,
    catalog,
    selectedId,
    editor,
    drawing,
    pendingAction,
    deleteZone,
    error,
    notice,
    form,
    polygon,
    active,
    zones,
    selected,
    mode,
    modeKnown,
    protectedId,
    busy,
    location,
    remove,
    request,
    save,
    confirmDelete,
    perform,
    setPendingAction,
    setDeleteZone,
    setDrawing,
    setError,
  }
}
