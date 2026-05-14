## Instrucciones rápidas — Crear tabla `test` y ejecutar ejemplo (Prisma)

### Resumen
Este documento muestra los pasos para crear la tabla `test` en PostgreSQL usando Prisma, generar el cliente y ejecutar el script de ejemplo que inserta/lee/actualiza/elimina datos.

### Requisitos previos
- PostgreSQL accesible y con la base de datos configurada (por defecto: `ssmm` en `localhost:5432`).
- `DATABASE_URL` debe apuntar a la BD correcta.
- Tener Node.js y `npm` instalados.
- Haber ejecutado `npx prisma init` (ya creado `prisma/schema.prisma` y `prisma.config.ts`).

Si usas la configuración del repositorio, asegúrate que uno de estos archivos contiene la URL correcta:
- `prisma/.env` (recomendado)
- o `.env` en la raíz del repositorio

Ejemplo (en `prisma/.env`):

```powershell
DATABASE_URL="postgresql://ssmm:ssmm@localhost:5432/ssmm"
```

### Pasos (comandos)
Ejecuta los siguientes comandos desde la raíz del repositorio `d:\_SSMM`.

1) Instalar dependencias (si no están instaladas):

```powershell
npm install
```

2) Generar o actualizar el cliente Prisma:

```powershell
npx prisma generate
```

3) Sincronizar el esquema con la base de datos (crear la tabla `test`):

Opción A — sin migraciones (rápido, para desarrollo):

```powershell
npx prisma db push
```

Opción B — con migración (recomendado para historial):

```powershell
npx prisma migrate dev --name create_test
```

4) Ejecutar el script de ejemplo que inserta/lee/actualiza/elimina registros:

```powershell
node scripts/prisma-test-example.mjs
```

### Qué hace el script de ejemplo
- Inserta dos filas de prueba en la tabla `test`.
- Lista todas las filas.
- Actualiza la primera fila.
- Elimina las filas de prueba (limpia tras la ejecución).

### Verificación manual (opcional)
Usando `psql` o cliente SQL, verifica que la tabla existe y estructura:

```sql
-- Ver columnas
\d+ test

-- Ver filas
SELECT * FROM test ORDER BY testid;
```

### Solución de problemas
- Error `P1001` / "Can't reach database server": verifica que Postgres esté corriendo y que el puerto/host/credenciales en `DATABASE_URL` sean correctos.
- Error acerca de `prisma.config.ts` / `url` en `schema.prisma`: en Prisma v7 la `url` debe definirse en `prisma.config.ts` o en `.env`; el `schema.prisma` NO debe contener `url = env(...)`.
- Si `node scripts/prisma-test-example.mjs` falla por import del cliente, asegúrate de haber ejecutado `npx prisma generate` y que `generated/prisma` existe.

### Alternativas y notas
- Si prefieres crear la tabla manualmente con SQL, la definición equivalente en PostgreSQL sería:

```sql
CREATE TABLE test (
  testid SERIAL PRIMARY KEY,
  nombre VARCHAR(200)
);
```

- Para mantener historial de cambios en esquema en equipos, usar migraciones (`prisma migrate`) en lugar de `db push`.

---
Archivo relacionado con el ejemplo: `scripts/prisma-test-example.mjs` (ya presente en el repo).

Si quieres, ejecuto aquí los pasos hasta `npx prisma db push` y te muestro la salida. ¿Lo ejecuto ahora? 
