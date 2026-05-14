require('dotenv').config();
const { Client } = require('pg');

/**
 * Detecta y asigna la implementación de `fetch`:
 *  - Usa `globalThis.fetch` si está disponible (Node 18+).
 *  - Si no existe, intenta requerir `node-fetch`.
 *  - Si ambas opciones fallan, el script termina porque no puede solicitar embeddings.
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
 *  - `OLLAMA_MODEL`: identificador del modelo a utilizar.
 */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Usar modelo por defecto para embeddings actualizado
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'nomic-embed-text:latest';

/** Tabla `detalle` - columnas:
 *  - `DETAIL_TABLE`: tabla con los registros de detalle.
 *  - `DETAIL_TEXT_COLUMN`: columna que contiene el texto a embeddar.
 *  - `DETAIL_EMB_COLUMN`: columna donde se almacenan los embeddings generados.
 *  - `DETAIL_ID_COLUMN`: columna identificadora de la fila en `detalle`.
 */
const DETAIL_TABLE = process.env.DETAIL_TABLE || 'detalle';
const DETAIL_TEXT_COLUMN = process.env.DETAIL_TEXT_COLUMN || 'detalleconsulta';
const DETAIL_EMB_COLUMN = process.env.DETAIL_EMB_COLUMN || 'pembedding';
const DETAIL_ID_COLUMN = process.env.DETAIL_ID_COLUMN || 'solicitudid';

/** Tabla `respuesta` - columnas:
 *  - `RESP_TABLE`: tabla con respuestas (procesada por este script).
 *  - `RESP_TEXT_COLUMN`: columna con el texto de la respuesta.
 *  - `RESP_EMB_COLUMN`: columna donde se almacenará el embedding de la respuesta.
 *  - `RESP_ID_COLUMN`: columna identificadora para la tabla `respuesta`.
 */
const RESP_TABLE = process.env.RESP_TABLE || 'respuesta';
const RESP_TEXT_COLUMN = process.env.RESP_TEXT_COLUMN || 'respuestafinaltxt';
// Guardar embeddings generados por este script en la columna "rembedding" por defecto
const RESP_EMB_COLUMN = process.env.RESP_EMB_COLUMN || 'rembedding';
const RESP_ID_COLUMN = process.env.RESP_ID_COLUMN || 'solicitud__id';

/** Parámetros de ejecución:
 *  - `BATCH_SIZE`: cantidad de filas a procesar por lote.
 *  - `CONCURRENCY`: número de workers concurrentes para procesar la cola.
 */
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);

/**
 * Contexto académico:
 *  Comprueba que los identificadores (nombres de tablas/columnas) sean
 *  válidos y seguros. Esto reduce el riesgo de inyección de nombres en
 *  consultas SQL dinámicas y mantiene el código robusto frente a entradas
 *  malformadas.
 */
/** Valida que el identificador contenga solo caracteres permitidos.
 *  Previene inyecciones en nombres usados en consultas SQL dinámicas. */
function validateIdent(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
}

validateIdent(DETAIL_TABLE);
validateIdent(DETAIL_TEXT_COLUMN);
validateIdent(DETAIL_EMB_COLUMN);
validateIdent(DETAIL_ID_COLUMN);
validateIdent(RESP_TABLE);
validateIdent(RESP_TEXT_COLUMN);
validateIdent(RESP_EMB_COLUMN);
validateIdent(RESP_ID_COLUMN);

const client = new Client({ host: PGHOST, port: PGPORT, database: PGDATABASE, user: PGUSER, password: PGPASSWORD });

/**
 * Contexto académico:
 *  Función que solicita al servicio Ollama un embedding para un texto dado.
 *  Está preparada para manejar variaciones del endpoint y normalizar la
 *  respuesta en un vector numérico.
 *
 * Descripción técnica:
 *  - Intenta varios endpoints posibles.
 *  - Soporta distintos formatos de respuesta y los normaliza.
 */
/**
 * Solicita un vector embedding a Ollama, probando varios endpoints y
 * normalizando distintas estructuras de respuesta.
 *
 * Flujo:
 *  - Para cada intento realiza `await fetchFunc(...)`.
 *  - Si la respuesta HTTP no es OK y es 404, continúa con el siguiente intento.
 *  - Si la respuesta es OK, parsea JSON y extrae el embedding según la forma.
 *  - Si todos los intentos fallan, lanza el último error capturado.
 */
async function fetchEmbedding(text) {
  const attempts = [
    { url: `${OLLAMA_URL}/embed?model=${encodeURIComponent(OLLAMA_MODEL)}`, body: JSON.stringify({ input: text }) },
    { url: `${OLLAMA_URL}/v1/embeddings`, body: JSON.stringify({ model: OLLAMA_MODEL, input: text }) },
    { url: `${OLLAMA_URL}/embeddings`, body: JSON.stringify({ model: OLLAMA_MODEL, input: text }) }
  ];

  let lastErr = null;
  for (const a of attempts) {
    try {
      const res = await fetchFunc(a.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: a.body
      });

      if (!res.ok) {
        const t = await res.text();
        if (res.status === 404) {
          lastErr = new Error(`Endpoint ${a.url} returned 404`);
          continue;
        }
        throw new Error(`Ollama responded ${res.status}: ${t}`);
      }

      const j = await res.json();
      if (j && Array.isArray(j.data) && j.data[0] && Array.isArray(j.data[0].embedding)) return j.data[0].embedding;
      if (j && Array.isArray(j.embedding)) return j.embedding;
      if (j && Array.isArray(j.embeddings)) return Array.isArray(j.embeddings[0]) ? j.embeddings[0] : j.embeddings;
      if (Array.isArray(j)) return j;

      throw new Error('Unexpected embeddings response shape: ' + JSON.stringify(j));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to fetch embedding from Ollama');
}

/**
 * Contexto académico:
 *  Construye un fragmento SQL reutilizable que evalúa si una columna de
 *  embedding está vacía, es NULL o contiene la cadena 'null'. Centralizar
 *  esta comprobación evita duplicación y errores al formar consultas.
 */
function isEmptyEmbColSql(embCol) {
  // SQL snippet to test empty/null/'null' values
  return `(${"\"" + embCol + "\""} IS NULL OR trim(COALESCE(${"\"" + embCol + "\""}::text, '')) = '' OR ${"\"" + embCol + "\""}::text = 'null')`;
}

/**
 * Contexto académico:
 *  Procesa por lotes las filas de una tabla que no tienen embeddings y
 *  las actualiza consultando el servicio de embeddings. Este patrón
 *  demuestra cómo combinar concurrencia controlada con operaciones
 *  de base de datos de forma segura.
 */
async function processTable(table, textCol, embCol, idCol) {
  console.log(`Procesando tabla ${table}, texto=${textCol}, emb=${embCol}`);

  while (true) {
    const selectQ = `SELECT "${idCol}" AS id, "${textCol}" AS texto FROM "${table}" WHERE ("${embCol}" IS NULL OR trim(COALESCE("${embCol}"::text, '')) = '' OR "${embCol}"::text = 'null') LIMIT $1`;
    const res = await client.query(selectQ, [BATCH_SIZE]);
    console.log(`Batch seleccionado: ${res.rows.length} filas desde tabla ${table}`);
    if (res.rows.length === 0) break;

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
 *  Orquestador principal del script: inicializa la conexión con Postgres,
 *  ejecuta el procesamiento de la tabla `respuesta` y garantiza el cierre
 *  ordenado del cliente al finalizar.
 */
(async function main() {
  try {
    await client.connect();
    console.log('Conectado a Postgres', PGDATABASE);

    // Procesar solamente la tabla `respuesta` con los campos indicados
    await processTable(RESP_TABLE, RESP_TEXT_COLUMN, RESP_EMB_COLUMN, RESP_ID_COLUMN);

    console.log('Embeddings generados y guardados (solo filas faltantes).');
  } catch (err) {
    console.error('Error principal:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
