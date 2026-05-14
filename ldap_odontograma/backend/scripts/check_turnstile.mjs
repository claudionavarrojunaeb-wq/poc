import dotenv from 'dotenv'
const envPath = 'd:/_SSMM/backend/.env'
const cfg = dotenv.config({ path: envPath })
import { verifyTurnstile } from '../cloudflare.js'
import fs from 'fs'

;(async ()=>{
  try {
    console.log('envPath:', envPath)
    console.log('env exists:', fs.existsSync(envPath))
    try { console.log('env content sample:\n', fs.readFileSync(envPath, 'utf8').split('\n').slice(0,20).join('\n')) } catch(e) { console.log('read env error', e && e.message) }
    console.log('dotenv result:', cfg && cfg.parsed ? 'loaded' : 'no-load')
    console.log('parsed keys:', cfg && cfg.parsed ? Object.keys(cfg.parsed) : null)
    console.log('DISABLE_TURNSTILE:', process.env.DISABLE_TURNSTILE)
    console.log('TURNSTILE_SECRET present:', !!process.env.TURNSTILE_SECRET)
    if (cfg && cfg.parsed) console.log('parsed.TURNSTILE_SECRET:', cfg.parsed.TURNSTILE_SECRET)

    const res = await verifyTurnstile('')
    console.log('verifyTurnstile result:', JSON.stringify(res))
  } catch (e) {
    console.error('check error', e && e.message ? e.message : String(e))
    process.exit(1)
  }
})()
