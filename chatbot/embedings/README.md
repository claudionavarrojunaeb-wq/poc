# Resumen del PoC

Este repositorio contiene scripts Node.js para extraer resúmenes ligeros
(keywords) y generar embeddings desde textos almacenados en una base de datos
Postgres. Los embeddings se obtienen mediante un servicio Ollama local o
remoto. Los scripts procesan las filas en lotes y actualizan columnas
destino en las tablas.

## Objetivo

- `generate_resumen.js`: Extrae palabras clave simples desde campos de texto
  y las guarda en una columna de resumen.
- `generatepembeddings.js`: Genera embeddings para filas (columna `pembedding`) a
  partir de un campo `resumen` o similar.
- `genetarerembeddings.js`: Genera embeddings para tablas `detalle` y `respuesta`
  con los nombres de columna configurados por variables de entorno.

## Anotaciones por archivo

### src/generate_resumen.js

- extractKeywords(text, maxKeywords=5):
  - Contexto académico: Esta función realiza una extracción simple de palabras
    clave (keywords) a partir de un texto libre. Está diseñada para ser
    didáctica y suficiente en escenarios donde se requiere un resumen ligero
    basado en frecuencia.
  - Descripción técnica: normaliza texto, elimina puntuación, tokeniza,
    filtra stopwords y tokens no informativos, calcula frecuencias y devuelve
    las palabras más relevantes.

- findTextColumn(table, preferred):
  - Contexto académico: identifica cuál columna de una tabla contiene el
    texto a procesar cuando el esquema puede variar. Comprueba la columna
    preferida, busca candidatos comunes y devuelve la primera columna si no
    hay coincidencias.

- IIFE principal (orquestador):
  - Contexto académico: conecta a Postgres, asegura la existencia de la
    columna de resumen, procesa filas por lotes y actualiza la tabla con
    los resúmenes extraídos.

Diagrama de flujo (generate_resumen.js):

```mermaid
flowchart LR
  A[Inicio: generate_resumen.js] --> B[Conectar a Postgres]
  B --> C[findTextColumn(table, preferred)]
  C --> D[Seleccionar filas sin resumen]
  D --> E[extractKeywords(text)]
  E --> F[UPDATE tabla SET resumen]
  F --> G[Bucle: siguiente lote]
  G --> H[Cerrar conexión]
```

### src/generatepembeddings.js

- validateIdent(name):
  - Contexto académico: valida identificadores de tabla/columna para evitar
    inyección de nombres en SQL.

- fetchEmbedding(text):
  - Contexto académico: obtiene embeddings desde Ollama y normaliza varias
    formas de respuesta (data.embedding, embedding, embeddings, array).

- findIdColumn(table, preferred):
  - Contexto académico: intenta resolver la columna PK o preferida usada como
    identificador de fila.

- findTextColumn(table, preferred):
  - Contexto académico: identifica la columna que contiene el texto a
    embeddar (por ejemplo `resumen`).

- processTable(table, textCol, embCol, idCol):
  - Contexto académico: procesa filas en lotes, lanza workers concurrentes que
    solicitan embeddings y actualizan la base de datos.

- IIFE principal: orquesta conexión y llamada a `processTable`.

Diagrama de flujo (generatepembeddings.js):

```mermaid
flowchart LR
  A[Inicio: generatepembeddings.js] --> B[Conectar a Postgres]
  B --> C[processTable(DETAIL_TABLE,...)]
  C --> D[findIdColumn & findTextColumn]
  C --> E[SELECT filas sin embedding]
  E --> F[Cola de workers]
  F --> G[fetchEmbedding(text)]
  G --> H[Ollama service]
  F --> I[UPDATE tabla SET embedding]
  I --> J[Siguiente lote]
  J --> K[Cerrar conexión]
```

### src/genetarerembeddings.js

- validateIdent(name): valida nombres de tablas/columnas.
- fetchEmbedding(text): solicita embeddings y normaliza respuestas.
- isEmptyEmbColSql(embCol): construye fragmento SQL para test de columna vacía.
- processTable(table, textCol, embCol, idCol): procesa filas por lotes con
  concurrencia y actualiza embeddings en las tablas `detalle` y `respuesta`.
- IIFE principal: orquesta la ejecución específica para la tabla `respuesta`.

Diagrama de flujo (genetarerembeddings.js):

```mermaid
flowchart LR
  A[Inicio: genetarerembeddings.js] --> B[Conectar a Postgres]
  B --> C[processTable(RESP_TABLE,...)]
  C --> D[SELECT filas sin embedding]
  D --> E[Workers concurrentes]
  E --> F[fetchEmbedding(text) -> Ollama]
  F --> G[UPDATE RESP_TABLE SET rembedding]
  G --> H[Siguiente lote]
  H --> I[Cerrar conexión]
```

## Ejecución

Ejemplo de ejecución desde la raíz del proyecto (requiere variables de entorno adecuadas):

```bash
node src/generate_resumen.js
node src/generatepembeddings.js
node src/genetarerembeddings.js
```

## Notas finales

- Los scripts esperan un servicio de Postgres accesible y, para los
  embeddings, un servicio Ollama disponible en `OLLAMA_URL`.
- Se recomienda revisar las variables de entorno y asegurar que las
  columnas y tablas configuradas existen o son detectables por las
  funciones auxiliares incluidas.
# Generador de embeddings (Ollama -> Postgres)

Proyecto para generar embeddings con el modelo `nomic-embed-text` via la API HTTP de Ollama y guardarlos en PostgreSQL.

Requisitos:
- Tener Ollama corriendo y el modelo `nomic-embed-text` instalado.
- PostgreSQL accesible y las tablas `detalle` y `respuesta` con columnas de texto y columnas para almacenar embeddings.
- Node.js (recomendado v18+) o instalar dependencias.

Instalación:

1. Copia `.env.example` a `.env` y ajusta valores.
2. Instala dependencias:

```bash
npm install
```

Uso:

```bash
npm start
```

Configuración importante:
- Por defecto el script asume que cada tabla tiene una columna `id` (clave primaria), una columna de texto y una columna para el embedding.
- Los nombres por defecto se configuran en `.env` como `DETAIL_TEXT_COLUMN`, `DETAIL_EMB_COLUMN`, `RESP_TEXT_COLUMN`, `RESP_EMB_COLUMN`.
- Si tu tabla no usa `id` como nombre de la columna primaria, configura `DETAIL_ID_COLUMN` y/o `RESP_ID_COLUMN` en `.env`.
- El script almacena el embedding como JSON en la columna de embedding; por ello, esas columnas deben ser `text` o `jsonb` en Postgres.

Endpoint Ollama esperado:
- POST `${OLLAMA_URL}/embeddings` con body `{ model: "nomic-embed-text", input: "..." }` y respuesta `{ data: [ { embedding: [...] } ] }`.

Si tu instalación de Ollama usa otra ruta o formato, ajusta `OLLAMA_URL` y `OLLAMA_MODEL` en `.env`.
