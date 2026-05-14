import { Client as LdapClient } from 'ldapts'

// Genera la lista de formatos de principal LDAP para un username dado.
// Soporta plantillas {username} / {{username}}, base DN, UPN y NetBIOS.
// Se exporta para que index.js pueda usarla en el handler de /api/login.
export function buildPrincipalFormats(username) {
  const set = new Set()
  if (process.env.LDAP_DN_TEMPLATE) {
    set.add(process.env.LDAP_DN_TEMPLATE.replace(/\{\{?username\}?\}/g, username))
  }
  if (process.env.LDAP_BASE_DN) {
    set.add(`uid=${username},${process.env.LDAP_BASE_DN}`)
    set.add(`cn=${username},${process.env.LDAP_BASE_DN}`)
  }
  if (process.env.LDAP_DOMAIN) {
    set.add(`${username}@${process.env.LDAP_DOMAIN}`)
    const netbios = String(process.env.LDAP_DOMAIN).split('.')[0]
    if (netbios) set.add(`${netbios}\\${username}`)
  }
  set.add(username)
  return Array.from(set)
}

// Intenta hacer bind LDAP con un principal y contraseña dados.
// Lanza error si falla; si tiene éxito, hace unbind y retorna true.
// Se exporta para que index.js lo llame dentro del handler de /api/login.
export async function tryBind(url, principal, password) {
  const client = new LdapClient({ url, timeout: 5000, connectTimeout: 5000 })
  try {
    await client.bind(principal, password)
    await client.unbind()
    return true
  } catch (err) {
    console.warn(`LDAP bind error for principal ${principal}:`, err && err.message ? err.message : String(err))
    try { await client.unbind() } catch { /* ignore */ }
    throw err
  }
}
