import { AutoCouponConfigCard } from './AutoCouponConfigCard'
import { BusinessHoursSettingsCard } from './BusinessHoursSettingsCard'
import { DeliverySettingsCard } from './DeliverySettingsCard'
import { EstrellasSettingsCard } from './EstrellasSettingsCard'
import { RoleManagerCard } from './RoleManagerCard'
import { WhatsappSettingsCard } from './WhatsappSettingsCard'
import { DeliveryZonesSection } from '../delivery-zones/DeliveryZonesSection'

/**
 * Configuración — MÓDULO 8. WhatsApp del negocio, horario de atención,
 * delivery por distancia (GET/PATCH /settings), cupones automáticos
 * (GET/PUT /coupons/auto-config) y gestión de roles
 * (PATCH /users/:id/role, con auto-degradación bloqueada en la UI).
 */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          WhatsApp del negocio, horario de atención, delivery por distancia,
          cupones automáticos y roles de usuario.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <WhatsappSettingsCard />
        <RoleManagerCard />
        <BusinessHoursSettingsCard />
        <DeliverySettingsCard />
        <EstrellasSettingsCard />
        <AutoCouponConfigCard />
      </div>
      <DeliveryZonesSection />
    </div>
  )
}
