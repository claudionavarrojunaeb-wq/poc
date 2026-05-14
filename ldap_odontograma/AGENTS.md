# AGENTS — Instrucciones para agentes de código

Propósito
- Documento conciso para que agentes automatizados y asistentes entiendan rápidamente la estructura, comandos y convenciones relevantes del repositorio.

Principios generales
- Linkuear, no duplicar: siempre enlazar a la documentación existente en `docs/` en vez de copiarla.
- Minimal por defecto: solo lo que no es evidente desde la estructura del código.

Comandos y cómo arrancar (resumido)
- En Windows: ejecutar `run-dev.bat` desde la raíz para flujos de desarrollo integrados.
- Backend: revisar `backend/package.json` y usar sus `scripts` (por ejemplo `npm install` + el `start`/`dev` que exista).
- Frontend: revisar `frontend/package.json` y usar sus `scripts` (por ejemplo `npm install` y `npm run dev`).

Dónde mirar primero
- Código servidor: `backend/index.js` y `backend/lib/`.
- UI/cliente: `frontend/src/` y `frontend/main.tsx`.
- Documentación y decisiones: `docs/decisiones/preferences.md`, `docs/base-de-datos/BBDD.md`, y `docs/arquitectura/infosys.md`.

Convenciones importantes (resumidas)
- Logs y trazabilidad: este repositorio mantiene `log/` con archivos diarios; leer `log/index.md` para contexto operativo.
- Pares de archivo `.tsx` → `.tsx.md`: por cada `.tsx` modificado, actualizar su `.md` correspondiente según la convención del proyecto.
- Regla de documentación: evitar output de razonamiento interno (pensamiento) en el chat visible; usar `log/` para trazabilidad.

Comportamiento esperado del agente
- Antes de cambiar código, enlazar al archivo(s) objetivo y confirmar el alcance del cambio.
- Hacer cambios pequeños y reversibles; actualizar archivos `.md` relacionados cuando se altere código fuente.
- Añadir una línea en el log diario (`log/AAAAMMDD.md`) describiendo la acción ejecutada.

Enlaces útiles
- Preferencias del proyecto: `docs/decisiones/preferences.md`
- Base de datos: `docs/base-de-datos/BBDD.md`
- Índice de logs: `log/index.md`

Propuestas siguientes (sugeridas)
- Crear instrucciones específicas para `frontend/` y `backend/` si se necesita detalle de build o testing.
- Añadir un `AGENT-dev` o skill que automatice la comprobación de la regla `.tsx → .tsx.md`.

Última actualización: 2026-05-04
