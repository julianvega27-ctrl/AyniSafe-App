# Sprint 2: criterios de entrega y evidencia

Fecha: 23 de noviembre de 2026. Fuente: captura de la consigna proporcionada por el responsable del proyecto. Estado: matriz de preparación; no acredita aceptación ni resultados nuevos de pruebas.

## Regla de aceptación

La entrega debe implementar la arquitectura documentada en Sprint 1 y demostrar su comportamiento mediante pruebas. Una pantalla funcional, una carpeta con nombre de capa o una prueba aprobada en el proyecto de origen no demuestran cumplimiento en AyniSafe.

Esta matriz organiza la evidencia de evaluación. No sustituye las reglas de negocio, las ADR, los escenarios EQ, OpenSpec ni `DESIGN.md`. La integración se planifica en [comparación del proyecto de origen](comparacion-proyecto-incidencias.md).

## Matriz de actividades

El estado inicial se basa en inspección de archivos, no en una nueva ejecución de la suite o de GitHub Actions.

| Criterio de la consigna | Evidencia necesaria para revisión | Situación inicial y trabajo pendiente |
|---|---|---|
| 1. Implementar el estilo arquitectónico | Código y composición ejecutable del monolito modular; responsabilidades y contratos entre módulos; recorrido de una petición real | Identidad y Consultas existen en `apps/api/src/modules/`. Integrar capacidades faltantes respetando los seis módulos documentados. No basta copiar los directorios del origen. |
| 2. Aplicar el enfoque arquitectónico | Recorrido presentación → aplicación → dominio, con infraestructura conectada por puertos; verificación de dependencias | Clean Architecture está documentada y hay capas en los módulos actuales. Revisar imports y demostrar independencia del dominio con pruebas. Evitar SQL/Express en el núcleo al portar código. |
| 3. Especificaciones SDD, aceptación y tareas | Trazabilidad RF/HU → spec → criterio de aceptación → tarea → implementación → prueba; decisiones técnicas consistentes con Sprint 1 | Existen diseño arquitectónico, specs y cambios OpenSpec. Preparar un índice de las capacidades efectivamente entregadas, enlazando esos artefactos sin duplicarlos. Los números RF del origen no equivalen a los de AyniSafe. |
| 4. REST funcional y OpenAPI/Swagger | `apps/api/openapi.yaml` actualizado; contrato válido; ejemplos y pruebas reales de éxito, validación, autenticación, permisos y errores | Hay OpenAPI, validador y pruebas de contrato. Revisar y ejecutar por cada endpoint incorporado; facilitar su consulta durante la demostración. No documentar como funcional un endpoint todavía ausente. |
| 5. Comportamiento de BD y estrategia de caché | Migraciones reproducibles, integridad, transacciones/concurrencia, planes de consultas, índices y mediciones; decisión razonada sobre caché | PostgreSQL/Prisma vigente. Falta un informe de medición de las capacidades integradas. Sin Redis en MVP es una decisión válida que debe justificarse; no agregar caché por cumplir una lista. |
| 6. SOLID y patrones cuando corresponda | Ejemplos reales y explicados en código: responsabilidad, puertos, inversión de dependencias, adaptadores y repositorios; pruebas que demuestren sustitución | Hay puertos/adaptadores y patrones documentados, algunos aún propuestos. Distinguir implementados de previstos; verificar Outbox cuando se incorpore. No añadir patrones artificiales. |
| 7. Pruebas automatizadas con Jest y CI/CD recomendado | Suite Jest de funcionalidades y reglas de negocio; reporte de cobertura; workflow que la ejecute y conserve los reportes | La API usa Vitest; el origen usa `node:test`. Ninguno cumple por equivalencia el nombre explícito Jest. Adaptar la suite pertinente de API a Jest conservando sus escenarios; Flutter conserva sus herramientas y no necesita migrarse a Jest. Hay workflow de GitHub Actions, pero debe comprobarse su ejecución y ampliarse con la evidencia requerida. |
| 8. Validar atributos de calidad de Sprint 1 | Pruebas enlazadas a EQ, configuración reproducible, métricas y resultados; carga progresiva hasta 2.000 VU según la consigna, con límites y fallos informados | Existen escenarios EQ, varios con metas propuestas o pendientes. No se encontró en esta revisión un arnés de carga ni evidencia de 2.000 VU. Conciliar objetivos y ejecutar sobre un entorno de prueba controlado; no declarar capacidad por el número configurado en el generador. |

## Cinco entregables a presentar

1. **Código fuente organizado:** commit identificable, módulos/capas y procedimiento reproducible de arranque. Mostrar una funcionalidad atravesando clientes, API y persistencia.
2. **Primera versión funcional:** recorridos completos que correspondan al alcance elegido y estados reales. Listar lo no implementado. El panel mínimo por sí solo no demuestra la gestión de reportes.
3. **OpenAPI/Swagger:** contrato de la misma revisión del código, validación y demostración de los endpoints entregados.
4. **Jest y cobertura:** resumen de pruebas, cobertura HTML y formato procesable, comandos y revisión del código probado. La consigna no fija un porcentaje: no inventar uno como condición del docente ni perseguirlo con pruebas triviales.
5. **Evidencias de calidad:** matriz EQ con prueba, ambiente, umbral, resultado, artefactos y limitaciones. Mostrar también los resultados negativos y su análisis.

## Validación de calidad

Referente: [escenarios de atributos de calidad](01-analisis-del-sistema/08-escenarios-atributos-calidad.md). Las metas pendientes se deben resolver antes de medir aceptación; no ajustarlas después para convertir un fallo en éxito.

| Escenarios | Verificación a preparar | Evidencia esperada |
|---|---|---|
| EQ-01, EQ-02 | Carga y rendimiento, mezcla de operaciones y demoras externas | Curvas de carga lograda, latencias p50/p95/p99, solicitudes/s, errores, CPU/memoria, conexiones/consultas de BD y persistencia de registros confirmados. |
| EQ-03 | Falla de una instancia con infraestructura redundante, si se habilita ese escenario | Detección y retirada, errores durante recuperación e integridad. Una sola instancia no demuestra tolerancia a la caída de otra. |
| EQ-04, EQ-09 | Permisos, privacidad y aislamiento territorial/sanitario | Matriz de usuarios/recursos, rechazos y respuestas públicas sin información restringida. |
| EQ-05, EQ-20 | Historial atómico y carrera de asignación | Comparación entre cambios confirmados, actuaciones y responsables activos; solicitudes concurrentes contra BD real. |
| EQ-06 | Sustitución de un adaptador y modificación de una regla | Diff acotado, dependencias y pruebas de contrato/regresión; clientes y dominio conservados cuando corresponda. |
| EQ-07, EQ-10 | Fallos externos, reintentos, reinicio y deduplicación | Tareas persistidas, fallas observables y recuperación sin pérdida ni duplicación de efectos persistentes. |
| EQ-08 y demás escenarios funcionales EQ-11 a EQ-21 | Aplicar los casos existentes a las capacidades entregadas, incluyendo evaluación, evidencias, prioridades, conservación y enrutamiento | Resultados por escenario, dispositivo/datos de prueba y comprobaciones observadas. Las pruebas con personas no se sustituyen por unitarias. |

### Diferencia entre la carga académica y el MVP

La consigna menciona simular progresivamente hasta 2.000 usuarios virtuales concurrentes. EQ-01 propone actualmente 100 a 200 usuarios y dos instancias como evolución; EQ-02 plantea 50 registros/minuto. Son cargas y objetivos distintos. Registrar un perfil de validación académica adicional, trazado a esos EQ, sin borrar las metas anteriores ni prometer 2.000 usuarios en el alojamiento gratuito.

Propuesta inicial de etapas: 10, 50, 100, 200, 500, 1.000 y 2.000 VU, con calentamiento y recuperación. Duraciones, mezcla de solicitudes, datos, cuentas, pausas y criterios de parada se cerrarán al construir el arnés. Usuarios virtuales no equivalen a solicitudes por segundo ni a personas reales. Registrar usuarios alcanzados, iteraciones fallidas y limitaciones del generador.

Separar arranque en frío de servicio activo. Aislar datos y servicios externos: no enviar miles de correos, push o evidencias reales. Un ensayo de saturación usa infraestructura de prueba bajo control del equipo, con límites declarados y supervisión. Si no se alcanza una etapa o un umbral, conservar la evidencia y explicar el cuello de botella; no registrar éxito.

No se exige instalar k6 específicamente en la consigna: aparece como ejemplo de herramienta. Jest sí está nombrado en actividades y entregables. La recomendación de GitHub Actions no elimina la obligación de presentar las pruebas y sus resultados.

## Análisis de base de datos y caché

Para cada consulta crítica: documentar volumen de datos, consulta, plan `EXPLAIN (ANALYZE, BUFFERS)` cuando proceda, índice utilizado, latencia y condiciones. Comparar antes/después solo con datos y entorno equivalentes. Para escrituras: probar restricciones, rollback, idempotencia y concurrencia con PostgreSQL real.

Para caché: identificar qué lectura se beneficiaría, política actual, vigencia e invalidación. Distinguir caché de navegador, memoria de proceso y caché compartida. Revisar respuestas privadas y publicación de incidentes: una optimización no puede reexponer datos retirados o saltarse permisos. Si no se incorpora caché de aplicación, presentar la decisión y mediciones que la sustentan, con limitaciones.

## Secuencia de trabajo y cierre

1. Separar los cambios locales anteriores de la nueva integración y revisar la entrega web en curso.
2. Precisar la primera versión demostrable y relacionar RF/HU, cambios OpenSpec y EQ; conservar las ADR vigentes o tramitar sus cambios de forma explícita.
3. Preparar Jest/cobertura y comprobaciones de arquitectura para que las adaptaciones posteriores nazcan con el criterio de evaluación correcto.
4. Integrar capacidades por módulo con contrato, pruebas y documentación del mismo incremento. Revisar la nueva composición del panel antes de extender identidad.
5. Completar mediciones de BD/caché y ensayos EQ/carga cuando existan los recorridos necesarios.
6. Ejecutar validación de la revisión final, reunir reportes y ensayar demostración con resultados reales.

Cada evidencia debe identificar commit (o estado local pendiente de commit), fecha, comando, ambiente, versiones, datos, resultado y limitaciones. Guardar reportes grandes como artefactos de CI o en un destino de evidencias identificado; los documentos enlazan el artefacto sin duplicar logs extensos. No publicar secretos ni datos personales.

La adaptación por módulos conserva su procedencia en commits reales; no reconstruye una historia ficticia de desarrollo. Esta matriz no ejecuta pruebas, no migra a Jest y no declara cumplidos criterios todavía pendientes.
