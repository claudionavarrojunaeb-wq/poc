import nodemailer from 'nodemailer'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env'), override: true })

// Configuración del mailer a partir de variables de entorno
const MAIL_HOST = process.env.MAIL_HOST || 'relay.fidelizador.com'
const MAIL_PORT = Number(process.env.MAIL_PORT || 587)
const MAIL_AUTH = typeof process.env.MAIL_AUTH === 'undefined'
  ? true
  : (process.env.MAIL_AUTH === '1' || process.env.MAIL_AUTH === 'true')
const MAIL_USER = process.env.MAIL_USER || 'jrelay2025.d02041+cl1.fidelizador.com'
const MAIL_PASS = process.env.MAIL_PASS || ''
const MAIL_SECURE = process.env.MAIL_SECURE === '1' || process.env.MAIL_SECURE === 'true'
const MAIL_REQUIRE_TLS = typeof process.env.MAIL_REQUIRE_TLS === 'undefined'
  ? true
  : (process.env.MAIL_REQUIRE_TLS === '1' || process.env.MAIL_REQUIRE_TLS === 'true')
const SMTP_NAME = process.env.SMTP_NAME || 'relay.fidelizador.com'
const MAIL_TEST = process.env.MAIL_TEST === '1' || process.env.MAIL_TEST === 'true'

let transporter = null

export async function ensureTransporter() {
  if (transporter) return transporter

  if (MAIL_TEST) {
    try {
      const testAccount = await nodemailer.createTestAccount()
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
        tls: { rejectUnauthorized: false },
        logger: true,
        debug: true,
        name: 'ethereal'
      })
      console.log('Ethereal test account created:', testAccount.user)
      return transporter
    } catch (e) {
      console.error('Failed to create Ethereal test account', e)
      throw e
    }
  }

  transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: MAIL_PORT || 587,
    secure: MAIL_SECURE,
    requireTLS: MAIL_REQUIRE_TLS,
    auth: MAIL_AUTH ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
    tls: { rejectUnauthorized: false },
    logger: true,
    debug: true,
    name: SMTP_NAME
  })

  return transporter
}

export function getPreviewUrl(info) {
  if (!MAIL_TEST) return null
  try {
    return nodemailer.getTestMessageUrl(info)
  } catch {
    return null
  }
}

export default { ensureTransporter, getPreviewUrl }
