# AyniSafe – web (portada pública y acceso institucional)

SPA en **React + TypeScript + Vite**. Incluye la portada pública, el acceso de administradores y operadores, la
activación de cuentas invitadas y un panel mínimo por rol. **No** hay autorregistro de ninguna clase ni versión
ciudadana para el navegador (el ciudadano usa la app Flutter), y las secciones del panel aún no tienen funciones.

> Estado: probada en local (Chrome) contra la API y PostgreSQL de pruebas. **No está desplegada**: la reescritura de
> Vercel hacia Render y la IP del cliente tras dos proxies siguen pendientes de verificar (ver «Despliegue»).

## Requisitos

- Node 22 o superior.
- La API de `apps/api` en ejecución (`npm run dev`, puerto 3000). Ver su [README](../api/README.md).

## Ejecutar

```bash
npm ci
npm run dev        # http://localhost:5173 ; /api/* se reenvía a la API (proxy)
npm run lint
npm run typecheck
npm test           # pruebas de componentes, flujos, accesibilidad (axe) y despliegue estático
npm run build && npm run verificar:dist   # compila y comprueba que el artefacto no filtra URLs de la API
```

Con la API en otro puerto: `API_DEV_URL=http://127.0.0.1:3100 npm run dev`. Para que el acceso funcione, la API debe
tener `WEB_ORIGIN` igual al origen de la web (por defecto `http://localhost:5173`).

## Mismo origen y sesión

La web llama siempre a rutas relativas (`/api/v1/...`). En desarrollo, el proxy de Vite las reenvía a la API
(conserva `Origin`; se desactiva el CORS abierto de Vite); en producción lo hace la reescritura de `vercel.json`. Así
la cookie de sesión (`HttpOnly; Secure; SameSite=Strict`) no es de terceros y la API no necesita CORS. La web no lee ni
escribe cookies ni `localStorage`/`sessionStorage`/IndexedDB (una regla de lint y una prueba lo vigilan).

## Prueba de extremo a extremo local

```bash
node e2e/local.mjs
```

Levanta la API contra la base `*_test` de `apps/api/.env`, el servidor de desarrollo y Chrome (o Edge) con
`playwright-core`; recorre bootstrap del administrador → activación → acceso → refrescar → panel → cierre → ciudadano
rechazado → operador en el panel ajeno → cuenta suspendida → reinicio de emergencia, y comprueba cookies, ausencia de
CORS, mismo origen y texto al 200 %. **No corre en CI** (necesita PostgreSQL y un navegador). No imprime correos,
tokens ni contraseñas. Variable opcional: `CHROME_PATH`.

## Despliegue (pendiente de verificar)

`vercel.json` define la reescritura `/api/*` → API, el respaldo del SPA y las cabeceras de seguridad (CSP sin terceros,
`frame-ancestors 'none'`, `nosniff`, sin referrer). El destino de la API es el marcador **no válido**
`api-render-pendiente.invalid`: hay que sustituirlo por el host real de Render **después** de los spikes del cambio:

1. ¿La reescritura de Vercel tolera el arranque en frío de Render (~1 min) o devuelve 502/504? (la web ya trata 5xx y
   tiempos de espera como «servicio no disponible» con «Reintentar»).
2. ¿Conserva `Origin` y las cabeceras `Sec-Fetch-*`?
3. ¿Qué valor de `TRUST_PROXY_HOPS` entrega la IP real del cliente con dos proxies? Hasta fijarlo, el limitador por IP
   puede agrupar a los clientes.

En producción la API exige `WEB_ORIGIN` y `WEB_PUBLIC_URL` (https, mismo origen) con el dominio de Vercel. Un despliegue
de vista previa de Vercel tiene otro origen y no podrá iniciar sesión: es esperado.

## Pendiente

- Revisión con lector de pantalla (manual). Se midió contraste, se comprobó axe y el reflujo al 200 % en Chrome.
- Creación y gestión de operadores (Spec 06) y las funciones de cada sección del panel.
