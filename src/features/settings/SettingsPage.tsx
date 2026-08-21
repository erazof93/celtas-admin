import { BusinessHoursSettingsCard } from './BusinessHoursSettingsCard'
import { DeliverySettingsCard } from './DeliverySettingsCard'
import { RoleManagerCard } from './RoleManagerCard'
import { WhatsappSettingsCard } from './WhatsappSettingsCard'

/**
 * Configuración — MÓDULO 8. WhatsApp del negocio, horario de atención,
 * delivery por distancia (GET/PATCH /settings) y gestión de roles
 * (PATCH /users/:id/role, con auto-degradación bloqueada en la UI).
 */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          WhatsApp del negocio, horario de atención, delivery por distancia y
          roles de usuario.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <WhatsappSettingsCard />
        <RoleManagerCard />
        <BusinessHoursSettingsCard />
        <DeliverySettingsCard />
      </div>
    </div>
  )
}