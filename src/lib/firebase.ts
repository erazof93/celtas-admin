import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging'
import { patch } from './api-client'

/**
 * Config del proyecto Firebase web ("celtas-b0bd5") — el MISMO proyecto que
 * ya usa `celtas-mobile` (confirmado contra `lib/firebase_options.dart` real
 * de ese repo, bloque `web`). No son valores secretos: Firebase expone el
 * config del cliente web a propósito (la seguridad real vive en las reglas
 * del backend/Firebase, no en ocultar este objeto) — mismo criterio que
 * cualquier API key pública de Firebase Web SDK.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

let cachedApp: FirebaseApp | null = null

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
    return null
  }
  if (!cachedApp) {
    cachedApp = initializeApp(firebaseConfig)
  }
  return cachedApp
}

async function getMessagingInstance(): Promise<Messaging | null> {
  const supported = await isSupported().catch(() => false)
  if (!supported) return null
  const app = getFirebaseApp()
  if (!app) return null
  return getMessaging(app)
}

/**
 * Pide permiso de notificaciones del navegador y, si el usuario acepta,
 * registra el token FCM contra `PATCH /users/me/fcm-token` (endpoint
 * agnóstico de rol, ya usado por celtas-mobile — confirmado contra
 * users.controller.ts real de backend-celtas, no hace falta un endpoint
 * nuevo para el admin). Best-effort completo: nunca lanza ni bloquea el
 * panel — si el navegador no soporta push, el permiso se deniega, o falta
 * configuración de Firebase (.env), solo se loguea un warning.
 */
export async function registerPushNotifications(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
    if (!vapidKey) {
      console.warn(
        '[push] VITE_FIREBASE_VAPID_KEY no configurada — se omite el registro de notificaciones. ' +
          'Generarla en Firebase Console → Configuración del proyecto → Cloud Messaging → Certificados push web.',
      )
      return
    }

    const messaging = await getMessagingInstance()
    if (!messaging) {
      console.warn(
        '[push] Este navegador no soporta Web Push, o falta configuración de Firebase (.env) — se omite el registro.',
      )
      return
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
    )
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })
    if (!token) return

    await patch('/users/me/fcm-token', { fcmToken: token })
  } catch (error) {
    console.warn('[push] No se pudo registrar el token de notificaciones', error)
  }
}
