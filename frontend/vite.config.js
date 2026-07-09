import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function securityHeaders(apiBaseUrl) {
  const apiOrigin = new URL(apiBaseUrl).origin
  const apiWsOrigin = apiOrigin.replace(/^http/, 'ws')
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} ${apiWsOrigin} ws://localhost:5173 ws://127.0.0.1:5173`,
    `report-uri ${apiOrigin}/api/security/csp-report`,
  ].join('; ')

  return {
    'Content-Security-Policy-Report-Only': csp,
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const headers = securityHeaders(
    env.VITE_API_BASE_URL || 'http://localhost:3000'
  )

  return {
    plugins: [react()],
    build: {
      target: 'es2017',
    },
    server: { headers },
    preview: { headers },
  }
})
