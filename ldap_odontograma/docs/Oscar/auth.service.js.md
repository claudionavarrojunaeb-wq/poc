**Archivo**: [docs/Oscar/auth.service.js](docs/Oscar/auth.service.js)

**Resumen**:
- **Propósito**: Gestionar la autenticación de usuarios, generación y rotación de tokens (access/refresh), recuperación y restablecimiento de contraseñas, activación de cuentas y registro de auditoría.
- **Alcance**: Funciona con autenticación local (hash + bcrypt) y LDAP; usa JWT para tokens y Prisma para persistencia en BD.

```text
Código Fuente (con números de línea)
```

```text
   1 import prisma from '../prisma.js'
   2 import bcrypt from 'bcryptjs'
   3 import jwt from 'jsonwebtoken'
   4 import LdapServiceClass from './ldap.service.js'
   5 import { validatePassword } from '../utils/validators.js'
   6 const LdapService = new LdapServiceClass()
   7 
   8 export const AuthService = {
   9     /**
  10      * Generate Access and Refresh Tokens
  11      */
  12     async generateTokens(user) {
  13         if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no configurado')
  14         if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET no configurado')
  15 
  16         const accessToken = jwt.sign(
  17             {
  18                 userId: user.usuario_id,
  19                 rut: user.rut,
  20                 role: user.tipo_usuario
  21             },
  22             process.env.JWT_SECRET,
  23             { expiresIn: '15m' }
  24         )
  25 
  26         const refreshToken = jwt.sign(
  27             { userId: user.usuario_id, type: 'REFRESH' },
  28             process.env.JWT_REFRESH_SECRET,
  29             { expiresIn: '7d' }
  30         )
  31 
  32         // Revocar todos los refresh tokens anteriores del usuario (prevenir acumulación)
  33         await prisma.refreshTokens.updateMany({
  34             where: {
  35                 usuario_id: user.usuario_id,
  36                 revoked: false
  37             },
  38             data: { revoked: true }
  39         })
  40 
  41         // Guardar nuevo refresh token en DB
  42         const expiresAt = new Date()
  43         expiresAt.setDate(expiresAt.getDate() + 7)
  44 
  45         await prisma.refreshTokens.create({
  46             data: {
  47                 token: refreshToken,
  48                 usuario_id: user.usuario_id,
  49                 expiresAt: expiresAt,
  50                 createdAt: new Date(),
  51                 revoked: false
  52             }
  53         })
  54 
  55         return { accessToken, refreshToken }
  56     },
  57 
  58     /**
  59      * Login User
  60      * @param {string} email - Email or RUT
  61      * @param {string} password
  62      */
  63     async login(email, password, ipAddress, userAgent) {
  64         // 1. Find User by Email
  65         const user = await prisma.usuarios.findUnique({
  66             where: { correo_electronico: email }
  67         })
  68 
  69         if (!user) {
  70             // Registrar intento fallido (Usuario no encontrado)
  71             await this.logAudit(null, email, 'LOGIN_FAILED', 'Usuario no encontrado', ipAddress, userAgent)
  72             throw new Error('Credenciales inválidas')
  73         }
  74 
  75         if (user.bloqueado) {
  76             await this.logAudit(user.usuario_id, email, 'LOGIN_BLOCKED', 'Cuenta bloqueada', ipAddress, userAgent)
  77             throw new Error('Cuenta bloqueada. Contacte al administrador.')
  78         }
  79 
  80         if (!user.activo) {
  81             await this.logAudit(user.usuario_id, email, 'LOGIN_INACTIVE', 'Cuenta inactiva', ipAddress, userAgent)
  82             throw new Error('Su cuenta aún no ha sido activada. Por favor, revise su correo para activar la cuenta o contacte al administrador.')
  83         }
  84 
  85         let isAuthenticated = false
  86 
  87         try {
  88             // 2. Authenticate based on type
  89             if (user.tipo_autenticacion === 'LDAP') {
  90                 console.log(`[AUTH] Intentando autenticación LDAP para: ${email}`)
  91                 console.log(`[AUTH] Servidor LDAP: ${process.env.LDAP_HOST}:${process.env.LDAP_PORT}`)
  92                 console.log(`[AUTH] Admin DN: ${process.env.LDAP_USUARIO_DN}`)
  93 
  94                 const ldapResult = await LdapService.authenticate(email, password)
  95 
  96                 console.log(`[AUTH] Resultado LDAP:`, {
  97                     success: ldapResult.success,
  98                     error: ldapResult.error?.message || null,
  99                     errorCode: ldapResult.error?.code || null
 100                 })
 101 
 102                 if (!ldapResult.success) {
 103                     throw new Error(`Credenciales LDAP inválidas: ${ldapResult.error?.message || 'sin detalle'}`)
 104                 }
 105 
 106                 isAuthenticated = true
 107             } else {
 108                 // Local Auth
 109                 console.log(`[AUTH] Intentando autenticación LOCAL para: ${email}`)
 110                 if (!user.password_hash) throw new Error('Usuario no configurado para acceso local')
 111                 isAuthenticated = await bcrypt.compare(password, user.password_hash)
 112                 console.log(`[AUTH] Resultado LOCAL: ${isAuthenticated ? 'OK' : 'Contraseña incorrecta'}`)
 113             }
 114         } catch (error) {
 115             console.error('[AUTH] Error en verificación de autenticación:', error.message)
 116             isAuthenticated = false
 117         }
 118 
 119         if (!isAuthenticated) {
 120             // Increment failed attempts
 121             const attempts = user.intentos_fallidos + 1
 122             let updateData = { intentos_fallidos: attempts }
 123 
 124             // Block if > 5 attempts (example policy)
 125             if (attempts >= 5) {
 126                 updateData.bloqueado = true
 127                 updateData.fecha_bloqueo = new Date()
 128             }
 129 
 130             await prisma.usuarios.update({
 131                 where: { usuario_id: user.usuario_id },
 132                 data: updateData
 133             })
 134 
 135             await this.logAudit(user.usuario_id, email, 'LOGIN_FAILED', 'Contraseña inválida', ipAddress, userAgent)
 136             throw new Error('Credenciales inválidas')
 137         }
 138 
 139         // 3. Login Success
 140         // Reset failed attempts, desbloquear cuenta si estaba bloqueada, y actualizar último login
 141         await prisma.usuarios.update({
 142             where: { usuario_id: user.usuario_id },
 143             data: {
 144                 intentos_fallidos: 0,
 145                 bloqueado: false,
 146                 fecha_bloqueo: null,
 147                 fecha_ultimo_login: new Date()
 148             }
 149         })
 150 
 151         // Generate Tokens
 152         const tokens = await this.generateTokens(user)
 153 
 154         // Log Success
 155         await this.logAudit(user.usuario_id, email, 'LOGIN_SUCCESS', 'Inicio de sesión exitoso', ipAddress, userAgent)
 156 
 157         // 4. Obtener prestadores asociados (solo para usuarios EXTERNO)
 158         let prestadores = []
 159         if (user.tipo_usuario === 'EXTERNO') {
 160             const usuariosPrestadores = await prisma.usuariosPrestadores.findMany({
 161                 where: { usuario_id: user.usuario_id },
 162                 include: {
 163                     Prestadores: {
 164                         select: {
 165                             prestador_id: true,
 166                             rut: true,
 167                             razon_social: true
 168                         }
 169                     }
 170                 }
 171             })
 172             prestadores = usuariosPrestadores.map(up => ({
 173                 prestador_id: up.Prestadores.prestador_id,
 174                 rut: up.Prestadores.rut,
 175                 razon_social: up.Prestadores.razon_social
 176             }))
 177         }
 178 
 179         // 5. Obtener permisos del usuario desde sus roles
 180         const permisos = await this.getUserPermisos(user.usuario_id)
 181 
 182         return {
 183             user: {
 184                 id: user.usuario_id,
 185                 nombres: user.nombres,
 186                 email: user.correo_electronico,
 187                 role: user.tipo_usuario,
 188                 prestadores,
 189                 permisos
 190             },
 191             ...tokens
 192         }
 193     },
 194 
 195     async setupPassword(token, newPassword) {
 196         try {
 197             // 1. Verify token
 198             if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no configurado')
 199             const decoded = jwt.verify(token, process.env.JWT_SECRET)
 200 
 201             if (decoded.purpose !== 'SETUP_PASSWORD') {
 202                 throw new Error('Token inválido para esta operación')
 203             }
 204 
 205             // 2. Validar complejidad de contraseña
 206             const passwordValidation = validatePassword(newPassword)
 207             if (!passwordValidation.valid) {
 208                 throw new Error(passwordValidation.errors.join('. '))
 209             }
 210 
 211             // 3. Hash new password
 212             const salt = await bcrypt.genSalt(10)
 213             const hashedPassword = await bcrypt.hash(newPassword, salt)
 214 
 215             // 4. Update user
 216             const user = await prisma.usuarios.findUnique({
 217                 where: { usuario_id: decoded.userId }
 218             })
 219 
 220             if (!user) throw new Error('Usuario no encontrado')
 221 
 222             await prisma.usuarios.update({
 223                 where: { usuario_id: decoded.userId },
 224                 data: {
 225                     password_hash: hashedPassword,
 226                     fecha_modificacion: new Date()
 227                 }
 228             })
 229 
 230             return { success: true }
 231         } catch (error) {
 232             throw new Error(`Error al establecer contraseña: ${error.message}`)
 233         }
 234     },
 235 
 236     async logAudit(userId, loginInput, eventType, details, ip, ua) {
 237         try {
 238             await prisma.auditoriaAccesos.create({
 239                 data: {
 240                     usuario_id: userId,
 241                     input_login: loginInput,
 242                     fecha_evento: new Date(),
 243                     tipo_evento: eventType,
 244                     direccion_ip: ip,
 245                     user_agent: ua,
 246                     detalle: details
 247                 }
 248             })
 249         } catch (e) {
 250             console.error('Error al escribir registro de auditoría:', e)
 251         }
 252     },
 253 
 254     /**
 255      * Obtener array de códigos de permisos del usuario (desde sus roles)
 256      */
 257     async getUserPermisos(userId) {
 258         const usuariosRoles = await prisma.usuariosRoles.findMany({
 259             where: { usuario_id: userId },
 260             include: {
 261                 Roles: {
 262                     include: {
 263                         RolesPermisos: {
 264                             include: { Permisos: true }
 265                         }
 266                     }
 267                 }
 268             }
 269         })
 270         return [
 271             ...new Set(
 272                 usuariosRoles.flatMap(ur =>
 273                     (ur.Roles.RolesPermisos || []).map(rp => rp.Permisos.codigo)
 274                 )
 275             )
 276         ]
 277     },
 278 
 279     /**
 280      * Renovar access token usando refresh token (con rotación)
 281      * @param {string} refreshToken - Refresh token actual
 282      * @returns {Promise<Object>} Nuevo access token y nuevo refresh token
 283      */
 284     async refreshAccessToken(refreshToken) {
 285         try {
 286             // 1. Verificar refresh token
 287             if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET no configurado')
 288             const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
 289 
 290             if (decoded.type !== 'REFRESH') {
 291                 throw new Error('Token inválido')
 292             }
 293 
 294             // 2. Buscar token en base de datos
 295             const storedToken = await prisma.refreshTokens.findUnique({
 296                 where: { token: refreshToken },
 297                 include: {
 298                     Usuarios: true
 299                 }
 300             })
 301 
 302             if (!storedToken) {
 303                 throw new Error('Token no encontrado')
 304             }
 305 
 306             // 3. Verificar que no esté revocado
 307             if (storedToken.revoked) {
 308                 // Posible ataque: alguien está usando un token ya revocado
 309                 console.warn(`⚠️ Intento de uso de refresh token revocado. Usuario: ${storedToken.usuario_id}`)
 310                 throw new Error('Token revocado. Por seguridad, cierre sesión e inicie nuevamente.')
 311             }
 312 
 313             // 4. Verificar expiración
 314             if (new Date() > storedToken.expiresAt) {
 315                 throw new Error('Token expirado. Debe iniciar sesión nuevamente.')
 316             }
 317 
 318             // 5. Revocar el refresh token actual (rotación)
 319             await prisma.refreshTokens.update({
 320                 where: { id: storedToken.id },
 321                 data: { revoked: true }
 322             })
 323 
 324             // 6. Generar nuevo access token
 325             const accessToken = jwt.sign(
 326                 {
 327                     userId: storedToken.Usuarios.usuario_id,
 328                     rut: storedToken.Usuarios.rut,
 329                     role: storedToken.Usuarios.tipo_usuario
 330                 },
 331                 process.env.JWT_SECRET,
 332                 { expiresIn: '15m' }
 333             )
 334 
 335             // 7. Generar nuevo refresh token (rotación)
 336             const newRefreshToken = jwt.sign(
 337                 { userId: storedToken.Usuarios.usuario_id, type: 'REFRESH' },
 338                 process.env.JWT_REFRESH_SECRET,
 339                 { expiresIn: '7d' }
 340             )
 341 
 342             // 8. Guardar nuevo refresh token en DB
 343             const expiresAt = new Date()
 344             expiresAt.setDate(expiresAt.getDate() + 7)
 345 
 346             await prisma.refreshTokens.create({
 347                 data: {
 348                     token: newRefreshToken,
 349                     usuario_id: storedToken.Usuarios.usuario_id,
 350                     expiresAt: expiresAt,
 351                     createdAt: new Date(),
 352                     revoked: false
 353                 }
 354             })
 355 
 356             return {
 357                 accessToken,
 358                 refreshToken: newRefreshToken
 359             }
 360         } catch (error) {
 361             throw new Error(`Error al renovar token: ${error.message}`)
 362         }
 363     },
 364 
 365     /**
 366      * Cerrar sesión revocando el refresh token
 367      * @param {string} refreshToken - Refresh token a revocar
 368      * @returns {Promise<Object>} Confirmación
 369      */
 370     async logout(refreshToken) {
 371         try {
 372             // Marcar token como revocado
 373             const result = await prisma.refreshTokens.updateMany({
 374                 where: {
 375                     token: refreshToken,
 376                     revoked: false
 377                 },
 378                 data: { revoked: true }
 379             })
 380 
 381             if (result.count === 0) {
 382                 throw new Error('Token no encontrado o ya revocado')
 383             }
 384 
 385             return { success: true }
 386         } catch (error) {
 387             throw new Error(`Error al cerrar sesión: ${error.message}`)
 388         }
 389     },
 390 
 391     /**
 392      * Solicitar recuperación de contraseña (solo usuarios EXTERNOS/LOCAL)
 393      */
 394     async requestPasswordReset(email) {
 395         try {
 396             const emailService = (await import('./email.service.js')).default
 397 
 398             // 1. Buscar usuario por email
 399             const user = await prisma.usuarios.findUnique({
 400                 where: { correo_electronico: email }
 401             })
 402 
 403             // Por seguridad, siempre retornar el mismo mensaje
 404             const successMessage = 'Si el correo existe, recibirás un enlace de recuperación'
 405 
 406             // 2. Validar que el usuario existe
 407             if (!user) {
 408                 return { success: true, message: successMessage }
 409             }
 410 
 411             // 3. Validar que es usuario LOCAL (no LDAP)
 412             if (user.tipo_autenticacion !== 'LOCAL') {
 413                 // Usuario INTERNO/LDAP no puede recuperar contraseña
 414                 return { success: true, message: successMessage }
 415             }
 416 
 417             // 4. Validar que la cuenta no esté bloqueada
 418             if (user.bloqueado) {
 419                 throw new Error('Cuenta bloqueada. Contacte al administrador.')
 420             }
 421 
 422             // 5. Generar token único
 423             const crypto = await import('crypto')
 424             const token = crypto.randomBytes(32).toString('hex')
 425 
 426             // 6. Calcular expiración (1 hora)
 427             const expiresAt = new Date()
 428             expiresAt.setHours(expiresAt.getHours() + 1)
 429 
 430             // 7. Revocar tokens anteriores del usuario
 431             await prisma.passwordResetTokens.updateMany({
 432                 where: {
 433                     usuario_id: user.usuario_id,
 434                     used: false
 435                 },
 436                 data: { used: true }
 437             })
 438 
 439             // 8. Guardar nuevo token
 440             await prisma.passwordResetTokens.create({
 441                 data: {
 442                     usuario_id: user.usuario_id,
 443                     token: token,
 444                     expiresAt: expiresAt
 445                 }
 446             })
 447 
 448             // 9. Enviar email
 449             await emailService.sendPasswordResetEmail(email, token, user.nombres)
 450 
 451             return { success: true, message: successMessage }
 452         } catch (error) {
 453             console.error('Error en requestPasswordReset:', error.message)
 454             throw error
 455         }
 456     },
 457 
 458     /**
 459      * Activar cuenta (Usuarios Internos)
 460      */
 461     async activateAccount(token) {
 462         try {
 463             // 1. Validar token
 464             const resetToken = await prisma.passwordResetTokens.findUnique({
 465                 where: { token },
 466                 include: { Usuarios: true }
 467             })
 468 
 469             if (!resetToken) throw new Error('Token inválido')
 470             if (resetToken.used) throw new Error('Este enlace ya fue utilizado')
 471             if (new Date() > resetToken.expiresAt) throw new Error('Este enlace ha expirado')
 472 
 473             // 2. Activar usuario
 474             await prisma.usuarios.update({
 475                 where: { usuario_id: resetToken.usuario_id },
 476                 data: {
 477                     activo: true,
 478                     intentos_fallidos: 0,
 479                     bloqueado: false,
 480                     fecha_modificacion: new Date()
 481                 }
 482             })
 483 
 484             // 3. Marcar token como usado
 485             await prisma.passwordResetTokens.update({
 486                 where: { id: resetToken.id },
 487                 data: { used: true, usedAt: new Date() }
 488             })
 489 
 490             return { success: true, message: 'Cuenta activada exitosamente' }
 491         } catch (error) {
 492             throw new Error(error.message)
 493         }
 494     },
 495 
 496     /**
 497      * Generar token de recuperación/activación
 498      */
 499     async createPasswordResetToken(userId) {
 500         const crypto = await import('crypto')
 501         const token = crypto.randomBytes(32).toString('hex')
 502 
 503         // Expiración 7 días
 504         const expiresAt = new Date()
 505         expiresAt.setDate(expiresAt.getDate() + 7)
 506 
 507         // Revocar tokens anteriores
 508         await prisma.passwordResetTokens.updateMany({
 509             where: {
 510                 usuario_id: userId,
 511                 used: false
 512             },
 513             data: { used: true }
 514         })
 515 
 516         // Guardar nuevo token
 517         await prisma.passwordResetTokens.create({
 518             data: {
 519                 usuario_id: userId,
 520                 token: token,
 521                 expiresAt: expiresAt,
 522                 used: false,
 523                 createdAt: new Date()
 524             }
 525         })
 526 
 527         return token
 528     },
 529 
 530     /**
 531      * Validar token de recuperación
 532      */
 533     async validateResetToken(token) {
 534         try {
 535             const resetToken = await prisma.passwordResetTokens.findUnique({
 536                 where: { token },
 537                 include: { Usuarios: true }
 538             })
 539 
 540             if (!resetToken) {
 541                 throw new Error('Token inválido')
 542             }
 543 
 544             if (resetToken.used) {
 545                 throw new Error('Este enlace ya fue utilizado')
 546             }
 547 
 548             if (new Date() > resetToken.expiresAt) {
 549                 throw new Error('Este enlace ha expirado')
 550             }
 551 
 552             return {
 553                 success: true,
 554                 email: resetToken.Usuarios.correo_electronico
 555             }
 556         } catch (error) {
 557             throw new Error(error.message)
 558         }
 559     },
 560 
 561     /**
 562      * Restablecer contraseña
 563      */
 564     async resetPassword(token, newPassword) {
 565         try {
 566             console.log('1. Buscando token...')
 567             // 1. Validar token
 568             const resetToken = await prisma.passwordResetTokens.findUnique({
 569                 where: { token },
 570                 include: { Usuarios: true }
 571             })
 572             console.log('Token encontrado:', resetToken ? 'Sí' : 'No')
 573 
 574             if (!resetToken) {
 575                 throw new Error('Token inválido')
 576             }
 577 
 578             if (resetToken.used) {
 579                 throw new Error('Este enlace ya fue utilizado')
 580             }
 581 
 582             if (new Date() > resetToken.expiresAt) {
 583                 throw new Error('Este enlace ha expirado')
 584             }
 585 
 586             console.log('2. Validando contraseña...')
 587             // 2. Validar complejidad de contraseña
 588             const passwordValidation = validatePassword(newPassword)
 589             console.log('Validación:', passwordValidation)
 590             if (!passwordValidation.valid) {
 591                 throw new Error(passwordValidation.errors.join('. '))
 592             }
 593 
 594             console.log('3. Hasheando contraseña...')
 595             // 3. Hashear nueva contraseña
 596             const password_hash = await bcrypt.hash(newPassword, 10)
 597 
 598             console.log('4. Actualizando usuario...')
 599             // 4. Actualizar contraseña del usuario
 600             await prisma.usuarios.update({
 601                 where: { usuario_id: resetToken.usuario_id },
 602                 data: {
 603                     password_hash: password_hash,
 604                     intentos_fallidos: 0,
 605                     bloqueado: false,
 606                     fecha_bloqueo: null,
 607                     activo: true
 608                 }
 609             })
 610 
 611             console.log('5. Marcando token como usado...')
 612             // 5. Marcar token como usado
 613             await prisma.passwordResetTokens.update({
 614                 where: { id: resetToken.id },
 615                 data: {
 616                     used: true,
 617                     usedAt: new Date()
 618                 }
 619             })
 620 
 621             console.log('6. Revocando refresh tokens...')
 622             // 6. Revocar todos los refresh tokens del usuario
 623             await prisma.refreshTokens.updateMany({
 624                 where: {
 625                     usuario_id: resetToken.usuario_id,
 626                     revoked: false
 627                 },
 628                 data: { revoked: true }
 629             })
 630 
 631             console.log('✅ Contraseña actualizada exitosamente')
 632             return { success: true, message: 'Contraseña actualizada exitosamente' }
 633         } catch (error) {
 634             console.error('❌ Error en resetPassword service:', error)
 635             throw new Error(error.message || 'Error al restablecer contraseña')
 636         }
 637     }
 638 }
```

**Explicación por secciones**:

**Imports**
- **`prisma`**: Cliente Prisma para realizar operaciones sobre la base de datos. Se usan modelos como `usuarios`, `refreshTokens`, `passwordResetTokens`, `auditoriaAccesos`, `usuariosPrestadores`, `usuariosRoles`, `Roles`, `Permisos`.
- **`bcrypt`**: Librería para hashear y comparar contraseñas (`bcrypt.hash`, `bcrypt.compare`).
- **`jwt`**: `jsonwebtoken` para firmar y verificar tokens JWT (access y refresh).
- **`LdapServiceClass` / `LdapService`**: Servicio local para autenticación LDAP; se instancia una clase `LdapServiceClass` para usar `LdapService.authenticate(email, password)`.
- **`validatePassword`**: Función utilitaria que valida reglas de complejidad de contraseña (no incluida aquí, proviene de `../utils/validators.js`).

... (Explicación resumida; el bloque línea por línea completo está en `auth.service.numbered.txt`)

---
Archivo generado automáticamente: `docs/Oscar/auth.service.js.md`
