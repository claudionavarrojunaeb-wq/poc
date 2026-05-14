# Skill: Comprobador `.tsx → .tsx.md`

Propósito
- Proveer una utilidad y documentación breve para que agentes y desarrolladores verifiquen que cada archivo `.tsx` del repositorio tiene su correspondiente `.tsx.md` de documentación.

Qué hace
- Ejecuta `node scripts/check_tsx_md.js` y lista los archivos `.tsx` que no tienen un `.md` asociado.

Ubicación del script
- `scripts/check_tsx_md.js`

Uso recomendado
- Local: `npm run check-md`
- En CI: ejecutar `npm run check-md` y fallar el build si devuelve código distinto de 0.

Sugerencias de integración
- Para generar automáticamente los `.md` faltantes usar: `node scripts/generate_detailed_md.js`.
- Integrar en un paso de pre-commit o pipeline para garantizar cumplimiento.

Notas
- El script ignora `node_modules` y busca recursivamente desde la raíz del repositorio.
