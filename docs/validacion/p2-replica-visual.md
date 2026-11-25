# P2 — Réplica visual incremental

Fecha: 24/11/2026. Cambio: `replica-visual-web-movil`. Alcance aplicado: P2.1 (trazabilidad y web pública), P2.2 (panel institucional y catálogo de la API) y el código de P2.3–P2.4 (tema, formularios y navegación Flutter). La comparación renderizada Android, TalkBack, el E2E real del panel y la validación integrada/CI siguen pendientes; no se declara terminada la UI completa.

## Trazabilidad inicial

Spec previa al código: `d678217` (`docs(openspec): especificar replica visual web y movil`), también revisión base destino. El árbol estaba limpio al iniciar. Origen inspeccionado de solo lectura: `Proyecto_incidencias_400par`, commit `efc1bce8c29b3c88487e36e10a324c71ae9c2029`, árbol limpio. La implementación se entrega como diff local, sin commit/push del agente.

[P1 y su CI](../../openspec/changes/archive/2026-11-24-api-jest-cobertura-arquitectura/informe.md) son antecedentes; no se cuentan como ejecuciones P2. El [manifiesto de recursos](p2/recursos.json) identifica origen, destino, hash, tamaño y uso. Las [fichas renderizadas](p2/fichas-web.json) identifican viewport, escala, fuentes y capturas. Los PNG residen en `p2/capturas/`.

## Qué se portó

- Portada: cabecera oscura, acento dorado, fondo verde/crema, hero de dos columnas y la misma ilustración, bloques de canales/tarjetas y CTA del origen. Nombre y lema AyniSafe; finalidad, funcionamiento, piloto y desarrolladores siguen saliendo del contenido público versionado.
- Acceso: tarjeta centrada y degradado del origen, conectada al flujo destino con Mostrar/Ocultar, errores por campo, envío único, espera, reintento y ausencia de almacenamiento de credenciales.
- Activación: adaptación con los mismos componentes de cuenta; el origen no tiene una pantalla equivalente que respete este contrato. Se mantienen limpieza del fragmento, validación, estados de enlace y ausencia de inicio automático de sesión.
- Tokens/componentes centrales y tipografía local DM Sans/Manrope. CSP, API, modelo de sesión, rutas protegidas y Flutter no se cambiaron. El panel conserva su estructura anterior hasta P2.2; hereda los roles/tipografía centrales sin presentar su réplica como terminada.

## Comparación y diferencias intencionales

| Área | Conservado del origen | Adaptación exigida por AyniSafe |
|---|---|---|
| Cabecera/marca | Composición, fondo, acento y fuente | Nombre/lema propios; el símbolo Flutter de logo.png no se presenta como marca oficial |
| Hero | Rejilla, imagen, encuadre, formas, fuente y estados de acciones | Texto versionado y lema propio, sin copiar promesas operativas; altura resultante depende del texto aprobado |
| Canales/pasos | Contenedores, radios, colores, jerarquía y variantes responsive | Funcionamiento, piloto y desarrolladores publicados; no se inventan pasos, instituciones participantes o tarjetas de personas |
| Disponibilidad | Lenguaje visual de avisos/metadatos | Se conserva el estado real de funciones; sin contactos, cifras o datos DEMO |
| Cuenta | Tarjeta de 430 px, padding, radio 17 y degradado | Retorno, marca tipográfica, Mostrar/Ocultar y semántica destino; controles de 48 frente a los 38/46 del origen |
| Tipografía | Familias y pesos declarados; tamaño equivalente inicial | Recursos locales, rem y ausencia de síntesis para respetar ampliación y CSP |
| Contraste | Paleta de referencia | Texto de tarjeta pastel usa el rol principal; párrafos de cuenta y bordes usan roles más legibles de la misma paleta; título sobre CTA hereda texto claro |

Los contenidos y número de elementos diferentes no demuestran una desviación estética por sí solos; se compararon también rejilla, proporciones y componentes. No se afirma igualdad píxel a píxel ni que las pantallas futuras estén portadas. La comparación de activación es contra el lenguaje de cuenta, no una captura inexistente del origen.

El primer bloque CSS del origen no era su apariencia final. Se preservaron en orden sus sobrescrituras públicas de cabecera, degradados, imagen y CTA; para esta entrega sus breakpoints públicos son 900/650/600 px. Los 1050/700/600 del shell/perfil quedan para P2.2. La extracción omite estilos de mapas y operaciones futuras. Las clases centrales destino se adaptan a los selectores extraídos sin copiar clientes, roles o sesiones del donante.

## Entorno y evidencias renderizadas

Chrome headless local en Windows. Referencia servida desde copia aislada en `.cache/p2-referencia` (5175), destino Vite (5174). No se modificó el donante. Para ejecutar únicamente Welcome/Login originales se aisló su router, se resolvió react-router-dom con la API equivalente instalada y se reemplazó su importación remota de fuentes por los mismos recursos locales: cambios de preparación, no cambios de layout o contenido de esas páginas.

La matriz cubre 1440×900 y 390×844: portada con contenido versionado, pendientes, carga, desconexión, servicio no disponible, acceso y activación. También portada/acceso/activación con texto al 200 %. Son 24 capturas (4 de origen, 20 de destino). La API del ensayo visual está interceptada: usa el JSON versionado real de contenido y sesión/token de pruebas. Eso no acredita integración de backend.

Se inspeccionaron visualmente escritorio, pantalla estrecha y acceso al 200 %. La prueba automatizada revisa fuentes efectivamente cargadas, desbordes, axe en navegador (incluido contraste), teclado, Mostrar/Ocultar, limpieza del fragmento, ausencia de servicios futuros y recursos externos. Las comprobaciones de contraste de gradientes se complementaron al mirar la captura: el primer título de CTA heredaba un color oscuro y se corrigió explícitamente. No se presenta axe como validación manual de lector de pantalla.

## Verificaciones ejecutadas

| Verificación | Resultado observado |
|---|---|
| Tipos y lint web | Aprobados en la primera pasada; repetición final registrada al cerrar |
| Vitest web | 107 aprobadas en la segunda pasada; las 104 anteriores más 3 pares de contraste añadidos |
| Build + verificar:dist | Aprobados; sin URL de API, almacenamiento ni cookies en artefacto; CSP sin relajar |
| `node e2e/publica-visual.mjs` | Primera matriz corregida: 66 controles aprobados; repetición final añade control de recursos externos |
| E2E existente `node e2e/local.mjs`, Node 22 | **31/31 aprobadas**, con API y PostgreSQL aislado reales; activación, ingreso, roles, cookie, CSRF, cierre y texto 200 % en 360 px |

Las primeras pasadas no se contabilizan como éxito: se corrigieron expectativas de paleta/estructura/tabulación anteriores, el nombre accesible de marca y el contraste de la tarjeta pastel. El ensayo visual inicial interceptaba por error módulos `/src/api/`; se limitó a `/api/v1/` antes de la ejecución válida. Las aserciones de datos, seguridad y errores se conservaron.

## Matriz de pantallas P2

| Superficie | Implementación | Pruebas automatizadas | Comparación renderizada | Estado de aceptación |
|---|---|---|---|---|
| Portada, acceso, activación (web) | P2.1 | Vitest, axe, E2E visual y E2E real (sesión anterior) | Origen/destino 1440 y 390, texto 200 % | Aceptada localmente; CI pendiente |
| Panel administrador y operador (web) | P2.2 | Vitest (panel, a11y, contraste), Jest API, E2E visual y E2E real 31/31 | Origen/destino 1440/900/600/390, cuenta, avisos, texto 200 % | Aceptado localmente; CI pendiente |
| Tema y formularios de cuenta (Flutter) | P2.3 | analyze, suite 252/252, integración en Android real | Origen/destino en Samsung SM A346M (Android 16), escala 1,0 y 200 %; acceso normal, carga, error, registro y 429 | Aceptado localmente; CI pendiente |
| Navegación pública/autenticada, Inicio, Contactos, información (Flutter) | P2.4 | analyze, suite, integración y guías de accesibilidad en Android real | Origen/destino en el mismo teléfono, 1,0 y 200 % | Aceptado localmente; TalkBack manual y CI pendientes |
| Perfil y edición (Flutter) | P2.4 (composición de profile.dart) | Suite e integración | Destino en Android 1,0 y 200 %; el origen requiere su backend para mostrar el perfil (sin captura de referencia) | Aceptado localmente con esa limitación |

## P2.2 — Panel institucional

Catálogo API (`dominio/paneles.ts`): operador Inicio, Incidentes, Mapa, Indicadores, Historial; administrador Inicio, Instituciones y sedes, Operadores, Coberturas, Categorías, Reglas, Contenido y contactos, Historial. Todas con `disponible: false`. No hay endpoints nuevos; OpenAPI actualiza solo las descripciones y sigue válido. Las pruebas Jest que enumeran secciones se actualizaron y conservan las aserciones de 401/403 y rol ajeno.

Web: `MarcoInstitucional.tsx` reproduce lateral, cabecera, campana y menú de cuenta del origen; `referencia-institucional.css` la cascada efectiva. Cada destino es una ruta (`/panel/{rol}/{sección}`, Inicio en la raíz); al abrirlo se muestra su explicación pendiente sin consultar servicios. Una sección desconocida vuelve a Inicio. La campana dice «Aún no disponible», sin contador ni solicitudes. El menú de cuenta muestra nombre, correo y rol autorizados y el cierre de sesión; Escape y el clic fuera lo cierran y devuelven el foco.

Diferencias respecto del origen: marca con la inicial tipográfica en el contenedor blanco del origen (no el símbolo Flutter); título de cabecera con el panel del rol (no «Plataforma de respuesta y coordinación»); pie lateral con nombre y lema en lugar de «Piloto Ayacucho · Datos DEMO»; sin «Mi perfil» ni «Cambiar contraseña» en el menú, porque esas capacidades web no existen; destinos de AyniSafe en lugar de los del donante; línea «Aún no disponible» bajo cada destino. Conflictos de accesibilidad resueltos: texto de cabecera `#668087` y antetítulo `#188477` no alcanzan 4,5:1 y usan roles centrales; controles de 38/36 px pasan a 48; a 600 px el texto de cada destino queda para lectores en vez de `font-size: 0`; el nombre accesible de marca y cuenta incluye el texto visible.

Arnés del origen: `.cache/p2-referencia/src/MarcoReferencia.jsx` copia sin cambios el `Shell` de `App.jsx` (no exportado) y usa `AccountMenu`/`Notifications` reales con sesión y avisos vacíos interceptados. Es preparación de la referencia, no código del donante modificado.

## P2.3–P2.4 — Flutter

Tema y componentes: ver DESIGN.md. Conflictos medidos en `test/contraste_test.dart`: borde de campo del origen 1,42:1 (se usa `#6B8A92`, 3,7:1); texto blanco sobre `#209B86` 3,45:1 (el bloque destacado usa solo `#123B46 → #087C72`). El chip de cuenta del origen mide 32–36: se reproduce su aspecto con un botón de 48 y etiqueta semántica «Abrir perfil de …» / «Sin cuenta. Iniciar sesión o crear cuenta».

Navegación: `ShellCiudadano` tiene variante pública (`SesionAnonima`) y autenticada (`SesionAutenticada`), con una instancia por estado anónimo y por persona, de modo que cerrar, vencer o cambiar de cuenta descarta la pila y el estado privado. Sin sesión: Inicio público, barra Inicio/Reportar/Mapa/Contactos y Drawer con destinos públicos e ingreso; la cuenta muestra el acceso vigente (como el perfil sin sesión del origen) y se descarta al salir de ella. Con sesión: Mis reportes en el Drawer y el perfil desde la cabecera. Cada destino se construye al visitarlo y conserva su estado; el retroceso vuelve a Inicio y cierra antes el Drawer. Reportar, Mapa, Alertas y Mis reportes son pendientes, sin formularios, permisos ni consultas. Contactos y «Conoce AyniSafe» usan `ContenidoRepositorio`. Inicio usa la composición del origen con textos AyniSafe (lema, acceso a Reportar pendiente, accesos rápidos con su estado real), sin «Datos DEMO». No cambiaron permisos Android, App Links, controladores ni repositorios.

Pruebas adaptadas: las que suponían el acceso como raíz abren ahora «Mi cuenta» (`irAlAcceso`); las de la barra anterior Inicio/Mapa/Mis reportes/Alertas se reescribieron con la spec nueva y se añadieron casos de primera apertura sin cuenta, Drawer público/autenticado, acceso sin sesión ficticia, cierre de Drawer con retroceso y Reportar sin envío. Se corrigieron en código dos defectos detectados por las pruebas: desborde de la cabecera con texto al 200 % (el nombre se recorta) y un nombre accesible del control de cuenta que no anunciaba la acción.

## Verificaciones de esta sesión (24/11/2026)

| Verificación | Resultado observado |
|---|---|
| Web: lint, tipos, build, `verificar:dist` | Aprobados |
| Web: Vitest | **125/125** (incluye panel, a11y y 13 pares de contraste institucionales) |
| `node e2e/publica-visual.mjs` (repetición) | 67 comprobaciones, 24 capturas, aprobado |
| `node e2e/panel-visual.mjs` | 175 comprobaciones, 50 capturas (ambos roles, 1440/900/600/390, cuenta, avisos, historial, servicio, carga, texto 200 %, rol ajeno, sesión vencida, teclado, cierre y Atrás); axe sin violaciones; sin consultas futuras ni recursos externos |
| API: tipos, `test:tipos`, contrato OpenAPI, arquitectura | Aprobados (68 archivos, 0 infracciones) |
| API: Jest con cobertura | **461/461**, líneas 85,75 %, ramas 89,83 % |
| Flutter: `flutter analyze` | Sin problemas |
| Flutter: `flutter test` | **251/251** (línea base previa: 237) |
| E2E real `node e2e/local.mjs` (25/11/2026) | **31/31** con API y PostgreSQL aislado reales, sobre el panel P2.2: activación, acceso, cookie, restauración, rol ajeno con 403, CSRF, cierre desde el menú de cuenta y Atrás, operador con sus cinco destinos pendientes, cuenta suspendida, texto 200 %. El clúster local se reinició con `npm run db:local:start` (recuperación limpia tras un apagado no ordenado). |
| Android / TalkBack / iOS | **No ejecutados**: no hay emulador ni dispositivo configurado |

Las ejecuciones visuales usan API interceptada: no acreditan integración de backend. Las fichas están en `p2/fichas-web.json` y `p2/fichas-panel.json`.

## Evidencia Android (25/11/2026)

Dispositivo: Samsung SM A346M, Android 16 (API 36), 1080×2340, densidad 450, conectado por USB con `adb reverse` a la API local (puerto 3000) y su PostgreSQL de desarrollo. El 200 % se aplica con el factor de texto de Flutter en la prueba; el sistema del teléfono quedó en su valor (0,9). iOS no se probó.

| Verificación en el teléfono | Resultado |
|---|---|
| `integration_test/acceso_test.dart` + `almacen_test.dart` (API y BD reales) | 2/2. Se actualizó a la navegación pública y se corrigió una aserción obsoleta desde `16f87c5` (esperaba el correo en Inicio; ahora se comprueba en el perfil) |
| `integration_test/perdida_respuesta_test.dart` vía proxy que descarta la respuesta del alta | 1/1; el proxy registró «alta 201 … respuesta descartada»: la app no afirmó éxito ni duplicó la cuenta. El proxy es de preparación (no está en el repositorio) |
| `integration_test/accesibilidad_p2_test.dart` (guías de Flutter: objetivos de 48, etiquetas, contraste) | 1/1 en Inicio, Reportar, Contactos, Drawer y Acceso. En el Drawer la guía de contraste informó 3,60:1 para la fila seleccionada aunque se cambiara el color del texto; los píxeles de la captura miden #086C63 sobre #D8F3EB = 5,38:1, igual que el origen. Se registra como limitación de la guía, no como defecto |
| `flutter drive … capturas_p2_test.dart` | 31 capturas `movil-destino-*` (pública y con cuenta, 1,0 y 200 %, carga, error y 429 de altas) |
| Referencia `.cache/p2-referencia-movil` (copia del donante, URL de API local inexistente) | 12 capturas `movil-origen-*`; Reportar y Mapa no se capturan porque piden ubicación o mosaicos externos; el perfil con sesión no tiene referencia sin el backend del donante |
| TalkBack | **Pendiente**: requiere revisión manual con el lector activado; no se declara realizada |

Defectos encontrados y corregidos al comparar: el lema de Inicio se recortaba con texto al 200 % (también en el origen; ahora se ajusta en varias líneas, con prueba nueva), el botón Mostrar/Ocultar agrandaba el campo de contraseña (pasa a la posición `suffixIcon` del origen), el control de cuenta usaba un color de texto más claro que el chip original y la barra usaba iconos rellenos al seleccionar (el origen no). El indicador de carga del botón principal pasa a un color visible sobre el botón deshabilitado. La cruz rosa en `movil-destino-publico-acceso-carga.png` es el indicador de toques del binding de prueba.

Diferencias de contenido autorizadas: textos AyniSafe en lugar de «Juntos cuidamos Ayacucho», «Tu comunidad, más segura» y promesas de reporte sin cuenta; etiqueta de campo persistente; «Mostrar/Ocultar» en texto; enlaces a recuperación, privacidad y contactos en el acceso; destinos pendientes en lugar de pantallas operativas.

Datos creados: cuentas ciudadanas de prueba `capturas.*@ejemplo.com`, `integracion.*@ejemplo.com` y `limite.p2.check@ejemplo.com` en la base de desarrollo local. Una ejecución agotó el límite de 5 altas por IP y la app mostró el aviso 429 (captura conservada).

## Validación integrada P2.5 (25/11/2026)

| Componente | Resultado |
|---|---|
| API: typecheck, `test:tipos`, build, contrato OpenAPI, arquitectura | Aprobados (68 archivos, 0 infracciones) |
| API: Jest con cobertura | 461/461; líneas 85,75 %, ramas 89,84 %, funciones 92,56 % |
| Web: lint, tipos, build, `verificar:dist` | Aprobados |
| Web: Vitest | 125/125 |
| Web: ensayos visuales | portada 67 comprobaciones/24 capturas; panel 175/50 |
| Web: E2E real `E2E_PUERTO_WEB=5180 node e2e/local.mjs` | 31/31. La primera ejecución del día falló en la activación («enlace ya usado o reemplazado») y la repetición pasó: fallo intermitente sin causa confirmada |
| Flutter: analyze y suite | Sin problemas; 252/252 (antes del último cambio de color del indicador de carga, que solo compila verificado con analyze) |
| Flutter: integración en Android | 5 pruebas en 4 archivos aprobadas (arriba) |
| OpenSpec | `openspec validate replica-visual-web-movil --strict`: válido |

Ninguna adaptación de UI eliminó aserciones de seguridad: las pruebas cambiadas reubican pasos (abrir la cuenta desde la navegación pública) o sustituyen la barra anterior por la de la spec. La aprobación remota (CI) no se acredita con estas ejecuciones locales.

## CI remoto (tarea 6.3)

Rama `feat/p2-replica-visual`, PR [#1](https://github.com/julianvega27-ctrl/AyniSafe-App/pull/1), revisión `727586383b96a9033d436b0f4300690e1ae83508`. Ejecución [45692915913](https://github.com/julianvega27-ctrl/AyniSafe-App/actions/runs/45692915913): escaneo de secretos, Flutter (análisis y pruebas), web (lint, tipos, compilación y pruebas) y API (tipos, arquitectura, contrato y Jest con cobertura) **aprobados**. Relación: spec `d678217` → commits `0cdcf85` (web y API), `4eed6c6` (móvil), `7275863` (evidencia) → pruebas y capturas de este informe. El commit que agrega esta sección solo cambia documentación y vuelve a ejecutar el CI en el PR. TalkBack sigue pendiente de revisión manual.

## Límites y siguiente incremento

P2.1 no altera API ni Flutter; no se repiten sus suites completas como si fueran cambios nuevos. El E2E sí usa la API real. TalkBack/iOS no se validan por capturas web. No se desplegó ni ejecutó GitHub Actions para este diff local. La aceptación completa de P2 y su CI corresponde al incremento final. Los resultados locales y capturas no se presentan como aprobación remota o validación operativa del sistema de incidentes.

Incrementos sugeridos al registrar: `feat(web): reproducir portada acceso y componentes del origen` (P2.1), `feat(web): reproducir panel institucional por rol` (P2.2, con catálogo API/OpenAPI y pruebas), `feat(movil): reproducir tema y formularios de cuenta` y `feat(movil): integrar navegacion publica y privada de referencia`. Pendientes antes de aceptar P2: revisión manual con TalkBack y la ejecución de CI sobre la revisión publicada (tarea 6.3).
