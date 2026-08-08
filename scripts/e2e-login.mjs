/**
 * Prueba e2e del login en el navegador real (Chrome headless vía CDP).
 * Sin dependencias: usa el WebSocket nativo de Node 24.
 * Uso: node scripts/e2e-login.mjs <email> <password>
 */
const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('Uso: node scripts/e2e-login.mjs <email> <password>')
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

function send(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }))
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
      send(ws, id, method, params)
    })

  await new Promise((r) => (ws.onopen = r))

  // Navegar al login
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Page.navigate', { url: `${APP_URL}/login` })
  await new Promise((r) => setTimeout(r, 4000))

  // Llenar el formulario y submit
  const fill = await call('Runtime.evaluate', {
    expression: `
      (() => {
        const emailInput = document.querySelector('#email')
        const passInput = document.querySelector('#password')
        if (!emailInput || !passInput) return { ok: false, reason: 'inputs no encontrados' }
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(emailInput, ${JSON.stringify(email)})
        emailInput.dispatchEvent(new Event('input', { bubbles: true }))
        setter.call(passInput, ${JSON.stringify(password)})
        passInput.dispatchEvent(new Event('input', { bubbles: true }))
        return { ok: true }
      })()
    `,
    returnByValue: true,
  })
  console.log('FILL:', JSON.stringify(fill.result?.result?.value))

  await new Promise((r) => setTimeout(r, 500))

  const submit = await call('Runtime.evaluate', {
    expression: `
      (() => {
        const form = document.querySelector('form')
        if (!form) return { ok: false, reason: 'form no encontrado' }
        form.requestSubmit()
        return { ok: true }
      })()
    `,
    returnByValue: true,
  })
  console.log('SUBMIT:', JSON.stringify(submit.result?.result?.value))

  // Esperar la navegación / resultado (el backend puede tardar en responder)
  await new Promise((r) => setTimeout(r, 15000))

  const state = await call('Runtime.evaluate', {
    expression: `
      (() => ({
        url: window.location.pathname,
        title: document.title,
        hasDashboard: !!document.querySelector('h1') && document.body.innerText.includes('Dashboard'),
        bodySnippet: document.body.innerText.slice(0, 300),
      }))()
    `,
    returnByValue: true,
  })
  console.log('STATE:', JSON.stringify(state.result?.result?.value, null, 2))

  ws.close()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
