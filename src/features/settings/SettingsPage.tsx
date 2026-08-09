import { RoleManagerCard } from './RoleManagerCard'
import { WhatsappSettingsCard } from './WhatsappSettingsCard'

/**
 * Configuración — MÓDULO 8. WhatsApp del negocio (GET/PATCH /settings) y
 * gestión de roles (PATCH /users/:id/role, con auto-degradación bloqueada en
 * la UI). El selector de usuarios real llega con el módulo 9.
 */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          WhatsApp del negocio y roles de usuario.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <WhatsappSettingsCard />
        <RoleManagerCard />
      </div>
    </div>
  )
}