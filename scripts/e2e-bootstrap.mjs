/**
 * Prueba e2e del bootstrap de sesión: login → recargar → la sesión debe
 * restaurarse con el refreshToken (no mostrar el login).
 * Uso: node scripts/e2e-bootstrap.mjs <email> <password>
 */
const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('Uso: node scripts/e2e-bootstrap.mjs <email> <password>')
  process.exit(1)
}

const CDP_PORT = 9222
const APP_URL = 'http://localhost:5173'

async function getWsUrl() {
  const res = await fetch(`http://localhost:${CDP_PORT}/json`)
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('No page target found')
  return page.webSocketDebuggerUrl
}

async function main() {
  const wsUrl = await getWsUrl()
  const ws = new WebSocket(wsUrl)
  let msgId = 0
  const pending = new Map()

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }

  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++msgId
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })

  await new Promise((r) => (ws.onopen = r))
  await call('Page.enable')
  await call('Runtime.enable')

  // 1. Login
  await call('Page.navigate', { url: `${APP_URL}/login` })
  await new Promise((r) => setTimeout(r, 4000))
  await call('Runtime.evaluate', {
    expression: `
      (() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        const e = document.querySelector('#email')
        const p = document.querySelector('#password')
        setter.call(e, ${JSON.stringify(email)})
        e.dispatchEvent(new Event('input', { bubbles: true }))
        setter.call(p, ${JSON.stringify(password)})
        p.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('form').requestSubmit()
      })()
    `,
  })
  await new Promise((r) => setTimeout(r, 15000))

  const afterLogin = await call('Runtime.evaluate', {
    expression: `({ url: location.pathname, hasRefresh: !!localStorage.getItem('celtas_refresh_token') })`,
    returnByValue: true,
  })
  console.log('DESPUÉS DE LOGIN:', JSON.stringify(afterLogin.result?.result?.value))

  // 2. Recargar la página (el store en memoria se pierde; el refreshToken queda)
  await call('Page.reload', { ignoreCache: true })
  await new Promise((r) => setTimeout(r, 15000))

  const afterReload = await call('Runtime.evaluate', {
    expression: `({
      url: location.pathname,
      body: document.body.innerText.slice(0, 200),
    })`,
    returnByValue: true,
  })
  console.log('DESPUÉS DE RECARGAR:', JSON.stringify(afterReload.result?.result?.value, null, 2))

  ws.close()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})