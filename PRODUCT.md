# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

La plataforma registrada es `web` para las herramientas de diseño. El panel y la portada usan React + TypeScript; la app ciudadana usa Flutter (Android primero, iPhone después). La dirección elegida reproduce cada superficie de `Proyecto_incidencias_400par`: web con DM Sans/Manrope y móvil con su tema Material propio. Comparten identidad de producto y roles de interacción, sin imponer una tercera estética ni componentes de una tecnología a la otra. DESIGN.md es la autoridad visual.

## Users

- **Ciudadano** (app móvil): vecino del área metropolitana de Ayacucho que reporta un incidente o consulta el mapa, las alertas y los contactos. Situación real: en la calle, con prisa o tensión, con una mano, a pleno sol, en teléfonos Android de gama media o baja y con conexión inestable. Trabajo: contar lo ocurrido en pocos toques, saber qué pasó con su reporte y no exponerse más de lo necesario.
- **Operador** (web): personal autorizado de una sede de PNP, Bomberos, SAMU o Serenazgo. Situación: oficina, monitor de escritorio, turnos largos. Trabajo: revisar reportes en orden de llegada, asumir el caso, clasificar, derivar y registrar actuaciones con trazabilidad.
- **Administrador** (web): crea instituciones, sedes, operadores, coberturas, reglas y contenido público. Trabajo: que la configuración esté completa y que ningún reporte quede sin destino.
- **Visitante** (web): quien abre la portada sin sesión para entender qué es AyniSafe. No es un cuarto rol.
- **Evaluación académica** (audiencia secundaria confirmada): el proyecto se presenta y se evalúa como entregable del curso de Arquitectura de Software (UNSCH); la interfaz debe sostener esa lectura sin simular operación real.

Solo existen tres roles: ciudadano, administrador y operador.

Decisiones de integración del 23 de noviembre de 2026: se permite informar como invitado o con cuenta; invitado no es un cuarto rol y consulta estado y resumen ciudadano mediante código secreto, sin vinculación posterior a cuenta. El administrador sigue siendo global y no obtiene permisos de atención; el operador asume inicialmente el caso y el administrador puede reasignar con motivo. Cada envío crea un incidente y conserva originales; etapas Registrado, En revisión, En atención y Cerrado, con verificación separada y cierre distinguido como Atendido o Descartado. Los duplicados se vinculan a un principal preservando cada envío y su seguimiento. La categoría propone prioridad inicial que el operador confirma o corrige, manteniendo FIFO; la tabla por categoría fue aprobada en el documento 11. Son cambios acordados, todavía no implementados; reglas completas en el documento 11.

## Product Purpose

AyniSafe fortalece la seguridad ciudadana y la atención de emergencias en el área metropolitana de Ayacucho mediante el reporte georreferenciado de incidentes, alertas preventivas y la colaboración de la comunidad con operadores institucionales. Un ciudadano reporta; un operador revisa, valida y da seguimiento; el ciudadano ve el estado de su reporte. Éxito: un reporte llega al operador correcto sin que el ciudadano tenga que entender la estructura institucional, y nadie cree que AyniSafe despacha ayuda cuando no lo hace.

## Positioning

La prioridad inicial usa la tabla de 16 categorías aprobada el 23/11/2026 en el documento 11, como configuración versionada, sin edición libre de esa tabla en panel. El operador competente puede confirmar, elevar o reducir la prioridad de cada caso con motivo e historial, manteniendo FIFO. La implementación sigue pendiente. La evaluación sanitaria describe una persona principal, conservando cantidad total de heridos como dato separado.

AyniSafe no es una central de emergencias ni sustituye al 105 u otros servicios: es un canal ciudadano con **revisión humana y trazabilidad** (el ciudadano propone categoría, el operador confirma o corrige; la categoría propone prioridad y el operador la revisa; bandeja por llegada). Su catálogo de cuatro instituciones, enrutamiento distrital y regla de no prometer despacho delimitan el producto.

## Operating Context

- Piloto de cinco distritos: Ayacucho, San Juan Bautista, Carmen Alto, Jesús Nazareno y Andrés Avelino Cáceres Dorregaray; trece sedes candidatas que **no acreditan operación real**.
- Infraestructura de USD 0 (Vercel, Render, Neon): puede suspenderse y tardar en arrancar; no se promete alta disponibilidad ni tiempo real.
- Idioma: **solo español** (confirmado); «Ayni» es el nombre, sin requisito cultural adicional.
- Documentos de referencia: `docs/01-analisis-del-sistema/` para reglas de negocio, `DESIGN.md` como autoridad visual, `docs/05-diseno-ui/guia-ui.md` para flujos y navegación, `openspec/specs/` para capacidades sincronizadas. Este archivo resume producto y usuarios; no mantiene un sistema de estilo paralelo.

## Capabilities and Constraints

Alcance de integración elegido el 23/11/2026: web con Leaflet, inicio/resumen por rol, historial de auditoría permitido y campana. Ingreso de incidentes solo desde la app, como invitado o con cuenta; sin recepción telefónica. Son capacidades pendientes de implementación y validación. Flutter conserva su propuesta cartográfica vigente.

- Flutter (Android primero; iPhone con validación y presupuesto aparte), React + TypeScript para la web, API REST (Express) y PostgreSQL.
- Hoy existen y están probados: registro y acceso ciudadano, recuperación y activación por correo, perfil, contenido público versionado, navegación móvil (con destinos «Aún no disponible»), portada web, acceso institucional y panel mínimo por rol (secciones «Aún no disponible»).
- Aún **no** existen: reportes, mapa, alertas, evaluación rápida SAMU, bandejas, alta de operadores y sedes. Las pantallas no deben simular que existen (sin datos, mapas ni cifras de ejemplo).
- Términos vigentes: 16 categorías; prioridades Sin evaluar (gris/reloj), Normal (azul/información), Alta (ámbar/alerta) y Urgente (rojo/alarma), con texto + icono + color y origen propuesto/revisado distinguible. Incidente único con estados REGISTRADO, EN_REVISION, EN_ATENCION y CERRADO; verificación separada, según documento 11.
- Reglas de producto con impacto visual: evaluación SAMU con botones y «No sé» visible, sin preselección; mapa público con zonas aproximadas, sin descripciones, fotos ni datos personales. Punto obligatorio para enviar, mediante GPS autorizado o selección manual; conservar formulario si no se puede elegirlo. Teléfono obligatorio para invitado y opcional en perfil con cuenta, con uso restringido y explicado. Se conserva PostgreSQL. Los contactos de emergencia solo se publican con fuente y fecha verificadas; hoy ninguno está aprobado.
- Dirección visual elegida el 23/11/2026: reproducir íntegramente apariencia web/móvil del proyecto de origen, sin mejoras durante la integración; referencia y extracción en DESIGN.md. Web conserva DM Sans/Manrope y móvil su tema Material de origen. Recursos y adaptación del nombre AyniSafe se concretan al portar; fidelidad renderizada y accesibilidad aún no verificadas.

## Brand Commitments

- Nombre **«AyniSafe»**, tal cual está escrito (confirmado como intocable).
- Lema **«Cuidarnos es tarea de todos»** (confirmado como intocable).
- La paleta anterior azul/verde de AyniSafe se sustituirá por la apariencia de las superficies del origen, según DESIGN.md. La dirección ya fue elegida; no proponer otra paleta durante esta integración.
- No existe logotipo ni otros recursos de marca.
- La alternativa visual «comunitaria» con motivos geométricos fue descartada en una exploración anterior (ver `DESIGN.md`); reabrirla es una decisión explícita.

## Evidence on Hand

- Documentación funcional y normativa completa en `docs/`; guía de UI con decisiones aceptadas (navegación, registro, acceso, recuperación, perfil, contenido público) y pendientes (marca, detalle de componentes).
- Implementación existente: app Flutter (`apps/mobile`, tema en `lib/presentacion/tema.dart`) y web (`apps/web`, tokens en `src/estilos.css`).
- **No hay**: fotografías propias, logotipo, testimonios, cifras, instituciones participantes confirmadas ni contactos de emergencia aprobados. Nada de esto debe inventarse.

## Product Principles

1. **No prometer lo que el sistema no hace.** Registrar un reporte no es pedir ni confirmar un despacho; leer un aviso no es atender. El diseño nunca sugiere más de lo que hay.
2. **Declarar el estado real.** Lo que aún no existe se dice con texto e icono («Aún no disponible»); un error de red no se presenta como éxito; no hay datos de ejemplo disfrazados de reales.
3. **Mínimo necesario, siempre con control.** Pedir poco, un toque cuando se pueda, y que quien aporta datos sepa qué se comparte y pueda retirarlo.
4. **Humano en el circuito, con rastro.** Cada decisión relevante tiene un actor, un motivo y un momento; el orden y las etiquetas no se alteran en silencio.
5. **Legible bajo presión.** Pensado para sol, prisa, pantallas pequeñas y turnos largos: jerarquía clara, objetivos grandes, estados que no dependen solo del color.

## Accessibility & Inclusion

- Objetivo WCAG 2.1 AA: contraste de texto 4,5:1 (3:1 para bordes y gráficos), foco visible, lectores de pantalla y texto ampliable al 200 % sin pérdida de contenido.
- Texto base de 16, controles de al menos 48 de alto, etiquetas persistentes, errores con texto e icono, estados que no dependen solo del color.
- Uso con una mano y a pleno sol: contraste holgado y acciones principales al alcance del pulgar; conexión inestable: estados de carga, error y reintento explícitos.
- Pendiente: revisión manual con lector de pantalla (TalkBack) y pruebas de usabilidad.
