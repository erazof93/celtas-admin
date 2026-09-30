import { useMemo, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUsers } from '../../users/hooks'
import type { AdminUser } from '../../users/types'
import { CUSTOMER_NAME_MAX_LENGTH } from '../manual-order'

/**
 * GET /users NO tiene búsqueda server-side (QueryUsersDto: page/limit/sortBy/
 * order). Se traen los 100 clientes más recientes (máximo del backend) y se
 * filtran en el navegador. Si el cliente no aparece, el pedido se carga "sin
 * cuenta" con nombre + celular — que es lo que el backend ofrece (no existe
 * POST /customers para crear un cliente desde el panel).
 */
const USERS_LIMIT = 100
const MAX_RESULTS = 8

export type CustomerValue =
  | { mode: 'registered'; customer: AdminUser }
  | { mode: 'anonymous'; customerName: string; customerPhone: string }

interface CustomerPickerProps {
  value: CustomerValue
  onChange: (value: CustomerValue) => void
  nameError?: string
  phoneError?: string
}

function matches(user: AdminUser, query: string): boolean {
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  return (
    user.fullName.toLowerCase().includes(q) ||
    user.email.toLowerCase().includes(q) ||
    (qDigits.length >= 3 && (user.phone ?? '').replace(/\D/g, '').includes(qDigits))
  )
}

export function CustomerPicker({ value, onChange, nameError, phoneError }: CustomerPickerProps) {
  const usersQuery = useUsers(1, USERS_LIMIT)
  const [search, setSearch] = useState('')

  // El backend rechaza (400) un customerId que no sea de rol cliente.
  const clients = useMemo(
    () => (usersQuery.data?.items ?? []).filter((u) => u.role === 'cliente'),
    [usersQuery.data],
  )
  const results = search.trim() ? clients.filter((u) => matches(u, search)).slice(0, MAX_RESULTS) : []
  const truncated = (usersQuery.data?.meta.total ?? 0) > USERS_LIMIT

  if (value.mode === 'registered') {
    const { customer } = value
    return (
      <div className="border-border bg-muted/40 flex items-start justify-between gap-3 rounded-lg border p-3">
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{customer.fullName}</p>
          <p className="text-muted-foreground">
            {customer.phone ?? 'Sin celular registrado'} · {customer.email}
          </p>
          {!customer.phone ? (
            <p className="text-celtas-gold text-xs">
              Sin celular: el WhatsApp del pedido irá al número del negocio.
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Quitar cliente"
          onClick={() => onChange({ mode: 'anonymous', customerName: '', customerPhone: '' })}
        >
          <X />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="customer-search">Buscar cliente registrado</Label>
        <Input
          id="customer-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, correo o celular"
          autoComplete="off"
        />
        {usersQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Cargando clientes…</p>
        ) : usersQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudieron cargar los clientes</AlertTitle>
            <AlertDescription>
              Igual puedes cargar el pedido sin cuenta con nombre y celular.
            </AlertDescription>
          </Alert>
        ) : search.trim() ? (
          results.length > 0 ? (
            <ul role="listbox" aria-label="Clientes encontrados" className="border-border divide-border divide-y rounded-lg border">
              {results.map((user) => (
                <li key={user.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                    onClick={() => {
                      setSearch('')
                      onChange({ mode: 'registered', customer: user })
                    }}
                  >
                    <span className="font-medium">{user.fullName}</span>
                    <span className="text-muted-foreground"> · {user.phone ?? user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-xs">No se encontró ese cliente.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // Prellena el nombre o el celular según lo que se buscó.
                  const text = search.trim()
                  const isPhone = /^[+\d\s-]+$/.test(text)
                  onChange({
                    mode: 'anonymous',
                    customerName: isPhone ? value.customerName : text,
                    customerPhone: isPhone ? text : value.customerPhone,
                  })
                  setSearch('')
                }}
              >
                <UserPlus className="size-4" />
                Usar como cliente sin cuenta
              </Button>
            </div>
          )
        ) : truncated ? (
          <p className="text-muted-foreground text-xs">
            Se busca entre los {USERS_LIMIT} clientes más recientes.
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">O cliente sin cuenta</legend>
        <p className="text-muted-foreground text-xs">
          El pedido queda asociado solo a este nombre y celular (no suma
          estrellas ni cupones). El WhatsApp de confirmación va a este número.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer-name">Nombre</Label>
            <Input
              id="customer-name"
              value={value.customerName}
              maxLength={CUSTOMER_NAME_MAX_LENGTH}
              aria-invalid={Boolean(nameError)}
              onChange={(e) => onChange({ ...value, customerName: e.target.value })}
              placeholder="Ej. Juan Pérez"
            />
            {nameError ? <p className="text-celtas-red-light text-xs">{nameError}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-phone">Celular</Label>
            <Input
              id="customer-phone"
              value={value.customerPhone}
              inputMode="tel"
              aria-invalid={Boolean(phoneError)}
              onChange={(e) => onChange({ ...value, customerPhone: e.target.value })}
              placeholder="Ej. 987 654 321"
            />
            {phoneError ? <p className="text-celtas-red-light text-xs">{phoneError}</p> : null}
          </div>
        </div>
      </fieldset>
    </div>
  )
}
