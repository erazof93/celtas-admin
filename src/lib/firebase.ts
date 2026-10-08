import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  type Messaging,
} from 'firebase/messaging'
import { useAuthStore } from '@/features/auth/store'
import { pushTokenRequest } from './api-client'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const OWNER_KEY = 'celtas_push_session'
const LOCK_NAME = 'celtas-push-installation'
export const PUSH_CLEANUP_TIMEOUT = 5_000
interface Owner {
  generation: string
  identity: string
  revoked: boolean
  reset?: boolean
  registered?: boolean
  registeredAt?: number
  protocol?: number
}
interface Registration {
  sessionId: number
  identity: string
  owner: Owner | null
  controller: AbortController
  messaging?: Messaging
  token?: string
  promise: Promise<void>
  finished?: boolean
  registered?: boolean
}
let cachedApp: FirebaseApp | null = null
let active: Registration | null = null
let initialized = false
let cleanup: { sessionId: number; promise: Promise<void> } | null = null

function readOwner(): Owner | null {
  const value: unknown = JSON.parse(localStorage.getItem(OWNER_KEY) ?? 'null')
  if (!value || typeof value !== 'object') return null
  const owner = value as Partial<Owner>
  return typeof owner.generation === 'string' &&
    typeof owner.identity === 'string' &&
    typeof owner.revoked === 'boolean'
    ? (owner as Owner)
    : null
}

export function capturePushGeneration(): string | null {
  try {
    return readOwner()?.generation ?? null
  } catch {
    return null
  }
}

/** Called only on explicit login; bootstrap reuses the existing generation. */
export function activatePushSession(identity: string) {
  try {
    localStorage.setItem(
      OWNER_KEY,
      JSON.stringify({
        generation: crypto.randomUUID(),
        identity,
        revoked: false,
        reset: true,
      }),
    )
  } catch {
    /* Push registration fails closed when coordination is unavailable. */
  }
}

function owns(registration: Registration) {
  const owner = readOwner()
  return owner?.generation === registration.owner?.generation && !owner?.revoked
}
function current(registration: Registration) {
  const session = useAuthStore.getState()
  return (
    !registration.controller.signal.aborted &&
    session.sessionId === registration.sessionId &&
    session.user?.id === registration.identity &&
    session.user.role === 'admin' &&
    Boolean(session.accessToken) &&
    (!registration.owner || owns(registration))
  )
}

function initialize() {
  if (initialized) return
  initialized = true
  // One listener per page, independent of layout remounts / StrictMode.
  window.addEventListener('storage', (event) => {
    if (event.key !== OWNER_KEY) return
    try {
      if (active?.owner && !owns(active)) {
        active.controller.abort()
        cleanup = { sessionId: active.sessionId, promise: Promise.resolve() }
        // Do not remove the refresh token belonging to a newer login in another tab.
        const session = useAuthStore.getState()
        if (
          session.sessionId === active.sessionId &&
          session.user?.id === active.identity
        )
          session.clearSession(false)
      }
    } catch {
      active?.controller.abort()
    }
  })
  useAuthStore.subscribe((session, previous) => {
    if (
      active &&
      (session.sessionId !== active.sessionId ||
        session.user?.id !== active.identity ||
        session.user?.role !== 'admin')
    ) {
      active.controller.abort()
      // Explicit logout is already coordinated. Other definitive session loss is local-only.
      if (
        cleanup?.sessionId !== active.sessionId &&
        previous.user?.id === active.identity
      )
        void stopPushNotifications(false, previous)
    }
  })
}

async function messagingInstance() {
  if (!(await isSupported())) return null
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.projectId ||
    !firebaseConfig.appId
  )
    return null
  cachedApp ??= initializeApp(firebaseConfig)
  return getMessaging(cachedApp)
}

/** Best effort, session-bound and serialized across tabs. Never logs provider errors/tokens. */
export function registerPushNotifications(): Promise<void> {
  initialize()
  const session = useAuthStore.getState()
  if (!session.accessToken || session.user?.role !== 'admin')
    return Promise.resolve()
  if (
    active?.sessionId === session.sessionId &&
    active.identity === session.user.id &&
    (!active.finished || active.registered)
  )
    return active.promise
  active?.controller.abort()
  const registration: Registration = {
    sessionId: session.sessionId,
    identity: session.user.id,
    owner: null,
    controller: new AbortController(),
    promise: Promise.resolve(),
  }
  try {
    if (!readOwner()) activatePushSession(registration.identity)
    registration.owner = readOwner()
  } catch {
    return Promise.resolve()
  }
  if (
    !registration.owner ||
    registration.owner.revoked ||
    registration.owner.identity !== registration.identity
  )
    return Promise.resolve()
  active = registration
  registration.promise = (async () => {
    try {
      if (!navigator.locks) {
        console.warn(
          '[push] Notificaciones push no disponibles: este navegador no admite Web Locks',
        )
        return
      }
      if (
        !('Notification' in window) ||
        !navigator.locks ||
        !import.meta.env.VITE_FIREBASE_VAPID_KEY
      )
        return
      const messaging = await messagingInstance()
      if (!messaging || !current(registration)) return
      registration.messaging = messaging
      const permission = await Notification.requestPermission()
      if (permission !== 'granted' || !current(registration)) return
      await navigator.locks.request(
        LOCK_NAME,
        { signal: registration.controller.signal },
        async () => {
          if (!current(registration)) return
          let owner = readOwner()
          if (!owner) {
            activatePushSession(registration.identity)
            owner = readOwner()
          }
          if (
            !owner ||
            owner.revoked ||
            owner.identity !== registration.identity
          )
            return
          registration.owner = owner
          if (owner.reset) {
            // Fresh token on a new login: even a timed-out old DELETE cannot match it.
            if (!(await deleteToken(messaging))) return
            if (!current(registration)) return
            owner = { ...owner, reset: false }
            localStorage.setItem(OWNER_KEY, JSON.stringify(owner))
            registration.owner = owner
          }
          // Deduplicate nearby tab mounts; do not permanently suppress token renewal.
          if (
            owner.protocol === 2 &&
            owner.registered &&
            Date.now() - (owner.registeredAt ?? 0) < 30_000
          ) {
            registration.registered = true
            return
          }
          const worker = await navigator.serviceWorker.register(
            '/firebase-messaging-sw.js',
          )
          if (!current(registration)) return
          const token = await getToken(messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: worker,
          })
          registration.token = token || undefined
          if (!token || !current(registration)) return
          await pushTokenRequest('patch', token, registration)
          if (current(registration)) {
            registration.registered = true
            localStorage.setItem(
              OWNER_KEY,
              JSON.stringify({
                ...owner,
                registered: true,
                protocol: 2,
                registeredAt: Date.now(),
              }),
            )
          }
          // No state or credential updates from a late response.
        },
      )
    } catch {
      if (!registration.controller.signal.aborted)
        console.warn('[push] No se pudo registrar las notificaciones')
    } finally {
      registration.finished = true
    }
  })()
  return registration.promise
}

type Session = ReturnType<typeof useAuthStore.getState>
/** Invalidate first. Cleanup keeps the installation lock even if our waiting deadline expires. */
export function stopPushNotifications(
  remote = true,
  session: Session = useAuthStore.getState(),
  expectedGeneration?: string | null,
): Promise<void> {
  initialize()
  if (cleanup?.sessionId === session.sessionId) return cleanup.promise
  const registration = active?.sessionId === session.sessionId ? active : null
  registration?.controller.abort()
  let owner: Owner | null = null
  let allowed = false
  try {
    owner = registration?.owner ?? readOwner()
    if (
      owner &&
      (owner.identity === session.user?.id ||
        (!remote &&
          !session.user &&
          owner.generation === expectedGeneration)) &&
      readOwner()?.generation === owner.generation
    ) {
      allowed = true
      localStorage.setItem(
        OWNER_KEY,
        JSON.stringify({ ...owner, revoked: true }),
      )
    }
  } catch {
    /* No credentials or tokens in storage/logs. */
  }
  const capturedOwner = owner
  // Revocation must not wait for the SDK/installation lock: PATCH may still be
  // running on the server even after Axios cancellation. This request is bound
  // to the outgoing identity, even if a later login now owns localStorage.
  const remoteCleanup =
    remote &&
    capturedOwner &&
    capturedOwner.identity === session.user?.id &&
    session.accessToken
      ? pushTokenRequest('delete', registration?.token, {
          sessionId: session.sessionId,
          identity: session.user.id,
          accessToken: session.accessToken,
          owner: capturedOwner,
        }).catch(() => {
          console.warn(
            '[push] No se pudo confirmar la revocación de notificaciones',
          )
        })
      : Promise.resolve()
  const task = (async () => {
    if (!allowed) return
    const cleanInstallation = async () => {
      // A later login owns the installation. Never delete its Firebase subscription.
      const latest = readOwner()
      if (
        !capturedOwner ||
        latest?.generation !== capturedOwner.generation ||
        !latest.revoked
      )
        return
      const operations: Promise<unknown>[] = []
      const messaging = registration?.messaging ?? (await messagingInstance())
      if (messaging) operations.push(deleteToken(messaging))
      await Promise.allSettled(operations)
    }
    if (navigator.locks)
      await navigator.locks.request(LOCK_NAME, cleanInstallation)
    // Registration is disabled without Web Locks, so no new push can race this cleanup.
    else await cleanInstallation()
  })().catch(() => {
    console.warn('[push] No se pudo completar la limpieza de notificaciones')
  })
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, PUSH_CLEANUP_TIMEOUT)
  })
  const promise = Promise.race([
    Promise.allSettled([task, remoteCleanup]),
    deadline,
  ])
    .then(() => undefined)
    .finally(() => {
      clearTimeout(timer)
    })
  cleanup = { sessionId: session.sessionId, promise }
  return promise
}
