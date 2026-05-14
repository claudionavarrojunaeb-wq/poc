-- Muestras y comprobaciones para la base 'test'

-- Contar entradas en detalle sin embedding
select count(*) from detalle where detalleconsulta is not null and pembedding is null;

-- Ver primeras 5 filas de detalle sin embedding
select solicitudid, detalleconsulta from detalle where detalleconsulta is not null and pembedding is null limit 5;

-- Contar entradas en respuesta sin embedding
select count(*) from respuesta where respuestafinaltxt is not null and rembedding is null;

-- Ver primeras 5 filas de respuesta sin embedding
select solicitud__id, respuestafinaltxt from respuesta where respuestafinaltxt is not null and rembedding is null limit 5;

-- Prueba de coincidencia: devuelve detalle con embedding y su respuesta
select d.solicitudid, d.detalleconsulta, r.respuestafinaltxt
from detalle d
left join respuesta r on r.solicitud__id::text = d.solicitudid::text
where d.pembedding is not null
limit 5;
