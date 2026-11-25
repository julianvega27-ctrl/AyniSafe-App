# Design

## Context

Ver proposal.md para motivación y alcance. Fecha: 24/11/2026. Origen leído sin cambios: `D:\UNSCH\2026-II\Arquitectura de Software\Proyectos\Proyecto_incidencias_400par`, HEAD `efc1bce8c29b3c88487e36e10a324c71ae9c2029`, árbol limpio. Destino con P1 archivado, 461 pruebas API y CI aprobado en `95d1316`; estas son evidencias previas, no resultados de P2.

Hallazgos de código: web destino React/TypeScript usa `App.tsx`, `paginas/{Portada,Acceso,Activar,Panel}.tsx`, `componentes/`, `estilos.css` y `diseno/colores.ts`; mantiene cookie institucional/mismo origen. Flutter separa `aplicacion/`, `datos/` y `presentacion/`; `app.dart` envía SesionAnonima al acceso y su shell actual requiere SesionAutenticada. El catálogo API `dominio/paneles.ts` todavía ofrece Reportes/Mapa/Indicadores al operador y seis destinos al administrador, todos no disponibles.

El origen web usa JSX, sesiones distintas y CSS acumulativo: al final de `style.css` hay sobrescrituras que sustituyen los breakpoints iniciales. Su acceso no contiene todos los controles de AyniSafe (por ejemplo Mostrar/Ocultar y activación). Su app Flutter ya tiene navegación pública, Drawer y cuatro destinos inferiores; sus repositorios de reportes no pertenecen a P2. La inspección de archivos y del logo no constituye revisión renderizada de las pantallas.

## Goals / Non-Goals

**Goals:** trasladar presentación con componentes propios de cada tecnología; mantener conectadas las capacidades existentes; resolver las contradicciones concretas entre specs antiguas y acuerdos; producir evidencia visual y funcional por incremento.

**Non-Goals:** importar clientes/sesiones del donante, sustituir PostgreSQL, cambiar Clean Architecture, habilitar incidentes o notificaciones, agregar endpoints privados nuevos o inventar identidad gráfica. No se reescriben archivos de cambios archivados.

## Decisions

### 1. Extraer presentación, conservar contratos

Portar JSX a componentes TypeScript y el tema/widgets Flutter a `presentacion/`, conservando clientes, controladores y repositorios destino. No copiar el App completo: el origen mezcla rutas, roles y composición con funciones posteriores. El router web conserva `/`, `/acceso`, `/activar` y `/panel/{administrador,operador}`; la raíz sigue siendo pública incluso con sesión. La activación web usa el estilo de tarjeta de acceso, manteniendo token en memoria, limpieza del fragmento y ausencia de auto-login.

No se cambian contratos de autenticación: cookie institucional HttpOnly, Bearer ciudadano, permisos, validaciones de contraseña, Origin/CSRF, contenido público y errores siguen vigentes. Los controles faltantes en el origen se componen con sus mismos campos, botones y avisos; no se eliminan para lograr parecido.

### 2. Correspondencia de superficies e incrementos

| Origen leído | Destino previsto | Entrega P2 |
|---|---|---|
| `admin/src/style.css`, `ui.jsx` | `web/src/estilos.css`, `diseno/`, `componentes/` | Tokens y piezas centrales con cascada efectiva; no CSS de mapas/operaciones desconectadas |
| `pages/Welcome.jsx`, `Login.jsx` | `paginas/Portada.tsx`, `Acceso.tsx`, `Activar.tsx` | Composición equivalente con contenido público real y flujos vigentes |
| `App.jsx`, `AccountMenu.jsx`, `Notifications.jsx` | Router/marco, panel por rol y cuenta | Lateral/cabecera/cuenta; campana e Historial pendientes, sin consulta ficticia |
| `mobile/lib/app.dart`, `screens/common.dart` | `presentacion/tema.dart`, `componentes/`, shell | Tema, navegación y componentes propios Flutter |
| `screens/home.dart`, `directory.dart`, `presentation.dart`, `profile.dart` | Inicio, contenido/contactos, perfil/edición | Composición con datos reales, adaptada a capacidades existentes |
| Formularios de cuenta móvil del origen | Acceso, registro, recuperación, código y nueva contraseña destino | Mismo lenguaje visual; se preserva la seguridad y validación destino |
| Incidents/MapView/History, report/map/mine/alerts | Futuras fases | Solo entradas pendientes en P2; ni tablas llenas, mapas operativos ni reportes simulados |

La navegación web agrega a metadatos del catálogo los destinos de la guía elegida, manteniendo `disponible: false`; Inicio es un estado de resumen pendiente, no un dashboard de métricas. Si cambia el catálogo, actualizar sus ejemplos OpenAPI y aserciones que enumeran secciones, conservando contrato de autorización. Perfil web no se inventa: el menú muestra identidad y salida; la edición institucional del origen no se presenta como operativa.

### 3. Navegación móvil pública y privada separada

La composición selecciona shell público para SesionAnonima y variante autenticada para SesionAutenticada. No se agrega un rol invitado ni token anónimo. Barra común: Inicio, Reportar, Mapa, Contactos. Drawer ofrece públicos e información; Mis reportes requiere sesión, Alertas queda pendiente. El control de cuenta ofrece acceso/registro sin sesión y perfil con sesión. Los errores al restaurar no convierten una sesión no verificable en una autenticada ni muestran el perfil guardado.

Mantener IndexedStack o conservación equivalente de destinos dentro de una misma sesión; descartar estado privado cuando cambie usuario o termine sesión. Volver a Inicio al retroceder desde otro destino, cerrar primero Drawer/modales y respetar el flujo de enlaces entrantes. Cierre vuelve a Inicio público con aviso y sin pila privada. La limpieza segura de almacenamiento existente conserva su estado de fallo y reintento. No se transforma un timeout de logout en confirmación remota.

Contactos públicos usan `ContenidoRepositorio` y el marcador inyectado existentes, sin teléfonos inventados. Acceso, registro y recuperación siguen accesibles; punto, teléfono de invitado, envío y código secreto de seguimiento quedan para P4. El permiso INTERNET y las consultas tel/App Links no se amplían para una réplica visual.

### 4. Recursos y autoridad visual

DESIGN.md es la autoridad, no este archivo: se documentan allí los estilos realmente portados al implementarlos, sin volver a proponer identidad. PRODUCT.md y guía UI solo se corrigen para retirar resúmenes obsoletos (identidad única sin variantes, tabla aún por elegir, referencia al sistema anterior) frente a los acuerdos ya aprobados.

Web debe servir DM Sans y Manrope localmente con los pesos efectivamente usados, su procedencia y licencia de distribución registradas; no sustituirlas ni habilitar Google Fonts en CSP. El manifiesto de recursos identifica ruta origen/destino, hash, uso, adaptación y estado. `logo.png` fue inspeccionado: contiene el símbolo Flutter; no se adopta como marca oficial. Se conserva el espacio/composición de marca con el nombre AyniSafe y sin crear un nuevo símbolo; esa adaptación se documenta. `community-hero.png` se revisa y porta como recurso ilustrativo de referencia, con texto alternativo pertinente. No usar imagen generada o fotografía distinta para cambiar la dirección.

Se extrae la cascada efectiva completa de las superficies incluidas, no el primer bloque CSS: al final hay variantes a 1050/700/600 px que prevalecen sobre reglas anteriores. Las pruebas de colores y fuentes antiguas se migran a pares realmente usados; no se eliminan para esconder fallos. Un conflicto medido con tamaño mínimo/contraste/foco requiere resolución explícita y registro antes de declarar aceptación visual; no se presupone que copiar cumple accesibilidad.

### 5. Validación y criterios de aceptación

La evidencia de implementación vivirá en `docs/validacion/p2-replica-visual.md`, manifiesto y capturas bajo `docs/validacion/p2/`; no se crean reportes con resultados imaginados durante esta planificación.

| Superficie | Estados mínimos | Comparación prevista |
|---|---|---|
| Web pública | contenido listo, pendiente, carga, fallo/reintento; acceso y activación | 1440×900 y 390×844; marcos también 900 y 600 px para cascada responsive |
| Panel de ambos roles | restauración, sección pendiente, error, cuenta abierta, campana pendiente, sesión vencida | mismos viewports; origen con su rol equivalente solo como referencia visual |
| Flutter | Inicio público/autenticado, Drawer, cuatro destinos, contactos, cuenta y perfil | mismo emulador Android, resolución lógica y escala 1,0; repetir destino al 200 % |
| Formularios móviles | acceso/registro, recuperación/código, activación/nueva contraseña, errores y carga | pantalla equivalente o composición de componentes del origen, declarando los flujos sin equivalente directo |

Registrar por ficha revisión, pantalla/estado, tamaño, densidad/escala, fuentes y ruta de ambas capturas; comparar estructura, tipografía, espaciado, formas, color y estados. Los nombres, textos públicos, lista de destinos por rol y vacíos exigidos se registran como diferencias funcionales; una geometría no revisada no se disfraza de diferencia de negocio. No se fija un porcentaje de igualdad sin fundamento ni se acepta un pixel diff como prueba suficiente. Datos de fixtures aislados se permiten para comparar en pruebas, identificados como tales, nunca como operación publicada.

Web: lint, tipos, build, `verificar:dist`, Vitest, axe y E2E existentes; teclado/foco/Escape, menús, zoom 200 %, ancho estrecho y red en navegador real. Flutter: analyze y suite completa; pruebas de widgets/semántica, texto 200 %, navegación pública/privada, enlaces entrantes y verificación renderizada en Android. La revisión manual TalkBack se registra separadamente; iOS no se declara probado por pasar Android. API: si cambia el catálogo, Jest/cobertura, tipos, build, OpenAPI y arquitectura; la validación integrada final conserva los controles de P1 y CI. No repetir ensayos sin cambios nuevos que lo justifiquen.

## Risks / Trade-offs

- Apariencia del origen basada en contenido DEMO → conservar composición y usar vacíos/datos reales; no publicar pantallas ficticias para llenar espacio.
- Logo Flutter y fuentes remotas → adaptación de marca explícita, recursos locales e inventario, sin otra identidad inventada.
- CSS con sobrescrituras y tamaños inferiores al objetivo accesible → extraer estilos efectivos y medir; registrar conflictos concretos, sin prometer identidad exacta todavía.
- Invitado confundido con cuenta → variantes de shell, guards privados y pruebas de revocación/cambio de persona, sin sesión falsa.
- Catálogo API insuficiente → cambios de metadatos limitados y probados; no habilitar servicios futuros ni controles de atención para administrador.
- Captura no disponible de un estado → queda pendiente su aceptación, sin sustituirla por una prueba con dobles ni una imagen del origen.

## Migration Plan

1. Registrar proposal/specs/design/tasks en un commit previo. Al aplicar, identificar ese hash y verificar referencia donante; no generar una historia retrospectiva.
2. P2.1: recursos/componentes centrales + portada/acceso/activación web, con sus pruebas. Registrar diferencias visuales y controles de seguridad.
3. P2.2: shell por rol, metadatos y estados honestos, con pruebas API/web y capturas.
4. P2.3: tema/componentes Flutter y formularios de cuenta existentes, con pruebas; aún conservar entrada actual hasta el incremento de navegación.
5. P2.4: shell público/autenticado y navegación nueva, Inicio/contactos/perfil, con regresión completa y evidencia Android.
6. P2.5: validar coherencia documental, comparaciones y CI sobre el commit final. Sincronizar y archivar solo tras solicitud y aceptación.

Cada incremento incluye código y pruebas; no separar fixtures requeridos de su UI. Si un incremento no queda consistente, terminarlo antes de commitear. Rollback mediante reversión del incremento completo y su documentación, sin alterar historial previo; los recursos de origen no se modifican.
