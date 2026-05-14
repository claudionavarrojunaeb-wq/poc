import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Esta configuracion centraliza el comportamiento del servidor de desarrollo de Vite.
// Ademas de registrar el plugin de React, aqui se declara de forma explicita que
// el host publico generado por ngrok esta autorizado a reenviar peticiones hacia
// el frontend local. Sin esta excepcion, Vite bloquea la solicitud para proteger
// el servidor de desarrollo frente a cabeceras Host no esperadas.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Se mantiene el host abierto para que el servidor siga siendo alcanzable desde
    // la red local y desde el tunel externo administrado por ngrok.
    host: '0.0.0.0',
    // Este puerto coincide con el que ya se venia usando para el entorno local y
    // con el destino que expone el tunel HTTP activo.
    port: 5173,
    // Se permiten hosts locales y el dominio ngrok específico para evitar
    // el error "Blocked request. This host is not allowed." al acceder desde
    // otra IP de la red o desde el túnel ngrok.
    // Incluimos localhost y 127.0.0.1 para no romper accesos locales.
    allowedHosts: ['localhost', '127.0.0.1', '::1', 'slimy-shore-vascular.ngrok-free.dev'],
    
    // El proxy reenvia las peticiones API al backend local para que el navegador, incluido
    // el del telefono a traves de ngrok, consuma datos dinamicos usando el mismo origen HTTP.
    // Agregar cabeceras para permitir características WebXR durante desarrollo.
    headers: {
      'Permissions-Policy': 'xr-spatial-tracking=(self)'
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
})
