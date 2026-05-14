require('dotenv').config();
const { Client } = require('pg');

/** Parámetros de conexión a Postgres (leídos desde variables de entorno):
 *  - `PGHOST`: host del servidor Postgres (por defecto 'localhost').
 *  - `PGPORT`: puerto TCP del servidor (por defecto '5432').
 *  - `PGDATABASE`: nombre de la base de datos a usar (por defecto 'test').
 *  - `PGUSER`: usuario para la conexión.
 *  - `PGPASSWORD`: contraseña del usuario.
 */
const PGHOST = process.env.PGHOST || 'localhost';
const PGPORT = parseInt(process.env.PGPORT || '5432', 10);
const PGDATABASE = process.env.PGDATABASE || 'test';
const PGUSER = process.env.PGUSER || 'test';
const PGPASSWORD = process.env.PGPASSWORD || 'test';

/** Nombres de tabla y columnas usadas por este script (configurables):
 *  - `DETAIL_TABLE`: tabla que contiene los registros a procesar.
 *  - `DETAIL_TEXT_COLUMN`: columna que contiene el texto origen a resumir.
 *  - `DETAIL_RESUMEN_COLUMN`: columna destino donde se guardará el resumen.
 *  - `DETAIL_ID_COLUMN`: columna identificadora única de la fila.
 */
const DETAIL_TABLE = process.env.DETAIL_TABLE || 'detalle';
const DETAIL_TEXT_COLUMN = process.env.DETAIL_TEXT_COLUMN || 'detalleconsulta';
const DETAIL_RESUMEN_COLUMN = process.env.DETAIL_RESUMEN_COLUMN || 'resumen';
const DETAIL_ID_COLUMN = process.env.DETAIL_ID_COLUMN || 'solicitudid';

/** Conexión a Postgres:
 *  Se instancia un `Client` con parámetros leídos de variables de entorno.
 *  Esta conexión se reutiliza para ejecutar consultas SQL durante la ejecución.
 */
const client = new Client({ host: PGHOST, port: PGPORT, database: PGDATABASE, user: PGUSER, password: PGPASSWORD });

/**
 * Contexto académico:
 *  Esta función realiza una extracción simple de palabras clave (keywords)
 *  a partir de un texto libre. Está diseñada para ser didáctica y suficiente
 *  en escenarios donde se requiere un resumen ligero basado en frecuencia.
 *
 * Descripción técnica:
 *  - Normaliza el texto a minúsculas.
 *  - Elimina signos de puntuación y normaliza espacios.
 *  - Tokeniza por espacios y filtra stopwords y tokens no informativos
 *    (números puros y tokens muy cortos).
 *  - Calcula frecuencias y selecciona las palabras más frecuentes,
 *    ordenando además por longitud para romper empates.
 *
 * Parámetros:
 *  - text {string}: Texto de entrada desde el que extraer keywords.
 *  - maxKeywords {number}: Número máximo de keywords a devolver (por defecto 5).
 *
 * Retorno:
 *  - {string}: Una cadena con las palabras clave seleccionadas separadas por
 *    espacios y con la inicial capitalizada en cada palabra para mejor lectura.
 */
function extractKeywords(text, maxKeywords = 5) {
  /** Guard clause:
   *  Si `text` es falsy (undefined/null/''), retorna cadena vacía para evitar
   *  procesamiento innecesario y posibles errores al operar sobre valores no string.
   */
  if (!text) return '';
  // Normalizar
  let s = text.toLowerCase();
  // Reemplazar puntuación por espacios
  s = s.replace(/[\u2018\u2019\u201C\u201D\"'.,;:!?()\[\]{}<>\-\/\\]/g, ' ');
  // Reemplazar múltiples espacios
  s = s.replace(/\s+/g, ' ').trim();
  const tokens = s.split(' ').filter(t => t.length > 1);

  /** Stopwords:
   *  Conjunto de palabras a ignorar porque aportan poca o nula información
   *  semántica para la extracción de keywords.
   */
  const stopwords = new Set([
    'de','la','el','y','en','que','a','los','las','por','con','para','se','mi','me','le','lo','al','del','su','es','esta','esta','esto','esta','como','pero','o','si','esta','fue','ya','ha','han','sin','sobre','más','mas','este','esta','son','era'
  ]);

  /** Mapa de frecuencias:
   *  Clave = token, Valor = número de apariciones. Se usa para ordenar
   *  por importancia estadística (frecuencia).
   */
  const freqs = new Map();
  /** Iteración sobre tokens:
   *  Aplica filtros (stopwords, números puros, tokens cortos) y contabiliza.
   */
  for (const t of tokens) {
    /** Si el token está en la lista de stopwords, no aporta valor informativo. */
    if (stopwords.has(t)) continue;
    /** Si el token es un número puro (sólo dígitos), se ignora para evitar tokens no léxicos. */
    if (/^\d+$/.test(t)) continue;
    /** Si el token tiene 2 o menos caracteres, suele ser poco informativo; se ignora. */
    if (t.length <= 2) continue;
    freqs.set(t, (freqs.get(t) || 0) + 1);
  }

  // Ordenar por frecuencia y luego por longitud (desc)
  const items = Array.from(freqs.entries());
  items.sort((a, b) => {
    /** Ordenamiento principal: frecuencia descendente. Si hay empate, desempata por longitud. */
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].length - a[0].length;
  });

  /** Selección y formateo final de keywords:
   *  Se toman los `maxKeywords` primeros y se capitaliza la inicial de cada palabra.
   */
  const keywords = items.slice(0, maxKeywords).map(i => {
    // capitalizar inicial
    return i[0].replace(/(^|\s)\S/g, l => l.toUpperCase());
  });

  return keywords.join(' ');
}

/**
 * Contexto académico:
 *  Cuando trabajamos con tablas dinámicas o con esquemas desconocidos, es
 *  habitual que la columna que contiene el texto no tenga un nombre fijo.
 *  Esta función intenta resolver cuál es la columna que contiene el texto
 *  que queremos procesar.
 *
 * Descripción técnica:
 *  - Comprueba si la columna preferida existe.
 *  - Si no existe, lista las columnas de la tabla y busca candidatos
 *    comunes (por ejemplo: 'detalleconsulta', 'texto', 'consulta', etc.).
 *  - Si no encuentra coincidencias, devuelve la primera columna disponible.
 *
 * Parámetros:
 *  - table {string}: Nombre de la tabla a inspeccionar.
 *  - preferred {string}: Nombre de la columna preferida si existe.
 *
 * Retorno:
 *  - {Promise<string>}: Nombre de la columna seleccionada.
 */
async function findTextColumn(table, preferred) {
  /** Comprueba si la columna preferida existe en la tabla consultando el catálogo. */
  try {
    const chk = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`;
    const r = await client.query(chk, [table, preferred]);
    /** Si la consulta devuelve filas, la columna preferida existe y la devolvemos. */
    if (r.rows.length > 0) return preferred;
  } catch (e) {}

  /** Listado de columnas de la tabla; se usa para buscar candidatos por nombre. */
  const colsQ = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`;
  const colsRes = await client.query(colsQ, [table]);
  const cols = colsRes.rows.map(r => r.column_name);
  const candidates = ['detalleconsulta','detalle_consulta','detalle','texto','consulta','descripcion','body'];
  /** Itera candidatos comunes en orden de prioridad; devuelve el primero encontrado. */
  for (const c of candidates) {
    const found = cols.find(col => col.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  /** Fallback: devolver la primera columna si no hay candidatos específicos. */
  if (cols.length > 0) return cols[0];
  throw new Error(`No se encontraron columnas en la tabla ${table}`);
}

/**
 * Contexto académico:
 *  IIFE (Función asíncrona autoejecutable) que actúa como orquestador del
 *  script. Se encarga de la conexión a la base de datos, detección de
 *  columnas, procesamiento por lotes y actualización de resúmenes.
 *
 * Rol en el sistema:
 *  - Conecta al cliente de Postgres.
 *  - Verifica y crea la columna de destino para los resúmenes si no existe.
 *  - Itera por lotes sobre las filas sin resumen y emplea `extractKeywords`
 *    para generar un resumen ligero que se almacena en la tabla.
 *
 * Nota pedagógica:
 *  Mantener la lógica de orquestación separada de las funciones puras
 *  (`extractKeywords`, `findTextColumn`) facilita las pruebas unitarias
 *  y la comprensión del flujo de datos.
 */
/** Orquestador principal (IIFE):
 *  - Establece conexión con Postgres.
 *  - Verifica existencia y crea columna de resumen si es necesario.
 *  - Procesa filas por lotes y actualiza resúmenes mediante `extractKeywords`.
 */
(async function main(){
  try {
    /** Establece la conexión asíncrona con Postgres. */
    await client.connect();
    console.log('Conectado a Postgres', PGDATABASE);

    /** Resuelve la columna de texto a procesar (puede derivar a un candidato si la preferida no existe). */
    const textCol = await findTextColumn(DETAIL_TABLE, DETAIL_TEXT_COLUMN);

    // Comprobar existencia de columna resumen
    /** Consulta metadata para comprobar si la columna de resumen existe. */
    const chk = `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`;
    /** Ejecuta consulta y espera el resultado (operación IO). */
    const r = await client.query(chk, [DETAIL_TABLE, DETAIL_RESUMEN_COLUMN]);
    /** Si no existe la columna de resumen, la crea: esto modifica el esquema. */
    if (r.rows.length === 0) {
      console.log(`La columna '${DETAIL_RESUMEN_COLUMN}' no existe en la tabla '${DETAIL_TABLE}'. Creando columna...`);
      /** ALTER TABLE: operación DDL que requiere permisos; se ejecuta de forma síncrona respecto al flujo asíncrono. */
      await client.query(`ALTER TABLE "${DETAIL_TABLE}" ADD COLUMN "${DETAIL_RESUMEN_COLUMN}" text`);
      console.log('Columna creada.');
    }

    // Procesar por lotes todas las filas donde resumen está vacío o NULL
    /** Tamaño de lote para cada iteración. Ajustar según memoria y latencia. */
    const BATCH_SIZE = parseInt(process.env.RESUMEN_BATCH_SIZE || '500', 10);
    let totalUpdated = 0;
    /** Bucle principal por lotes: se repite hasta que no quedan filas por procesar. */
    while (true) {
      const sel = `SELECT "${DETAIL_ID_COLUMN}" AS id, "${textCol}" AS texto FROM "${DETAIL_TABLE}" WHERE ("${DETAIL_RESUMEN_COLUMN}" IS NULL OR trim(COALESCE("${DETAIL_RESUMEN_COLUMN}",'')) = '') ORDER BY "${DETAIL_ID_COLUMN}" LIMIT $1`;
      /** Ejecuta SELECT asíncrono para obtener un lote de filas sin resumen. */
      const resRows = (await client.query(sel, [BATCH_SIZE])).rows;
      /** Si no se obtienen filas, finaliza el bucle de lotes. */
      if (resRows.length === 0) break;
      console.log(`Procesando lote de ${resRows.length} filas para generar resúmenes keywords.`);
      /** Itera cada fila del lote de forma secuencial; podría paralelizarse con cuidado. */
      for (const row of resRows) {
        /** Extrae el texto de la fila; si es falsy se normaliza a cadena vacía. */
        const texto = row.texto || '';
        /** Genera resumen (keywords) a partir del texto. */
        const resumen = extractKeywords(texto, 5);
        /** Si el resumen está vacío, evitar la actualización innecesaria. */
        if (!resumen) continue;
        const upd = `UPDATE "${DETAIL_TABLE}" SET "${DETAIL_RESUMEN_COLUMN}" = $1 WHERE "${DETAIL_ID_COLUMN}" = $2`;
        /** Ejecuta la actualización; `await` garantiza que la operación termine antes de continuar con la siguiente fila. */
        await client.query(upd, [resumen, row.id]);
        totalUpdated++;
        console.log(`Actualizado id=${row.id} resumen='${resumen}'`);
      }
    }
    console.log(`Terminado. Total actualizados: ${totalUpdated}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    /** Cierra la conexión con Postgres de forma ordenada. */
    await client.end();
  }
})();
