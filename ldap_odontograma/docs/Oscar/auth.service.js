import prisma from '../prisma.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import LdapServiceClass from './ldap.service.js'
import { validatePassword } from '../utils/validators.js'
const LdapService = new LdapServiceClass()

export const AuthService = {
    /**
     * Generate Access and Refresh Tokens
     */
    async generateTokens(user) {
        if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no configurado')
        if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET no configurado')

        const accessToken = jwt.sign(
            {
                userId: user.usuario_id,
                rut: user.rut,
                role: user.tipo_usuario
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        )

        const refreshToken = jwt.sign(
            { userId: user.usuario_id, type: 'REFRESH' },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        )

        // Revocar todos los refresh tokens anteriores del usuario (prevenir acumulación)
        await prisma.refreshTokens.updateMany({
            where: {
                usuario_id: user.usuario_id,
                revoked: false
            },
            data: { revoked: true }
        })

        // Guardar nuevo refresh token en DB
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)

        await prisma.refreshTokens.create({
            data: {
                token: refreshToken,
                usuario_id: user.usuario_id,
                expiresAt: expiresAt,
                createdAt: new Date(),
                revoked: false
            }
        })

        return { accessToken, refreshToken }
    },

    /**
     * Login User
     * @param {string} email - Email or RUT
     * @param {string} password
     */
    async login(email, password, ipAddress, userAgent) {
        // 1. Find User by Email
        const user = await prisma.usuarios.findUnique({
            where: { correo_electronico: email }
        })

        if (!user) {
            // Registrar intento fallido (Usuario no encontrado)
            await this.logAudit(null, email, 'LOGIN_FAILED', 'Usuario no encontrado', ipAddress, userAgent)
            throw new Error('Credenciales inválidas')
        }

        if (user.bloqueado) {
            await this.logAudit(user.usuario_id, email, 'LOGIN_BLOCKED', 'Cuenta bloqueada', ipAddress, userAgent)
            throw new Error('Cuenta bloqueada. Contacte al administrador.')
        }

        if (!user.activo) {
            await this.logAudit(user.usuario_id, email, 'LOGIN_INACTIVE', 'Cuenta inactiva', ipAddress, userAgent)
            throw new Error('Su cuenta aún no ha sido activada. Por favor, revise su correo para activar la cuenta o contacte al administrador.')
        }

        let isAuthenticated = false

        try {
            // 2. Authenticate based on type
            if (user.tipo_autenticacion === 'LDAP') {
                console.log(`[AUTH] Intentando autenticación LDAP para: ${email}`)
                console.log(`[AUTH] Servidor LDAP: ${process.env.LDAP_HOST}:${process.env.LDAP_PORT}`)
                console.log(`[AUTH] Admin DN: ${process.env.LDAP_USUARIO_DN}`)

                const ldapResult = await LdapService.authenticate(email, password)

                console.log(`[AUTH] Resultado LDAP:`, {
                    success: ldapResult.success,
                    error: ldapResult.error?.message || null,
                    errorCode: ldapResult.error?.code || null
                })

                if (!ldapResult.success) {
                    throw new Error(`Credenciales LDAP inválidas: ${ldapResult.error?.message || 'sin detalle'}`)
                }

                isAuthenticated = true
            } else {
                // Local Auth
                console.log(`[AUTH] Intentando autenticación LOCAL para: ${email}`)
                if (!user.password_hash) throw new Error('Usuario no configurado para acceso local')
                isAuthenticated = await bcrypt.compare(password, user.password_hash)
                console.log(`[AUTH] Resultado LOCAL: ${isAuthenticated ? 'OK' : 'Contraseña incorrecta'}`)
            }
        } catch (error) {
            console.error('[AUTH] Error en verificación de autenticación:', error.message)
            isAuthenticated = false
        }

        if (!isAuthenticated) {
            // Increment failed attempts
            const attempts = user.intentos_fallidos + 1
            let updateData = { intentos_fallidos: attempts }

            // Block if > 5 attempts (example policy)
            if (attempts >= 5) {
                updateData.bloqueado = true
                updateData.fecha_bloqueo = new Date()
            }

            await prisma.usuarios.update({
                where: { usuario_id: user.usuario_id },
                data: updateData
            })

            await this.logAudit(user.usuario_id, email, 'LOGIN_FAILED', 'Contraseña inválida', ipAddress, userAgent)
            throw new Error('Credenciales inválidas')
        }

        // 3. Login Success
        // Reset failed attempts, desbloquear cuenta si estaba bloqueada, y actualizar último login
        await prisma.usuarios.update({
            where: { usuario_id: user.usuario_id },
            data: {
                intentos_fallidos: 0,
                bloqueado: false,
                fecha_bloqueo: null,
                fecha_ultimo_login: new Date()
            }
        })

        // Generate Tokens
        const tokens = await this.generateTokens(user)

        // Log Success
        await this.logAudit(user.usuario_id, email, 'LOGIN_SUCCESS', 'Inicio de sesión exitoso', ipAddress, userAgent)

        // 4. Obtener prestadores asociados (solo para usuarios EXTERNO)
        let prestadores = []
        if (user.tipo_usuario === 'EXTERNO') {
            const usuariosPrestadores = await prisma.usuariosPrestadores.findMany({
                where: { usuario_id: user.usuario_id },
                include: {
                    Prestadores: {
                        select: {
                            prestador_id: true,
                            rut: true,
                            razon_social: true
                        }
                    }
                }
            })
            prestadores = usuariosPrestadores.map(up => ({
                prestador_id: up.Prestadores.prestador_id,
                rut: up.Prestadores.rut,
                razon_social: up.Prestadores.razon_social
            }))
        }

        // 5. Obtener permisos del usuario desde sus roles
        const permisos = await this.getUserPermisos(user.usuario_id)

        return {
            user: {
                id: user.usuario_id,
                nombres: user.nombres,
                email: user.correo_electronico,
                role: user.tipo_usuario,
                prestadores,
                permisos
            },
            ...tokens
        }
    },

    async setupPassword(token, newPassword) {
        try {
            // 1. Verify token
            if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no configurado')
            const decoded = jwt.verify(token, process.env.JWT_SECRET)

            if (decoded.purpose !== 'SETUP_PASSWORD') {
                throw new Error('Token inválido para esta operación')
            }

            // 2. Validar complejidad de contraseña
            const passwordValidation = validatePassword(newPassword)
            if (!passwordValidation.valid) {
                throw new Error(passwordValidation.errors.join('. '))
            }

            // 3. Hash new password
            const salt = await bcrypt.genSalt(10)
            const hashedPassword = await bcrypt.hash(newPassword, salt)

            // 4. Update user
            const user = await prisma.usuarios.findUnique({
                where: { usuario_id: decoded.userId }
            })

            if (!user) throw new Error('Usuario no encontrado')

            await prisma.usuarios.update({
                where: { usuario_id: decoded.userId },
                data: {
                    password_hash: hashedPassword,
                    fecha_modificacion: new Date()
                }
            })

            return { success: true }
        } catch (error) {
            throw new Error(`Error al establecer contraseña: ${error.message}`)
        }
    },

    async logAudit(userId, loginInput, eventType, details, ip, ua) {
        try {
            await prisma.auditoriaAccesos.create({
                data: {
                    usuario_id: userId,
                    input_login: loginInput,
                    fecha_evento: new Date(),
                    tipo_evento: eventType,
                    direccion_ip: ip,
                    user_agent: ua,
                    detalle: details
                }
            })
        } catch (e) {
            console.error('Error al escribir registro de auditoría:', e)
        }
    },

    /**
     * Obtener array de códigos de permisos del usuario (desde sus roles)
     */
    async getUserPermisos(userId) {
        const usuariosRoles = await prisma.usuariosRoles.findMany({
            where: { usuario_id: userId },
            include: {
                Roles: {
                    include: {
                        RolesPermisos: {
                            include: { Permisos: true }
                        }
                    }
                }
            }
        })
        return [
            ...new Set(
                usuariosRoles.flatMap(ur =>
                    (ur.Roles.RolesPermisos || []).map(rp => rp.Permisos.codigo)
                )
            )
        ]
    },

    /**
     * Renovar access token usando refresh token (con rotación)
     * @param {string} refreshToken - Refresh token actual
     * @returns {Promise<Object>} Nuevo access token y nuevo refresh token
     */
    async refreshAccessToken(refreshToken) {
        try {
            // 1. Verificar refresh token
            if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET no configurado')
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

            if (decoded.type !== 'REFRESH') {
                throw new Error('Token inválido')
            }

            // 2. Buscar token en base de datos
            const storedToken = await prisma.refreshTokens.findUnique({
                where: { token: refreshToken },
                include: {
                    Usuarios: true
                }
            })

            if (!storedToken) {
                throw new Error('Token no encontrado')
            }

            // 3. Verificar que no esté revocado
            if (storedToken.revoked) {
                // Posible ataque: alguien está usando un token ya revocado
                console.warn(`⚠️ Intento de uso de refresh token revocado. Usuario: ${storedToken.usuario_id}`)
                throw new Error('Token revocado. Por seguridad, cierre sesión e inicie nuevamente.')
            }

            // 4. Verificar expiración
            if (new Date() > storedToken.expiresAt) {
                throw new Error('Token expirado. Debe iniciar sesión nuevamente.')
            }

            // 5. Revocar el refresh token actual (rotación)
            await prisma.refreshTokens.update({
                where: { id: storedToken.id },
                data: { revoked: true }
            })

            // 6. Generar nuevo access token
            const accessToken = jwt.sign(
                {
                    userId: storedToken.Usuarios.usuario_id,
                    rut: storedToken.Usuarios.rut,
                    role: storedToken.Usuarios.tipo_usuario
                },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            )

            // 7. Generar nuevo refresh token (rotación)
            const newRefreshToken = jwt.sign(
                { userId: storedToken.Usuarios.usuario_id, type: 'REFRESH' },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '7d' }
            )

            // 8. Guardar nuevo refresh token en DB
            const expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + 7)

            await prisma.refreshTokens.create({
                data: {
                    token: newRefreshToken,
                    usuario_id: storedToken.Usuarios.usuario_id,
                    expiresAt: expiresAt,
                    createdAt: new Date(),
                    revoked: false
                }
            })

            return {
                accessToken,
                refreshToken: newRefreshToken
            }
        } catch (error) {
            throw new Error(`Error al renovar token: ${error.message}`)
        }
    },

    /**
     * Cerrar sesión revocando el refresh token
     * @param {string} refreshToken - Refresh token a revocar
     * @returns {Promise<Object>} Confirmación
     */
    async logout(refreshToken) {
        try {
            // Marcar token como revocado
            const result = await prisma.refreshTokens.updateMany({
                where: {
                    token: refreshToken,
                    revoked: false
                },
                data: { revoked: true }
            })

            if (result.count === 0) {
                throw new Error('Token no encontrado o ya revocado')
            }

            return { success: true }
        } catch (error) {
            throw new Error(`Error al cerrar sesión: ${error.message}`)
        }
    },

    /**
     * Solicitar recuperación de contraseña (solo usuarios EXTERNOS/LOCAL)
     */
    async requestPasswordReset(email) {
        try {
            const emailService = (await import('./email.service.js')).default

            // 1. Buscar usuario por email
            const user = await prisma.usuarios.findUnique({
                where: { correo_electronico: email }
            })

            // Por seguridad, siempre retornar el mismo mensaje
            const successMessage = 'Si el correo existe, recibirás un enlace de recuperación'

            // 2. Validar que el usuario existe
            if (!user) {
                return { success: true, message: successMessage }
            }

            // 3. Validar que es usuario LOCAL (no LDAP)
            if (user.tipo_autenticacion !== 'LOCAL') {
                // Usuario INTERNO/LDAP no puede recuperar contraseña
                return { success: true, message: successMessage }
            }

            // 4. Validar que la cuenta no esté bloqueada
            if (user.bloqueado) {
                throw new Error('Cuenta bloqueada. Contacte al administrador.')
            }

            // 5. Generar token único
            const crypto = await import('crypto')
            const token = crypto.randomBytes(32).toString('hex')

            // 6. Calcular expiración (1 hora)
            const expiresAt = new Date()
            expiresAt.setHours(expiresAt.getHours() + 1)

            // 7. Revocar tokens anteriores del usuario
            await prisma.passwordResetTokens.updateMany({
                where: {
                    usuario_id: user.usuario_id,
                    used: false
                },
                data: { used: true }
            })

            // 8. Guardar nuevo token
            await prisma.passwordResetTokens.create({
                data: {
                    usuario_id: user.usuario_id,
                    token: token,
                    expiresAt: expiresAt
                }
            })

            // 9. Enviar email
            await emailService.sendPasswordResetEmail(email, token, user.nombres)

            return { success: true, message: successMessage }
        } catch (error) {
            console.error('Error en requestPasswordReset:', error.message)
            throw error
        }
    },

    /**
     * Activar cuenta (Usuarios Internos)
     */
    async activateAccount(token) {
        try {
            // 1. Validar token
            const resetToken = await prisma.passwordResetTokens.findUnique({
                where: { token },
                include: { Usuarios: true }
            })

            if (!resetToken) throw new Error('Token inválido')
            if (resetToken.used) throw new Error('Este enlace ya fue utilizado')
            if (new Date() > resetToken.expiresAt) throw new Error('Este enlace ha expirado')

            // 2. Activar usuario
            await prisma.usuarios.update({
                where: { usuario_id: resetToken.usuario_id },
                data: {
                    activo: true,
                    intentos_fallidos: 0,
                    bloqueado: false,
                    fecha_modificacion: new Date()
                }
            })

            // 3. Marcar token como usado
            await prisma.passwordResetTokens.update({
                where: { id: resetToken.id },
                data: { used: true, usedAt: new Date() }
            })

            return { success: true, message: 'Cuenta activada exitosamente' }
        } catch (error) {
            throw new Error(error.message)
        }
    },

    /**
     * Generar token de recuperación/activación
     */
    async createPasswordResetToken(userId) {
        const crypto = await import('crypto')
        const token = crypto.randomBytes(32).toString('hex')

        // Expiración 7 días
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)

        // Revocar tokens anteriores
        await prisma.passwordResetTokens.updateMany({
            where: {
                usuario_id: userId,
                used: false
            },
            data: { used: true }
        })

        // Guardar nuevo token
        await prisma.passwordResetTokens.create({
            data: {
                usuario_id: userId,
                token: token,
                expiresAt: expiresAt,
                used: false,
                createdAt: new Date()
            }
        })

        return token
    },

    /**
     * Validar token de recuperación
     */
    async validateResetToken(token) {
        try {
            const resetToken = await prisma.passwordResetTokens.findUnique({
                where: { token },
                include: { Usuarios: true }
            })

            if (!resetToken) {
                throw new Error('Token inválido')
            }

            if (resetToken.used) {
                throw new Error('Este enlace ya fue utilizado')
            }

            if (new Date() > resetToken.expiresAt) {
                throw new Error('Este enlace ha expirado')
            }

            return {
                success: true,
                email: resetToken.Usuarios.correo_electronico
            }
        } catch (error) {
            throw new Error(error.message)
        }
    },

    /**
     * Restablecer contraseña
     */
    async resetPassword(token, newPassword) {
        try {
            console.log('1. Buscando token...')
            // 1. Validar token
            const resetToken = await prisma.passwordResetTokens.findUnique({
                where: { token },
                include: { Usuarios: true }
            })
            console.log('Token encontrado:', resetToken ? 'Sí' : 'No')

            if (!resetToken) {
                throw new Error('Token inválido')
            }

            if (resetToken.used) {
                throw new Error('Este enlace ya fue utilizado')
            }

            if (new Date() > resetToken.expiresAt) {
                throw new Error('Este enlace ha expirado')
            }

            console.log('2. Validando contraseña...')
            // 2. Validar complejidad de contraseña
            const passwordValidation = validatePassword(newPassword)
            console.log('Validación:', passwordValidation)
            if (!passwordValidation.valid) {
                throw new Error(passwordValidation.errors.join('. '))
            }

            console.log('3. Hasheando contraseña...')
            // 3. Hashear nueva contraseña
            const password_hash = await bcrypt.hash(newPassword, 10)

            console.log('4. Actualizando usuario...')
            // 4. Actualizar contraseña del usuario
            await prisma.usuarios.update({
                where: { usuario_id: resetToken.usuario_id },
                data: {
                    password_hash: password_hash,
                    intentos_fallidos: 0,
                    bloqueado: false,
                    fecha_bloqueo: null,
                    activo: true
                }
            })

            console.log('5. Marcando token como usado...')
            // 5. Marcar token como usado
            await prisma.passwordResetTokens.update({
                where: { id: resetToken.id },
                data: {
                    used: true,
                    usedAt: new Date()
                }
            })

            console.log('6. Revocando refresh tokens...')
            // 6. Revocar todos los refresh tokens del usuario
            await prisma.refreshTokens.updateMany({
                where: {
                    usuario_id: resetToken.usuario_id,
                    revoked: false
                },
                data: { revoked: true }
            })

            console.log('✅ Contraseña actualizada exitosamente')
            return { success: true, message: 'Contraseña actualizada exitosamente' }
        } catch (error) {
            console.error('❌ Error en resetPassword service:', error)
            throw new Error(error.message || 'Error al restablecer contraseña')
        }
    }
}
