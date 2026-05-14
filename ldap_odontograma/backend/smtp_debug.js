import nodemailer from 'nodemailer'
import util from 'util'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: false,
  requireTLS: true,
  auth: (process.env.MAIL_AUTH === '1' || process.env.MAIL_AUTH === 'true') ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined,
  tls: { rejectUnauthorized: false },
  logger: true,
  debug: true,
  name: process.env.SMTP_NAME || 'relay.fidelizador.com'
})

const mailOptions = {
  from: process.env.MAIL_FROM || process.env.MAIL_USER,
  to: 'claudio.navarro@junaeb.cl',
  subject: 'Prueba STARTTLS - debug',
  text: 'Hola desde prueba (script smtp_debug)'
}

try {
  const info = await transporter.sendMail(mailOptions)
  console.log('sendMail info', info)
} catch (err) {
  console.error('sendMail error', util.inspect(err, { depth: 10 }))
  process.exitCode = 1
}
