/**
 * prisma-test-example.mjs
 * ──────────────────────────────────────────────────────────────────────────────
 * Script de ejemplo que demuestra las operaciones CRUD básicas sobre la tabla
 * `test` usando el cliente Prisma generado para este proyecto.
 *
 * Cómo ejecutar (desde la raíz del repositorio):
 *   node scripts/prisma-test-example.mjs
 *
 * Requisitos previos:
 *   1. La base de datos debe estar accesible (ver `prisma/.env` para DATABASE_URL).
 *   2. La tabla `test` debe existir. Si no existe, crearla con:
 *        npx prisma db push
 *      (o generar una migración con: npx prisma migrate dev --name create_test)
 *   3. El cliente Prisma debe estar generado:
 *        npx prisma generate
 * ──────────────────────────────────────────────────────────────────────────────
 */

// Carga de variables de entorno desde el .env de la raíz.
// DATABASE_URL debe estar definida allí para que PrismaPg pueda conectarse.
import 'dotenv/config'

// Importación del cliente Prisma generado por prisma-client-js en node_modules/.prisma/client/.
import pkg from '@prisma/client'
const { PrismaClient } = pkg

// Adaptador oficial PostgreSQL para Prisma v7.
// A partir de Prisma v7, el engine por defecto es Wasm ("client engine") y
// requiere que se pase un driver adapter al constructor de PrismaClient.
// @prisma/adapter-pg envuelve la librería `pg` nativa y la expone como un
// DriverAdapter compatible con el protocolo interno de Prisma.
import { PrismaPg } from '@prisma/adapter-pg'

// Instancia única de PrismaClient con el adapter PostgreSQL.
// `connectionString` toma el valor de DATABASE_URL cargado por dotenv.
// En producción esta instancia se reutiliza como singleton.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  // 'query' → muestra el SQL generado en consola (útil para depuración).
  // 'error' → siempre recomendado para detectar fallos de BD.
  log: ['query', 'error']
})

async function main() {
  console.log('─── Ejemplo Prisma: tabla test ───────────────────────────────')

  // ── CREATE: insertar dos filas de ejemplo ──────────────────────────────────
  // `prisma.test.create()` genera INSERT INTO test (nombre) VALUES (...).
  // El campo `testid` es autonumérico; no es necesario proporcionarlo.
  const fila1 = await prisma.test.create({
    data: { nombre: 'Primer registro de prueba' }
  })
  console.log('INSERT fila 1:', fila1)

  const fila2 = await prisma.test.create({
    data: { nombre: 'Segundo registro de prueba' }
  })
  console.log('INSERT fila 2:', fila2)

    const fila3= await prisma.test.create({
    data: { nombre: 'Tercer registro de prueba' }
  })
  console.log('INSERT fila 3:', fila3)

  // ── READ: leer todos los registros ────────────────────────────────────────
  // `prisma.test.findMany()` genera SELECT * FROM test ORDER BY testid.
  // `orderBy` ordena los resultados por `testid` de forma ascendente.
  const todos = await prisma.test.findMany({ orderBy: { testid: 'asc' } })
  console.log('SELECT todos:', todos)

  // ── UPDATE: modificar el nombre de la primera fila ────────────────────────
  // `prisma.test.update()` genera UPDATE test SET nombre=... WHERE testid=...
  // `where` identifica la fila por su clave primaria.
  // `data`  contiene los campos a actualizar.
  const actualizada = await prisma.test.update({
    where: { testid: fila3.testid },
    data:  { nombre: 'Nombre actualizado correctamente' }
  })
  console.log('UPDATE fila 3:', actualizada)

  // ── DELETE: eliminar las filas creadas en este ejemplo ────────────────────
  // `prisma.test.delete()` genera DELETE FROM test WHERE testid=...
  // Se eliminan las dos filas para no dejar datos basura en la BD.
//   await prisma.test.delete({ where: { testid: fila1.testid } })
//   await prisma.test.delete({ where: { testid: fila2.testid } })
//   console.log('DELETE filas de prueba completado')

  console.log('─── Fin del ejemplo ──────────────────────────────────────────')
}

// Ejecución principal con manejo de errores.
// `prisma.$disconnect()` en el bloque `finally` garantiza que la conexión
// a la base de datos se cierra correctamente, tanto en caso de éxito como
// en caso de error, evitando conexiones colgadas.
main()
  .catch((err) => {
    console.error('Error en el ejemplo Prisma:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
