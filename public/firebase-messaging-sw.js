// Service worker de Firebase Cloud Messaging (notificaciones push en segundo
// plano, panel cerrado o en otra pestaña). Los archivos en `public/` son
// estáticos (Vite no los procesa), así que este config NO puede leer
// `import.meta.env` — se hardcodea a propósito, como indica la propia doc de
// Firebase: es el mismo config público del cliente web, no un secreto (ver
// src/lib/firebase.ts para el detalle de por qué no hace falta ocultarlo).
// Mismo proyecto Firebase ("celtas-b0bd5") que ya usa celtas-mobile.
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js')
importScripts(
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js',
)

firebase.initializeApp({
  apiKey: 'AIzaSyBsWkn8S_InHiF4Loy-SBkljvsMi9kUAbg',
  authDomain: 'celtas-b0bd5.firebaseapp.com',
  projectId: 'celtas-b0bd5',
  storageBucket: 'celtas-b0bd5.firebasestorage.app',
  messagingSenderId: '614499893538',
  appId: '1:614499893538:web:4ae7017138e62a2fa3657b',
})

// onBackgroundMessage basta: el SDK ya muestra la notificación del sistema
// con el title/body que manda NotificationsService.sendPushNotification del
// backend — no hace falta un handler custom de `notificationclick` para v1.
firebase.messaging()
