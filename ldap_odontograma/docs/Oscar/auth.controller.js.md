# Documentación automática para auth.controller.js

> Archivo generado automáticamente por `scripts/enforce_docs.mjs` — completar con documentación detallada.

## Código fuente

```js
import { AuthService } from '../services/auth.service.js'
import LdapServiceClass from '../services/ldap.service.js'
import prisma from '../prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { NotFoundError, ValidationError, ForbiddenError, AppError } from '../utils/AppError.js'

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
}

export const AuthController = {
    getMe: asyncHandler(async (req, res) => {
        const userId = req.user.userId
        const user = await prisma.usuarios.findUnique({
            where: { usuario_id: userId },
            select: {
                usuario_id: true, rut: true, nombres: true,
                primer_apellido: true, segundo_apellido: true,
                correo_electronico: true, tipo_usuario: true, fecha_ultimo_login: true
            }
        })
        if (!user) throw new NotFoundError('Usuario no encontrado')

        let prestadores = []
        if (user.tipo_usuario === 'EXTERNO') {
            const usuariosPrestadores = await prisma.usuariosPrestadores.findMany({
                where: { usuario_id: userId },
                include: { Prestadores: { select: { prestador_id: true, rut: true, razon_social: true } } }
            })
            prestadores = usuariosPrestadores.map(up => ({
                prestador_id: up.Prestadores.prestador_id,
                rut: up.Prestadores.rut,
                razon_social: up.Prestadores.razon_social
            }))
        }

        const permisos = await AuthService.getUserPermisos(userId)

        res.json({
            success: true,
            data: {
                id: user.usuario_id, rut: user.rut, nombres: user.nombres,
                primer_apellido: user.primer_apellido, segundo_apellido: user.segundo_apellido,
                email: user.correo_electronico, role: user.tipo_usuario,
                fecha_ultimo_login: user.fecha_ultimo_login, prestadores, permisos
            }
        })
    }),

    setupPassword: asyncHandler(async (req, res) => {
        const { token, password } = req.body
        if (!token || !password) throw new ValidationError('Faltan datos (token o password)')
        await AuthService.setupPassword(token, password)
        res.json({ success: true, message: 'Contraseña establecida correctamente. Ahora puedes iniciar sesión.' })
    }),

    activateAccount: asyncHandler(async (req, res) => {
        const { token } = req.body
        if (!token) throw new ValidationError('Token es requerido')
        const result = await AuthService.activateAccount(token)
        res.json(result)
    }),

    async login(req, res, next) {
        try {
            const { email, password } = req.body
            const ipAddress = req.ip || req.connection.remoteAddress
            const userAgent = req.headers['user-agent']

            if (!email || !password) {
                return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos' })
            }

            const result = await AuthService.login(email, password, ipAddress, userAgent)
            res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS)
            res.json({ success: true, data: { user: result.user, accessToken: result.accessToken } })
        } catch (error) {
            // Respuesta genérica por seguridad (no revelar si el usuario existe)
            if (error.message?.includes('bloqueada')) {
                return res.status(403).json({ success: false, error: error.message })
            }
            res.status(401).json({ success: false, error: 'Credenciales inválidas' })
        }
    },

    testLdap: asyncHandler(async (req, res) => {
        const { username } = req.query
        if (!username) throw new ValidationError('Se requiere el parámetro username')
        const ldap = new LdapServiceClass()
        const result = await ldap.findUserByEmail(username)
        if (result.success) {
            res.json({ success: true, user: result.user })
        } else {
            throw new NotFoundError('Usuario no encontrado en LDAP')
        }
    }),

    createLocalTestUser: asyncHandler(async (req, res) => {
        if (process.env.NODE_ENV === 'production') throw new ForbiddenError('Este endpoint no está disponible en producción')
        const { rut, nombres, primer_apellido, segundo_apellido, email, password, tipo_usuario } = req.body
        const { UserService } = await import('../services/user.service.js')
        const newUser = await UserService.createLocalTestUser({ rut, nombres, primer_apellido, segundo_apellido, email, password, tipo_usuario })
        res.status(201).json({ success: true, message: 'Usuario de prueba LOCAL creado exitosamente', data: newUser })
    }),

    async refresh(req, res, next) {
        try {
            const refreshToken = req.cookies.refreshToken
            if (!refreshToken) throw new AppError('No hay sesión activa', 401, 'UNAUTHORIZED')
            const result = await AuthService.refreshAccessToken(refreshToken)
            res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS)
            res.json({ success: true, accessToken: result.accessToken })
        } catch (error) {
            next(error instanceof AppError ? error : new AppError(error.message, 401))
        }
    },

    logout: asyncHandler(async (req, res) => {
        const refreshToken = req.cookies.refreshToken
        if (refreshToken) await AuthService.logout(refreshToken)
        res.clearCookie('refreshToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' })
        res.json({ success: true, message: 'Sesión cerrada exitosamente' })
    }),

    requestPasswordReset: asyncHandler(async (req, res) => {
        const { email } = req.body
        if (!email) throw new ValidationError('Email es requerido')
        const result = await AuthService.requestPasswordReset(email)
        res.json(result)
    }),

    validateResetToken: asyncHandler(async (req, res) => {
        const { token } = req.query
        if (!token) throw new ValidationError('Token es requerido')
        const result = await AuthService.validateResetToken(token)
        res.json(result)
    }),

    resetPassword: asyncHandler(async (req, res) => {
        const { token, newPassword } = req.body
        if (!token || !newPassword) throw new ValidationError('Token y contraseña son requeridos')
        const result = await AuthService.resetPassword(token, newPassword)
        res.json(result)
    })
}

```

## Explicación

*TODO: Añadir explicación completa del propósito, funciones, componentes, variables importantes, flujos `await` y cualquier condición relevante.*
