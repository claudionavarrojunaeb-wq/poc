require('dotenv').config();
const { Client } = require('pg');

/** Detecta y asigna una función `fetch` a `fetchFunc`:
 *  - Intenta usar `globalThis.fetch` (Node 18+ o entornos con fetch disponible).
 *  - Si no existe, intenta cargar `node-fetch`.
 *  - Si falla, termina el proceso porque el script depende de `fetch`.
 */
let fetchFunc = globalThis.fetch;
if (!fetchFunc) {
  try {
    fetchFunc = require('node-fetch');
  } catch (e) {
    console.error('No fetch available. Install node 18+ or node-fetch package.');
    process.exit(1);
  }
}

/** Parámetros de conexión a Postgres (variables de entorno):
 *  - `PGHOST`: host del servidor Postgres (por defecto 'localhost').
 *  - `PGPORT`: puerto TCP del servidor (por defecto '5432').
 *  - `PGDATABASE`: nombre de la base de datos a usar.
 *  - `PGUSER`: usuario para la conexión.
 *  - `PGPASSWORD`: contraseña del usuario.
 */
const PGHOST = process.env.PGHOST || 'localhost';
const PGPORT = parseInt(process.env.PGPORT || '5432', 10);
const PGDATABASE = process.env.PGDATABASE || 'test';
const PGUSER = process.env.PGUSER || 'test';
const PGPASSWORD = process.env.PGPASSWORD || 'test';

/** Configuración del servicio Ollama:
 *  - `OLLAMA_URL`: URL base del servicio de embeddings.
 *  - `OLLAMA_MODEL`: identificador del modelo a utilizar para generar embeddings.
 */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Usar modelo por defecto para embeddings actualizado
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'nomic-embed-text:latest';

/** Tablas y columnas objetivo:
 *  - `DETAIL_TABLE`: tabla que contiene los registros a procesar.
 *  - `DETAIL_TEXT_COLUMN`: columna con el texto fuente para embeddings.
 *  - `DETAIL_EMB_COLUMN`: columna donde se guardará el embedding generado.
 *  - `DETAIL_ID_COLUMN`: columna identificadora única de la fila.
 */
const DETAIL_TABLE = process.env.DETAIL_TABLE || 'detalle';
const DETAIL_TEXT_COLUMN = process.env.DETAIL_TEXT_COLUMN || 'resumen';
// Guardar embeddings generados por este script en la columna "pembedding" por defecto
const DETAIL_EMB_COLUMN = process.env.DETAIL_EMB_COLUMN || 'pembedding';
const DETAIL_ID_COLUMN = process.env.DETAIL_ID_COLUMN || 'id';

// Nota: referencias a la tabla `respuesta` eliminadas intencionalmente.

/** Parámetros de ejecución:
 *  - `BATCH_SIZE`: número de filas a seleccionar por cada lote (impacta memoria/latencia).
 *  - `CONCURRENCY`: número de workers concurrentes que procesan la cola.
 */
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);

/**
 * Contexto académico:
 *  Valida que los identificadores (tablas/columnas) recibidos por
 *  configuración cumplan un patrón seguro y predecible. Es una medida
 *  de higiene para evitar inyección de nombres en consultas SQL.
 *
 * Descripción técnica:
 *  - Permite únicamente letras, números y guiones bajos.
 *  - Lanza un error si el identificador no cumple el patrón.
 */
/** Valida que un identificador sea seguro para usar en consultas SQL.
 *  Rechaza nombres con caracteres especiales para prevenir inyección. */
function validateIdent(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
}

validateIdent(DETAIL_TABLE);
validateIdent(DETAIL_TEXT_COLUMN);
validateIdent(DETAIL_EMB_COLUMN);
validateIdent(DETAIL_ID_COLUMN);
// No validar identificadores de `respuesta` — no se procesará aquí.

/** Cliente Postgres:
 *  Instancia reutilizable del cliente `pg` configurada con las constantes
 *  de conexión definidas arriba. Se conecta y cierra en el flujo principal.
 */
const client = new Client({ host: PGHOST, port: PGPORT, database: PGDATABASE, user: PGUSER, password: PGPASSWORD });

/**
 * Contexto académico:
 *  Obtiene embeddings desde un servicio Ollama. Está diseñada para ser
 *  tolerante a distintas versiones del endpoint y formatos de respuesta.
 *
 * Descripción técnica:
 *  - Prueba varios endpoints y estilos de payload.
 *  - Normaliza distintas formas de respuesta para devolver el vector
 *    de embedding como array de números.
 *
 * Parámetros:
 *  - text {string}: Texto de entrada para generar el embedding.
 *
 * Retorno:
 *  - {Promise<Array<number>>}: Vector de embedding obtenido del servicio.
 */
/**
 * Solicita un embedding a Ollama probando múltiples endpoints y formatos.
 * Estrategia:
 *  - Itera `attempts` con distintas URLs/formatos.
 *  - Para cada intento ejecuta `fetch` (await) y valida `res.ok`.
 *  - Si `res.status === 404` intenta la siguiente URL sin abortar.
 *  - Normaliza varias estructuras de respuesta JSON para extraer el embedding.
 */
async function fetchEmbedding(text) {
  // Try multiple common Ollama endpoints and response shapes.
  const attempts = [
    { url: `${OLLAMA_URL}/embed?model=${OLLAMA_MODEL}`, body: JSON.stringify({ input: text }) },
    { url: `${OLLAMA_URL}/v1/embeddings`, body: JSON.stringify({ model: OLLAMA_MODEL, input: text }) },
    { url: `${OLLAMA_URL}/embeddings`, body: JSON.stringify({ model: OLLAMA_MODEL, input: text }) }
  ];

  let lastErr = null;
  // Itera intentos en orden de preferencia; cada iteración puede realizar IO.
  for (const a of attempts) {
    try {
      // Ejecuta la petición HTTP POST y espera su resultado.
      const res = await fetchFunc(a.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: a.body
      });

      // Si la respuesta HTTP no es exitosa, maneja errores específicos.
      if (!res.ok) {
        const t = await res.text();
        // Si es 404, este endpoint no existe; continuar con el siguiente intento.
        if (res.status === 404) {
          lastErr = new Error(`Endpoint ${a.url} returned 404`);
          continue;
        }
        // Para otros códigos, lanzar un error con detalle.
        throw new Error(`Ollama responded ${res.status}: ${t}`);
      }

      // Parsear cuerpo JSON y normalizar distintas estructuras de respuesta.
      const j = await res.json();
      // 1) { data: [ { embedding: [...] } ] }
      if (j && Array.isArray(j.data) && j.data[0] && Array.isArray(j.data[0].embedding)) {
        return j.data[0].embedding;
      }
      // 2) { embedding: [...] }
      if (j && Array.isArray(j.embedding)) return j.embedding;
      // 3) { embeddings: [ [...] ] }
      if (j && Array.isArray(j.embeddings)) return Array.isArray(j.embeddings[0]) ? j.embeddings[0] : j.embeddings;
      // 4) direct array
      if (Array.isArray(j)) return j;

      // Si la forma no coincide, aviso y pruebo siguiente intento.
      throw new Error('Unexpected embeddings response shape: ' + JSON.stringify(j));
    } catch (err) {
      // Guardar el último error y continuar; al final se lanzará si todos fallan.
      lastErr = err;
    }
  }

  throw lastErr || new Error('Failed to fetch embedding from Ollama');
}

// Intenta resolver la columna ID de la tabla. Prefiere `preferred` si existe,
// luego busca la PK y finalmente candidatos comunes o la primera columna.
/**
 * Contexto académico:
 *  Determina la columna que actúa como identificador único (ID) en una tabla.
 *
 * Descripción técnica:
 *  - Comprueba si existe la columna preferida.
 *  - Si no, intenta detectar la PK mediante las estructuras de índice de Postgres.
 *  - Si sigue sin encontrarla, busca candidatos comunes o devuelve la primera columna.
 */
async function findIdColumn(table, preferred) {
  // Comprueba si la columna preferida existe
  try {
    const chk = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`;
    const r = await client.query(chk, [table, preferred]);
    if (r.rows.length > 0) return preferred;
  } catch (e) {
    // ignore
  }

  // Intentar columna primaria
  try {
    const pkQ = `SELECT a.attname AS column_name FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary`;
    const pkRes = await client.query(pkQ, [table]);
    if (pkRes.rows && pkRes.rows.length > 0) return pkRes.rows[0].column_name;
  } catch (e) {
    // ignore
  }

  // Listar columnas y buscar candidatos comunes
  const colsQ = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`;
  const colsRes = await client.query(colsQ, [table]);
  const cols = colsRes.rows.map(r => r.column_name);
  const candidates = ['solicitudid'];
  for (const c of candidates) {
    const found = cols.find(col => col.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }

  if (cols.length > 0) return cols[0];
  throw new Error(`No se encontraron columnas en la tabla ${table}`);
}

/**
 * Contexto académico:
 *  Identifica la columna que contiene el texto a embeddar dentro de una tabla.
 *
 * Descripción técnica:
 *  - Comprueba la existencia de la columna preferida.
 *  - Busca candidatos habituales como 'resumen'.
 *  - Devuelve la primera columna disponible si no hay candidatos.
 */
async function findTextColumn(table, preferred) {
  // Comprueba si la columna preferida existe
  try {
    const chk = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`;
    const r = await client.query(chk, [table, preferred]);
    if (r.rows.length > 0) return preferred;
  } catch (e) {
    // ignore
  }

  const colsQ = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`;
  const colsRes = await client.query(colsQ, [table]);
  const cols = colsRes.rows.map(r => r.column_name);
  const candidates = ['resumen'];
  for (const c of candidates) {
    const found = cols.find(col => col.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }

  // Si no hay candidatos, intentar devolver la primera columna de tipo text/varchar
  if (cols.length > 0) return cols[0];
  throw new Error(`No se encontraron columnas en la tabla ${table}`);
}

/**
 * Contexto académico:
 *  Procesa en lotes una tabla para generar y almacenar embeddings faltantes.
 *
 * Descripción técnica:
 *  - Resuelve columnas (id/texto) si las preferidas no existen.
 *  - Recupera filas sin embedding y las procesa con concurrencia controlada.
 *  - Para cada fila solicita el embedding y actualiza la columna correspondiente.
 *
 * Objetivo pedagógico:
 *  Ilustrar un patrón de procesamiento batch con workers concurrentes y
 *  control de condiciones de carrera al actualizar la base de datos.
 */
async function processTable(table, textCol, embCol, idCol) {
  console.log(`Procesando tabla ${table}, columna texto=${textCol}, embedding=${embCol}`);

  // Resolver columna ID si la preferida no existe
  try {
    const resolved = await findIdColumn(table, idCol);
    if (resolved !== idCol) {
      console.log(`Columna id '${idCol}' no encontrada en tabla ${table}. Usando '${resolved}'.`);
      idCol = resolved;
    }
  } catch (err) {
    throw err;
  }

  // Resolver columna de texto si la preferida no existe
  try {
    const txtChk = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`;
    const txtExists = await client.query(txtChk, [table, textCol]);
    if (txtExists.rows.length === 0) {
      const resolvedText = await findTextColumn(table, textCol);
      if (resolvedText !== textCol) {
        console.log(`Columna texto '${textCol}' no encontrada en tabla ${table}. Usando '${resolvedText}'.`);
        textCol = resolvedText;
      }
    }
  } catch (err) {
    throw err;
  }

  while (true) {
    const selectQ = `SELECT "${idCol}" AS id, "${textCol}" AS texto FROM "${table}" WHERE ("${embCol}" IS NULL OR trim(COALESCE("${embCol}"::text, '')) = '' OR "${embCol}"::text = 'null') LIMIT $1`;
    const res = await client.query(selectQ, [BATCH_SIZE]);
    if (res.rows.length === 0) break;

    // process in parallel with limited concurrency
    const queue = [...res.rows];
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push((async () => {
        while (queue.length) {
          const row = queue.shift();
          if (!row) break;
          try {
            const text = row.texto || '';
            if (!text) {
              console.log(`Fila id=${row.id} texto vacío, saltando.`);
              continue;
            }
            const embedding = await fetchEmbedding(text);
            const embStr = JSON.stringify(embedding);
            const upd = `UPDATE "${table}" SET "${embCol}" = $1 WHERE "${idCol}" = $2 AND ("${embCol}" IS NULL OR trim(COALESCE("${embCol}"::text, '')) = '' OR "${embCol}"::text = 'null')`;
            const updRes = await client.query(upd, [embStr, row.id]);
            if (updRes.rowCount === 0) {
              console.log(`No actualizado id=${row.id} (${table}) — ya tiene embedding.`);
            } else {
              console.log(`Actualizado id=${row.id} (${table})`);
            }
          } catch (err) {
            console.error('Error al procesar fila', row.id, err.message || err);
          }
        }
      })());
    }
    await Promise.all(workers);
  }
}

/**
 * Contexto académico:
 *  Punto de entrada principal del script: inicializa la conexión,
 *  ejecuta el procesamiento y garantiza el cierre ordenado del cliente.
 */
(async function main() {
  try {
    await client.connect();
    console.log('Conectado a Postgres', PGDATABASE);

    await processTable(DETAIL_TABLE, DETAIL_TEXT_COLUMN, DETAIL_EMB_COLUMN, DETAIL_ID_COLUMN);

    console.log('Embeddings generados y guardados.');
  } catch (err) {
    console.error('Error principal:', err);
  } finally {
    await client.end();
  }
})();
