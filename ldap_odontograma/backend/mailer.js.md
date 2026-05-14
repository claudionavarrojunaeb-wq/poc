# Documentación detallada para backend/mailer.js

Este documento contiene el código fuente del módulo de envío de correos y una explicación línea por línea de cada instrucción, su propósito y por qué existe en el flujo de la aplicación.

---

## Código fuente

```js
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
let etherealTestAccount = null

export async function ensureTransporter() {
  if (transporter) return transporter

  if (MAIL_TEST) {
    try {
      const testAccount = await nodemailer.createTestAccount()
      etherealTestAccount = testAccount
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
    secure: false,
    requireTLS: true,
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
  } catch (e) {
    return null
  }
}

export default { ensureTransporter, getPreviewUrl }

```

---

## Explicación línea por línea

1. `import nodemailer from 'nodemailer'`
   - Importa la librería `nodemailer`, que es la utilidad principal para crear transportadores SMTP y enviar correos desde Node.js.
   - Por qué: centraliza la funcionalidad de envío y permite crear cuentas de prueba (Ethereal) en modo test.

2. `import path from 'path'`
   - Importa el módulo nativo `path` de Node.js para manejar rutas de archivos de forma portátil.
   - Por qué: se usa para construir la ruta al archivo `.env` en el mismo directorio del módulo.

3. `import dotenv from 'dotenv'`
   - Importa `dotenv` para cargar variables de entorno desde un archivo `.env` en tiempo de ejecución.
   - Por qué: permite configurar valores por defecto y facilidad de desarrollo sin depender exclusivamente del entorno del proceso.

4. `import { fileURLToPath } from 'url'`
   - Importa la función `fileURLToPath` para convertir `import.meta.url` (URL del módulo ESM) a una ruta de archivo del sistema.
   - Por qué: en módulos ESM `__filename` y `__dirname` no existen, por lo que se recrean con esta ayuda.

5. (línea en blanco)
   - Separador visual entre imports y la inicialización del contexto de archivo.

6. `const __filename = fileURLToPath(import.meta.url)`
   - Convierte la URL del módulo (`import.meta.url`) a la ruta absoluta del archivo actual.
   - Por qué: reproducir el comportamiento clásico de `__filename` en ESM para construir rutas relativas.

7. `const __dirname = path.dirname(__filename)`
   - Obtiene el directorio que contiene este archivo a partir de `__filename`.
   - Por qué: necesario para localizar archivos respecto al módulo (ej. `.env`).

8. `dotenv.config({ path: path.join(__dirname, '.env'), override: true })`
   - Carga las variables definidas en `.env` ubicado en el mismo directorio que este archivo.
   - `override: true` fuerza que las variables del archivo reemplacen las existentes en `process.env`.
   - Por qué: facilita el desarrollo local y hace explícita la carga del `.env` internal al paquete.

9. (línea en blanco)

10. `// Configuración del mailer a partir de variables de entorno`
    - Comentario que indica que a continuación se leen y normalizan variables de entorno.

11. `const MAIL_HOST = process.env.MAIL_HOST || 'relay.fidelizador.com'`
    - Define el servidor SMTP a usar; usa el valor de `MAIL_HOST` si existe o un host por defecto.
    - Por qué: permite cambiar el relay SMTP sin tocar código.

12. `const MAIL_PORT = Number(process.env.MAIL_PORT || 587)`
    - Convierte el puerto proporcionado por `MAIL_PORT` a número, o usa `587` por defecto (STARTTLS común).
    - Por qué: nodemailer espera un número en `port`.

13-15. `const MAIL_AUTH = typeof process.env.MAIL_AUTH === 'undefined' ? true : (process.env.MAIL_AUTH === '1' || process.env.MAIL_AUTH === 'true')`
    - Normaliza la variable `MAIL_AUTH` a booleano:
      - Si no está definida, se asume `true` (usar autenticación por defecto).
      - Si está definida, se considera `true` cuando vale `'1'` o `'true'`.
    - Por qué: permite desactivar la autenticación (por ejemplo, para un relay abierto) mediante una variable de entorno.

16. `const MAIL_USER = process.env.MAIL_USER || 'jrelay2025.d02041+cl1.fidelizador.com'`
    - Usuario SMTP por defecto o leído desde la variable `MAIL_USER`.

17. `const MAIL_PASS = process.env.MAIL_PASS || ''`
    - Contraseña SMTP; valor por defecto vacío para evitar `undefined`.

18. `const MAIL_SECURE = process.env.MAIL_SECURE === '1' || process.env.MAIL_SECURE === 'true'`
    - Bandera booleana que indica si el transporte debe usar conexión segura (SMTPS, puerto 465).
    - Nota: en este módulo no se usa directamente `MAIL_SECURE` al crear el transporter (se fija `secure: false`), pero la variable está disponible si se necesitara.

19-21. `const MAIL_REQUIRE_TLS = typeof process.env.MAIL_REQUIRE_TLS === 'undefined' ? true : (process.env.MAIL_REQUIRE_TLS === '1' || process.env.MAIL_REQUIRE_TLS === 'true')`
    - Normaliza `MAIL_REQUIRE_TLS` a booleano; por defecto `true` si no está definida.
    - Por qué: fuerza el uso de TLS/STARTTLS en conexiones que lo soporten, mejorando la seguridad en tránsito.

22. `const SMTP_NAME = process.env.SMTP_NAME || 'relay.fidelizador.com'`
    - Nombre que se utiliza como `name` en la configuración del transporte (valor para HELO/EHLO).

23. `const MAIL_TEST = process.env.MAIL_TEST === '1' || process.env.MAIL_TEST === 'true'`
    - Booleana que indica si se está en modo de pruebas con Ethereal (`true`) o en modo producción (`false`).
    - Por qué: en tests se usa Ethereal para obtener URLs de vista previa sin enviar correos reales.

24. (línea en blanco)

25. `let transporter = null`
    - Variable de caché para el transporte SMTP (instancia de `nodemailer.Transporter`) compartida en el módulo.
    - Por qué: evita recrear el transporter en cada envío y reduce latencia y consumo de recursos.

26. `let etherealTestAccount = null`
    - Almacena los datos de la cuenta de prueba Ethereal cuando `MAIL_TEST` está activo (útil para debug / preview).

27. (línea en blanco)

28. `export async function ensureTransporter() {`
    - Función pública que crea (si hace falta) y devuelve el `transporter` listo para enviar correos.
    - Por qué: encapsula la lógica de inicialización, reuso y modo test/producción.

29. `  if (transporter) return transporter`
    - Si ya existe un transporter inicializado, lo devuelve inmediatamente (cache hit).

30. (línea en blanco)

31. `  if (MAIL_TEST) {`
    - Rama que se ejecuta en modo test para crear un transporte hacia Ethereal (no envía correos reales).

32. `    try {`
    - Inicio del bloque try/catch para manejar errores al crear la cuenta de prueba.

33. `      const testAccount = await nodemailer.createTestAccount()`
    - Crea una cuenta de prueba Ethereal (credenciales temporales) de forma asíncrona.
    - Por qué: Ethereal permite inspeccionar los correos enviados en una interfaz web sin necesidad de un servidor SMTP real.

34. `      etherealTestAccount = testAccount`
    - Guarda la información de la cuenta de prueba en la variable del módulo para uso posterior si es necesario.

35-44. `      transporter = nodemailer.createTransport({...})`
    - Configura un transporter apuntando a `smtp.ethereal.email` usando las credenciales creadas.
    - Opciones claves:
      - `host: 'smtp.ethereal.email'` y `port: 587` → servidor Ethereal.
      - `secure: false` → se usará STARTTLS, no SMTPS por defecto.
      - `auth` → credenciales temporales de Ethereal.
      - `tls.rejectUnauthorized: false` → permitir certificados no verificados (útil en entornos de test).
      - `logger`/`debug` → activan salida de log útil para depuración de emails.
      - `name: 'ethereal'` → nombre del cliente SMTP en EHLO.
    - Por qué: permite enviar correos y obtener una URL de vista previa sin afectar entornos productivos.

45. `      console.log('Ethereal test account created:', testAccount.user)`
    - Log informativo con el nombre de usuario de la cuenta de prueba (útil al depurar tests).

46. `      return transporter`
    - Devuelve el transporter ya inicializado para su uso inmediato.

47-50. `    } catch (e) { ... }`
    - Registra el error al fallar la creación de la cuenta de prueba y vuelve a lanzar la excepción.
    - Por qué: si falla la cuenta de prueba, es mejor propagar el error para que la inicialización falle visiblemente.

51. `  }` (fin de la rama MAIL_TEST)

52. (línea en blanco)

53-63. `  transporter = nodemailer.createTransport({...})`
    - Configuración del transporter para entornos no-test (producción o staging).
    - Opciones clave explicadas:
      - `host: MAIL_HOST` y `port: MAIL_PORT || 587` → servidor SMTP configurado por entorno.
      - `secure: false` y `requireTLS: true` → se conecta inicialmente sin TLS y solicita STARTTLS para seguridad.
      - `auth: MAIL_AUTH ? { user: MAIL_USER, pass: MAIL_PASS } : undefined` → incluye credenciales si `MAIL_AUTH` está habilitado.
      - `tls.rejectUnauthorized: false` → permite certificados autofirmados; en producción se recomienda `true` si se confía en CA.
      - `logger`/`debug` → habilitan trazas para diagnosticar problemas de envío.
      - `name: SMTP_NAME` → nombre usado en HELO/EHLO.
    - Por qué: encapsula la configuración reusable del transporte SMTP, permitiendo cambiar el comportamiento vía variables de entorno.

64. (línea en blanco)

65. `  return transporter`
    - Devuelve el transporter recién creado.

66. `}` (fin de `ensureTransporter`)

67. (línea en blanco)

68. `export function getPreviewUrl(info) {`
    - Función auxiliar que devuelve la URL de previsualización de Ethereal para un `info` devuelto por `transporter.sendMail`.
    - Por qué: en modo test permite abrir el correo enviado en una interfaz web sin enviarlo a destinatarios reales.

69. `  if (!MAIL_TEST) return null`
    - Si no estamos en modo test, la función devuelve `null` porque no existe URL de preview.

70-74. `  try { return nodemailer.getTestMessageUrl(info) } catch (e) { return null }`
    - Intenta obtener la URL de vista previa usando la utilidad de nodemailer.
    - Si falla (por ejemplo `info` no corresponde a Ethereal), devuelve `null` silenciosamente.

75. `}` (fin de `getPreviewUrl`)

76. (línea en blanco)

77. `export default { ensureTransporter, getPreviewUrl }`
    - Exporta por defecto un objeto con las funciones públicas del módulo para importación cómoda.

---

## Notas y recomendaciones

- En producción, asegurar que `MAIL_REQUIRE_TLS` y `MAIL_AUTH` estén configurados correctamente y que `tls.rejectUnauthorized` se ajuste según el nivel de confianza de los certificados del relay SMTP.
- Evitar dejar credenciales en el código: usar un gestor de secretos o variables de entorno seguras en el despliegue.
- `MAIL_TEST` es útil para integración y pruebas automatizadas; Ethereal no debe usarse en entornos reales.
- Si se necesita soporte de SMTPS (puerto 465), `MAIL_SECURE` puede habilitarse y usarse al construir el transporte.

Si quieres, puedo:
- Actualizar la inicialización para respetar `MAIL_SECURE` de forma efectiva.
- Añadir un pequeño ejemplo de uso (cómo llamar a `ensureTransporter()` y `getPreviewUrl(info)`).

