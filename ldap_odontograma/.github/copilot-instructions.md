# Instrucciones compartidas de _SSMM

Estas instrucciones aplican a todo el proyecto y sirven para que cualquier cambio futuro mantenga el mismo criterio de documentacion y trazabilidad.

## Regla principal de documentacion del codigo

- En cada archivo de codigo que el agente cree o modifique, agregar comentarios exhaustivos y muy detallados con finalidad didactica.
- La documentacion debe explicar no solo que hace cada bloque sino tambien por que existe, que contexto cubre y que efecto produce dentro del flujo general.
- Documentar de forma explicita funciones, componentes, handlers, bucles, condicionales, validaciones, awaits, fetches, transformaciones de datos, constantes relevantes y cualquier paso intermedio que pueda ser util para estudio.
- Si un bloque es pequeno pero su intencion no es obvia, tambien debe quedar explicado.
- Si el usuario pide un estilo distinto para un archivo o una intervencion puntual, esa indicacion tiene prioridad sobre esta regla general.

## Alcance operativo

- Esta regla se aplica a cada nuevo archivo creado y a cada archivo existente que sea modificado a partir de ahora dentro de _SSMM.
- La regla no obliga a reanotar retroactivamente todos los archivos historicos si no fueron tocados en la tarea actual.
- La documentacion debe mantenerse consistente con el estilo real del archivo para evitar ruido innecesario o comentarios contradictorios.

## Trazabilidad de sesion

- Mantener `sesiones/index.md` como indice corto de continuidad y primer archivo de lectura para recuperar contexto.
- Registrar cada nueva sesion en la carpeta sesiones con un archivo independiente.
- Si se realizan consultas SQL usando las credenciales documentadas en BBDD.md, dejarlas registradas alli junto con su proposito.