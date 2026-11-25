---
name: AyniSafe
description: Réplica visual del proyecto de incidencias de referencia, adaptada a las reglas de AyniSafe.
---

# Design System: AyniSafe

Actualizado: 24 de noviembre de 2026.

Estado: **dirección elegida; P2.1 (portada, acceso, activación) y P2.2 (panel institucional) implementados y comparados en web; tema, formularios y navegación Flutter implementados y comparados en Android real (Samsung, Android 16); TalkBack y CI pendientes**. La petición «Todo debe ser igual a UI del otro proyecto, luego veremos mejoras» sustituye la exploración visual anterior. No abrir otra ronda de estilos ni mezclarla con las maquetas de `.impeccable/mocks/`. La [evidencia P2](docs/validacion/p2-replica-visual.md) distingue pruebas funcionales, comparación renderizada y límites; no se declara igualdad de todo el sistema.

## Overview

La web y la app móvil reproducen la apariencia de sus respectivas superficies en `Proyecto_incidencias_400par`: composición, colores, tipografía, densidad, espacios, bordes, radios, iconos, imágenes, tablas, formularios y estados de interacción. La UI móvil de referencia y la web tienen sus propias variantes; no homogeneizarlas inventando una tercera estética.

Referencia de origen: `D:\UNSCH\2026-II\Arquitectura de Software\Proyectos\Proyecto_incidencias_400par`, commit `efc1bce8c29b3c88487e36e10a324c71ae9c2029`. La captura de la bandeja aportada por el responsable es evidencia visual complementaria. El repositorio fija la referencia completa; una captura aislada no define el resto de pantallas ni el comportamiento del producto.

Fuentes web: `apps/admin/src/App.jsx`, `style.css`, `ui.jsx`, `PriorityBadge.jsx`, páginas y componentes de cuenta/notificaciones; recursos en `apps/admin/public/`. Fuentes móviles: `apps/mobile/lib/app.dart` y `screens/`. No modificar el origen al extraer.

**Límites:** se conservan el nombre AyniSafe, el lema y las decisiones funcionales de los documentos 03/09/11. El aspecto idéntico no importa roles extra, recepción telefónica, siete estados, acceso sanitario ampliado ni datos DEMO. Los controles nuevos requeridos por AyniSafe usan el mismo lenguaje visual de su superficie de referencia. Los textos de estados/prioridad siguen el vocabulario aprobado, dentro de las mismas formas de etiqueta.

Este archivo es la autoridad documental visual. La guía UI describe rutas y flujos; PRODUCT.md resume producto y marca; OpenSpec concreta comportamiento y adaptación técnica. Las observaciones siguientes son extracción del código de origen, no resultados de una revisión renderizada ni una tabla completa de todos sus estilos.

## Colors

Preservar los colores por componente y superficie del origen. Valores observados:

| Uso | Web | Móvil |
|---|---|---|
| Fondo general | `#F4F7F7` | `#EFF6F7` |
| Superficie | Blanco | Blanco |
| Texto/identidad estructural | Texto `#203843`, barra lateral `#133941` | Cabecera `#123B46` |
| Acción/acento | Enlace `#0E7774`, marca `#177571` | Principal `#086C63`, semilla `#087C72` |
| Selección | Navegación `#25525A`, marca activa `#7AD8AB` | Indicador `#C5EFE4`, fila seleccionada `#D8F3EB` |
| Borde de contenedor | `#E3EBEC` | `#DCE9ED` |

Insignias web de prioridad: Normal texto/fondo/borde `#1E40AF / #EFF6FF / #BFDBFE`; Alta `#92400E / #FFFBEB / #FCD34D`; roja del origen `#991B1B / #FEF2F2 / #F87171`; gris `#475569 / #F1F5F9 / #CBD5E1`. Conservar el estilo azul/ámbar/rojo/gris. En AyniSafe, la roja se llama Urgente y la gris Sin evaluar; Baja y Sin evaluar no son equivalentes de negocio. Alta y Urgente conservan símbolo de alerta. El origen de la propuesta/revisión se informa con el mismo estilo de metadatos existente.

La tabla anterior recoge valores base. En las superficies públicas prevalecen las sobrescrituras finales de `style.css`, ya portadas en P2.1: fondo radial verde/crema, cabecera `#143F40` con divisor `#E3B562`, marca clara `#F2F8ED`, acción de cabecera dorada `#E8BC72` y texto `#203D35`; CTA inferior degradado `#174C47 → #226858` con botón `#F0C583`; pie `#153F3B`. Mantener esa cascada: no volver a los valores iniciales al modificar una pantalla pública. Se reutilizan roles centrales de texto para contrastes AA; las diferencias medidas quedan en la evidencia, no son otra paleta propuesta.

La tabla de prioridades por categoría es política del documento 11, no una decisión visual. Conservar FIFO; el color no ordena la bandeja.

## Typography

Web: DM Sans para cuerpo y controles, Manrope para títulos, con los pesos y métricas del origen. La hoja de origen las importa desde Google Fonts; para reproducirlas en destino, preparar recursos locales equivalentes y ajustar la carga conforme a la política de recursos, sin sustituir las familias por otra elección estética.

P2.1 sirve ambas familias desde `apps/web/public/fuentes/` con sus licencias OFL: DM Sans 400–700 y Manrope 400–800, sin síntesis artificial. Sus archivos variables conservan las familias y pesos declarados por la referencia. Las métricas textuales portadas se expresan en rem con equivalencia inicial a 16 px para permitir ampliación; controles de al menos 48 y bordes/estados accesibles conservan el contrato destino.

Móvil: conservar la tipografía Material/plataforma usada por ThemeData del origen, sin inyectar las familias web.

Valores web observados: título principal 2rem, interlineado 1.18 y tracking -.035em; título secundario 1.12rem; tabla 12px; encabezados de tabla 10px, mayúsculas, tracking .08em; botones 12px/700; insignias 12px/700. Son mediciones del CSS, no permiso para reducir el texto del dispositivo. Extraer también las sobrescrituras por pantalla y breakpoint antes de implementar: prevalece el estilo efectivamente aplicado.

## Layout

Web: replicar `app-shell`, sidebar, topbar y área de trabajo del origen. Valores base observados: lateral 248px, cabecera 72px, contenido con máximo 1540px y padding 34px 38px 60px; conservar las variaciones responsive de la hoja, sin reemplazarlas por breakpoints inventados. Portada y acceso replican sus páginas equivalentes, no el marco mínimo actual de AyniSafe.

Tablas: misma anatomía de columnas, encabezado claro, divisores, altura de filas, metadatos e insignias de la referencia, adaptando datos y acciones a permisos reales. El estado y la verificación se muestran separados.

Móvil: reproducir AppBar con acceso a perfil, Drawer y barra inferior del origen. Barra inferior: Inicio, Reportar, Mapa y Contactos; Alertas, información, Perfil y Mis reportes mediante el menú según sesión. Para el código secreto de invitado y flujos de cuenta usar componentes del origen, sin conceder historial privado a quien no tiene cuenta. Esta elección sustituye la barra anterior Inicio/Mapa/Mis reportes/Alertas; no elimina esas capacidades, cambia su ubicación.

## Elevation & Depth

Conservar elevación y gradientes donde existen en el origen. Web: panel base con sombra `0 5px 22px rgba(24,59,67,.035)`; menús/notificaciones mantienen sus sombras y niveles propios. Móvil: tarjetas blancas con elevación cero y Drawer con cabecera degradada de `#123B46` a `#087C72`. No eliminar sombras o gradientes por una preferencia nueva.

## Shapes

Web: panel base radio 14px; botón base 9px; insignia de prioridad 7px con borde de 1px, roja 2px; conservar las variantes de cada componente. Móvil: tarjetas radio 22px, campos y botones radio 16px; botón principal mínimo 52 de alto. No imponer el radio 12 anterior de AyniSafe a la referencia.

## Components

Reutilizar o adaptar los componentes del origen manteniendo apariencia e interacción, con implementación TypeScript en web y Flutter en móvil. Extraer CSS y estados efectivos, no solo los valores base de este resumen.

- Marco, navegación y cuenta: App/Shell, AccountMenu y Notifications del origen.
- Contenedores, campos, mensajes y vacíos: ui.jsx y sus estilos; mismos alineamientos, márgenes y feedback.
- Bandeja y detalle: páginas Incidents, filtros, tabla e insignias; cuatro estados y resultados de cierre de AyniSafe.
- Formulario ciudadano: report.dart, con punto obligatorio, teléfono obligatorio solo para invitado y evaluación de una persona principal.
- Contraseña y sesión: conservar apariencia de los controles, conectados a Identidad destino; no importar JWT/refresh ni reglas de acceso ajenas.
- Historial, resumen, mapa, perfil, alertas y directorio: sus equivalentes del origen, mostrando solo capacidades y datos reales autorizados.
- Recursos: inventariar logo.png, community-hero.png e iconos; adaptar el nombre a AyniSafe y revisar los recursos antes de distribuir. No afirmar que un logotipo de origen ya es una marca oficial de AyniSafe.

El estilo de mensajes, carga, error, vacío, hover, foco, pulsación y deshabilitado también forma parte de la réplica. Si el origen no tiene un flujo necesario, extender sus componentes; no iniciar una dirección gráfica nueva.

Implementación web P2.1: `src/estilos.css` y `src/diseno/colores.ts` mantienen los roles centrales; `src/diseno/referencia-publica.css` conserva la cascada pública extraída, y `adaptacion-publica.css` conecta los componentes destino y sus requisitos accesibles. No introducir variantes de pantalla fuera de esos puntos centrales. Portada usa contenido versionado; acceso y activación conservan sus controles y estados. La ilustración es una copia del origen; su `logo.png` es el símbolo Flutter y no se adoptó como logotipo de AyniSafe. Se conserva el nombre tipográfico, sin inventar otro símbolo oficial.

Implementación web P2.2: `src/diseno/referencia-institucional.css` contiene la cascada efectiva de `.app-shell`, `.sidebar`, `.topbar`, cuenta, avisos y `.panel` del origen, con sus sobrescrituras finales a 900/700/600 px; `componentes/MarcoInstitucional.tsx` reproduce Shell, AccountMenu y Notifications. Adaptaciones registradas: contenedor de marca blanco con la inicial tipográfica (no el símbolo Flutter), «Aún no disponible» en cada destino del lateral, campana sin contador ni consultas, menú de cuenta con identidad y cierre (sin perfil web), pie lateral con nombre y lema (sin «Datos DEMO»), objetivos de 48 y texto de cabecera/antetítulo en roles centrales por contraste AA.

Implementación móvil P2.3–P2.4: `presentacion/tema.dart` porta el ThemeData del origen (semilla `#087C72`, principal `#086C63`, secundario `#365CC9`, fondo/AppBar `#EFF6F7`/`#123B46`, tarjetas radio 22 y borde `#DCE9ED`, campos y botones radio 16, FilledButton 52, NavigationBar con indicador `#C5EFE4`, ListTile seleccionado `#D8F3EB`). `componentes/tarjeta_mensaje.dart` porta MessageCard/ScreenPadding; `navegacion/shell_ciudadano.dart` porta CitizenShell (AppBar con control de cuenta, Drawer con cabecera degradada y barra Inicio/Reportar/Mapa/Contactos). Adaptaciones medidas: borde de campo `#6B8A92` (el `#C8DCE1` del origen da 1,42:1), degradado del bloque «Reportar» sin el tercer tono `#209B86` bajo texto blanco, cuerpo de 16, etiqueta de campo persistente, control de cuenta de 48 de alto con el aspecto del chip y roles de mensaje con color semántico en el icono. Perfil con la composición de `profile.dart` («Mi perfil», tarjetas con icono, salida con OutlinedButton). El lema de Inicio usa el aspecto del Chip del origen pero ajusta el texto en varias líneas (el Chip recorta con texto ampliado); el botón Mostrar/Ocultar ocupa la posición `suffixIcon`.

## Do's and Don'ts

- Reproducir la referencia, sin ofrecer mejoras visuales en esta primera integración.
- Comparar capturas origen/destino con igual viewport, escala, tipografía cargada y estado; documentar diferencias de contenido funcional y separar esas diferencias de desviaciones visuales.
- Verificar web, móvil y las superficies públicas, no solo la tabla de la captura. La fidelidad se comprueba al renderizar; esta documentación no demuestra igualdad ya alcanzada.
- Conservar las reglas de permisos, privacidad, estados y disponibilidad de AyniSafe. No importar datos ficticios, secretos ni roles extra para que una captura parezca completa.
- Mantener accesibilidad funcional, foco, etiquetas, escalado y movimiento reducido. Registrar problemas observados de contraste o tamaño; no introducir silenciosamente un rediseño ni declarar accesibilidad validada por copiar CSS.
- Centralizar los estilos extraídos y sus adaptadores sin crear otro documento global de diseño. Al terminar la reproducción, actualizar este inventario a los tokens/componentes realmente implementados.
