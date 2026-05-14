import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

/* `app` es la instancia principal de Express desde la que se montan middlewares, rutas y estáticos. */
const app = express();

/* `__filename` reconstruye la ruta absoluta del módulo actual en entorno ESM. */
const __filename = fileURLToPath(import.meta.url);

/* `__dirname` permite resolver archivos locales del proyecto como `log.txt`, `Modelfile` y `frontend/`. */
const __dirname = path.dirname(__filename);

/* `PORT` define el puerto HTTP del backend, tomando `.env` y usando `4000` como fallback. */
const PORT = Number.parseInt(process.env.PORT || '4000', 10);

/* `PGHOST` indica el host de PostgreSQL. */
const PGHOST = process.env.PGHOST || 'localhost';

/* `PGPORT` convierte el puerto de PostgreSQL a número para usarlo en `pg`. */
const PGPORT = Number.parseInt(process.env.PGPORT || '5432', 10);

/* `PGDATABASE` define la base de datos activa del proyecto. */
const PGDATABASE = process.env.PGDATABASE || 'test';

/* `PGUSER` define el usuario con el que se abrirá la conexión a PostgreSQL. */
const PGUSER = process.env.PGUSER || 'test';

/* `PGPASSWORD` define la contraseña asociada al usuario configurado. */
const PGPASSWORD = process.env.PGPASSWORD || 'test';

/* `OLLAMA_URL` es la base de todos los endpoints HTTP de Ollama. */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/* `EMBEDDING_MODEL` fija el modelo de embeddings permitido por el flujo RAG. */
const EMBEDDING_MODEL = 'nomic-embed-text';

/* `GENERATION_MODEL` fija el modelo generativo responsable de redactar la respuesta final. */
const GENERATION_MODEL = 'deepseek-r1:8b';

/* `LOG_FILE_PATH` resuelve el archivo donde se persistirá la trazabilidad del backend. */
const LOG_FILE_PATH = path.join(__dirname, 'log.txt');

/* `MODELFILE_PATH` resuelve la ubicación del archivo que contiene reglas de seguridad y comportamiento. */
const MODELFILE_PATH = path.join(__dirname, 'Modelfile');

/* `client` es el cliente reutilizable de PostgreSQL que se conecta durante el arranque del servidor. */
const client = new Client({
  host: PGHOST,
  port: PGPORT,
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
});

/* `SQL_SIMILARITY_QUERY` define la consulta pgvector oficial con `<=>` y `LIMIT 5`. */
const SQL_SIMILARITY_QUERY = `
  SELECT
    detalleconsulta,
    resumen,
    pembedding
  FROM detalle
  WHERE pembedding IS NOT NULL
  ORDER BY pembedding <=> $1::vector
  LIMIT 5;
`;

/* `serializeLogData` normaliza cualquier dato adicional antes de escribirlo en `log.txt`. */
function serializeLogData(data) {
  /* Este `if` detecta ausencia de payload adicional y evita añadir texto basura al log. */
  if (data === undefined) {
    return '';
  }

  /* Este `if` detecta objetos `Error` para registrar `stack` o `message` con más contexto. */
  if (data instanceof Error) {
    return data.stack || data.message;
  }

  /* Este `if` deja pasar strings ya listos sin reserializarlos. */
  if (typeof data === 'string') {
    return data;
  }

  try {
    /* `JSON.stringify` intenta serializar objetos y arrays a una representación estable. */
    return JSON.stringify(data);
  } catch {
    /* Si la serialización falla, este fallback asegura al menos una salida textual. */
    return String(data);
  }
}

/* `writeLog` compone la línea final y la agrega al archivo de log persistente. */
function writeLog(level, message, data) {
  /* `timestamp` marca el instante exacto del evento en formato ISO. */
  const timestamp = new Date().toISOString();

  /* `serialized` contiene el payload extra ya normalizado para persistencia. */
  const serialized = serializeLogData(data);

  /* `suffix` solo añade separador si realmente existe información adicional. */
  const suffix = serialized ? ` | ${serialized}` : '';

  /* `line` representa la línea completa que se escribirá en `log.txt`. */
  const line = `[${timestamp}] [${level}] ${message}${suffix}\n`;

  try {
    /* `appendFileSync` persiste la línea inmediatamente para no perder trazabilidad en fallos. */
    fs.appendFileSync(LOG_FILE_PATH, line, 'utf8');
  } catch (fileError) {
    /* Si falla el log a disco, se refleja por consola para no perder visibilidad del problema. */
    console.error('No fue posible escribir en log.txt:', fileError);
  }
}

/* `logInfo` simplifica el registro de eventos informativos. */
function logInfo(message, data) {
  writeLog('INFO', message, data);
}

/* `logError` simplifica el registro de errores y rutas excepcionales. */
function logError(message, error) {
  writeLog('ERROR', message, error);
}

/* `cargarReglasDelModelfile` lee las reglas del archivo `Modelfile` para inyectarlas al prompt. */
function cargarReglasDelModelfile() {
  try {
    /* `contenido` lee el archivo completo y elimina espacios vacíos sobrantes. */
    const contenido = fs.readFileSync(MODELFILE_PATH, 'utf8').trim();

    /* Este `if` detecta un Modelfile vacío y activa un fallback seguro. */
    if (!contenido) {
      logInfo('Modelfile vacío, se usará solo la instrucción base');
      return '';
    }

    /* Si el contenido existe, se registra para dejar trazabilidad de que fue cargado. */
    logInfo('Modelfile cargado correctamente', { path: MODELFILE_PATH });
    return contenido;
  } catch (error) {
    /* Si la lectura falla, se registra el error y se permite continuar con reglas vacías. */
    logError('No fue posible leer Modelfile', error);
    return '';
  }
}

/* `MODELFILE_RULES` conserva en memoria las reglas leídas desde `Modelfile`. */
const MODELFILE_RULES = cargarReglasDelModelfile();

/* Este middleware habilita CORS para permitir requests del frontend al backend. */
app.use(cors());

/* Este middleware habilita el parseo automático de cuerpos JSON hacia `req.body`. */
app.use(express.json());

/* Este middleware registra el inicio y final de cada request HTTP. */
app.use((req, res, next) => {
  /* `startedAt` captura el momento de entrada del request para medir su duración total. */
  const startedAt = Date.now();

  logInfo('Solicitud recibida', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });

  /* `res.on('finish')` se ejecuta cuando la respuesta ya fue enviada al cliente. */
  res.on('finish', () => {
    logInfo('Solicitud finalizada', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  /* `next()` transfiere el control al siguiente middleware o ruta. */
  next();
});

/* Este middleware traduce errores de parseo JSON en un `400` controlado. */
app.use((err, req, res, next) => {
  /* Este `if` permite continuar normalmente cuando no existe error. */
  if (!err) {
    next();
    return;
  }

  /* `isJsonError` detecta específicamente errores producidos por JSON inválido. */
  const isJsonError = err.type === 'entity.parse.failed' || err instanceof SyntaxError;

  /* Este `if` convierte un error técnico del body parser en una respuesta útil para el cliente. */
  if (isJsonError) {
    logError('JSON inválido recibido', err);
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }

  /* Si el error no corresponde a JSON inválido, se delega a otra capa. */
  next(err);
});

/* `fetchEmbedding` solicita el vector de embedding de la pregunta del usuario a Ollama. */
async function fetchEmbedding(pregunta) {
  logInfo('Solicitando embedding a Ollama', {
    endpoint: `${OLLAMA_URL}/api/embeddings`,
    model: EMBEDDING_MODEL,
    preguntaLength: pregunta.length,
  });

  /* `response` guarda la respuesta HTTP del endpoint de embeddings; se usa `await` porque es IO de red. */
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: pregunta,
    }),
  });

  /* Este `if` detecta errores HTTP del servicio de embeddings y corta el flujo con una excepción descriptiva. */
  if (!response.ok) {
    /* `errorText` lee el cuerpo textual de error devuelto por Ollama. */
    const errorText = await response.text();

    /* `error` conserva código HTTP y detalle del fallo para log y diagnóstico. */
    const error = new Error(`Error al obtener embedding: ${response.status} ${errorText}`);
    logError('Fallo al obtener embedding', error);
    throw error;
  }

  /* `data` contiene el JSON devuelto por Ollama tras una respuesta exitosa. */
  const data = await response.json();

  /* Este `if` valida que el payload devuelva un vector real en `data.embedding`. */
  if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
    const error = new Error('La respuesta de embeddings no contiene un vector válido');
    logError('Embedding inválido recibido', error);
    throw error;
  }

  logInfo('Embedding recibido', { dimensions: data.embedding.length });

  return data.embedding;
}

/* `construirContexto` transforma filas recuperadas en bloques textuales separados por doble salto de línea. */
function construirContexto(resultados) {
  return resultados
    /* `.map` recorre cada fila recuperada y la convierte en un bloque de contexto legible para el LLM. */
    .map((fila, index) => {
      /* `detalle` limpia el campo `detalleconsulta` y evita fallos si viene nulo. */
      const detalle = (fila.detalleconsulta || '').trim();

      /* `resumen` limpia el campo `resumen`, que suele condensar la semántica principal del registro. */
      const resumen = (fila.resumen || '').trim();

      return [
        `Resultado ${index + 1}:`,
        `Detalle: ${detalle || 'Sin detalle'}`,
        `Resumen: ${resumen || 'Sin resumen'}`,
      ].join('\n');
    })
    /* `.join('\n\n')` cumple el requisito de separar los bloques con doble salto de línea. */
    .join('\n\n');
}

/* `generarRespuesta` construye el prompt final y llama al modelo generativo de Ollama. */
async function generarRespuesta(contexto, pregunta) {
  logInfo('Solicitando generación a Ollama', {
    endpoint: `${OLLAMA_URL}/api/generate`,
    model: GENERATION_MODEL,
    contextoLength: contexto.length,
    preguntaLength: pregunta.length,
  });

  /* `prompt` combina reglas del Modelfile, contexto recuperado y pregunta del usuario. */
  const prompt = [
    'Reglas del sistema:',
    MODELFILE_RULES || 'No hay reglas adicionales en Modelfile.',
    '',
    'Instrucción: responde SOLO usando el contexto proporcionado.',
    'No inventes información.',
    'Si la respuesta no está en el contexto, responde exactamente: "No tengo esa información".',
    '',
    'Contexto:',
    contexto,
    '',
    'Pregunta:',
    pregunta,
    '',
    'Respuesta:',
  ].join('\n');

  /* `response` guarda la respuesta HTTP del endpoint generativo; se usa `await` por tratarse de una petición de red. */
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GENERATION_MODEL,
      prompt,
      stream: false,
    }),
  });

  /* Este `if` detecta respuestas HTTP fallidas del modelo generativo. */
  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Error al generar respuesta: ${response.status} ${errorText}`);
    logError('Fallo al generar respuesta', error);
    throw error;
  }

  /* `data` es el JSON completo devuelto por Ollama. */
  const data = await response.json();

  /* `respuesta` normaliza el campo `response` a un string limpio y usable. */
  const respuesta = typeof data.response === 'string' ? data.response.trim() : '';

  /* Este `if` protege contra respuestas vacías o malformadas del modelo. */
  if (!respuesta) {
    const error = new Error('La respuesta del modelo está vacía');
    logError('Respuesta vacía del modelo', error);
    throw error;
  }

  logInfo('Respuesta generada', { respuestaLength: respuesta.length });

  return respuesta;
}

/* `POST /api/chat` es el endpoint principal del chatbot RAG. */
app.post('/api/chat', async (req, res) => {
  try {
    /* `pregunta` extrae el campo esperado desde el body y tolera `req.body` nulo. */
    const { pregunta } = req.body ?? {};

    logInfo('Procesando /api/chat', {
      hasPregunta: typeof pregunta === 'string',
    });

    /* Este `if` valida el contrato del endpoint: la pregunta debe ser un string no vacío. */
    if (typeof pregunta !== 'string' || !pregunta.trim()) {
      logError('Pregunta inválida en /api/chat', new Error('El campo pregunta es obligatorio'));
      res.status(400).json({ error: 'El campo pregunta es obligatorio' });
      return;
    }

    /* `embedding` guarda el vector semántico de la pregunta, obtenido desde Ollama. */
    const embedding = await fetchEmbedding(pregunta.trim());

    /* `embeddingVector` convierte el array numérico al formato textual exigido por pgvector. */
    const embeddingVector = `[${embedding.join(',')}]`;

    logInfo('Ejecutando consulta de similitud', {
      topK: 5,
      sql: 'ORDER BY pembedding <=> $1::vector LIMIT 5',
    });

    /* `queryResult` ejecuta la búsqueda vectorial en PostgreSQL usando la query principal. */
    const queryResult = await client.query(SQL_SIMILARITY_QUERY, [embeddingVector]);

    logInfo('Resultados recuperados de PostgreSQL', {
      rows: queryResult.rows.length,
    });

    /* Este `if` maneja el caso donde no se recupera ningún contexto útil. */
    if (!queryResult.rows.length) {
      logInfo('Sin resultados para la pregunta actual');
      res.json({ respuesta: 'No tengo esa información' });
      return;
    }

    /* `contexto` convierte las filas recuperadas en el bloque textual que verá el modelo. */
    const contexto = construirContexto(queryResult.rows);
    logInfo('Contexto construido', { contextoLength: contexto.length });

    /* `respuesta` contiene el texto final generado por el LLM usando solo el contexto recuperado. */
    const respuesta = await generarRespuesta(contexto, pregunta.trim());

    logInfo('Respuesta enviada al cliente');
    res.json({ respuesta });
  } catch (error) {
    /* Este `catch` centraliza fallos de red, base de datos, validación o modelo para el endpoint. */
    logError('Error en /api/chat', error);
    console.error('Error en /api/chat:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

/* Esta línea expone la carpeta `frontend` como sitio estático servido por Express. */
app.use('/', express.static(path.join(__dirname, 'frontend')));

/* `startServer` prepara archivos, base de datos y puerto antes de aceptar tráfico. */
async function startServer() {
  try {
    /* Este `if` crea `log.txt` si aún no existe para asegurar un destino de logging disponible. */
    if (!fs.existsSync(LOG_FILE_PATH)) {
      fs.writeFileSync(LOG_FILE_PATH, '', 'utf8');
    }

    logInfo('Iniciando servidor', {
      port: PORT,
      database: PGDATABASE,
      ollamaUrl: OLLAMA_URL,
    });

    /* `await client.connect()` abre la conexión persistente a PostgreSQL. */
    await client.connect();
    logInfo('Conexión a PostgreSQL establecida');

    /* `await client.query(...)` garantiza que la extensión `vector` exista antes de operar con pgvector. */
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    logInfo('Extensión vector verificada');

    /* `app.listen` publica el servidor HTTP y deja el backend listo para recibir requests. */
    app.listen(PORT, () => {
      logInfo('Servidor escuchando', { port: PORT });
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    /* Este `catch` captura problemas críticos de arranque y termina el proceso si el servicio no puede operar. */
    logError('No fue posible iniciar el servidor', error);
    console.error('No fue posible iniciar el servidor:', error);
    process.exit(1);
  }
}

/* Esta llamada dispara el arranque efectivo del backend al cargar el módulo. */
startServer();

/* Este `export` expone la query principal y funciones clave para pruebas o reutilización futura. */
export { SQL_SIMILARITY_QUERY, fetchEmbedding, generarRespuesta };