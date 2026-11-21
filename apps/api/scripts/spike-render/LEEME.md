# Spike 1.2: SMTP de Gmail desde Render Free

Servicio **desechable**. Responde si Render Free bloquea el SMTP saliente y permite un envío real de prueba.
No guarda datos ni imprime credenciales. Eliminarlo al terminar.

## Desplegar (unos 5 minutos, en tu cuenta de Render)

1. Sube **solo esta carpeta** a un repositorio privado nuevo de GitHub (por ejemplo `ayni-spike-smtp`):
   `server.js`, `package.json` y este archivo. No subas la API ni ningún `.env`.
2. En Render: **New > Web Service**, elige ese repositorio y configura:
   - Runtime: **Node**; Build Command: `npm install`; Start Command: `node server.js`.
   - Instance Type: **Free**.
3. En **Environment** añade estas variables (la contraseña solo va aquí, nunca en Git):
   - `SMTP_USUARIO` = la cuenta Gmail dedicada
   - `SMTP_CLAVE` = su contraseña de aplicación
   - `SPIKE_KEY` = una cadena aleatoria larga que inventes (protege `/enviar`)
4. Cuando termine el despliegue, copia la URL pública (`https://….onrender.com`).

## Probar

```bash
curl https://TU-SERVICIO.onrender.com/sondeo
curl -X POST https://TU-SERVICIO.onrender.com/enviar -H "x-spike-key: TU_SPIKE_KEY" \
  -H "Content-Type: application/json" -d '{"para":"tu-correo@ejemplo.com"}'
```

- `/sondeo` con `conecta` en 465 o 587: el SMTP **no** está bloqueado. Con `TIMEOUT` o `error`: bloqueado.
- `/enviar` devuelve `autenticacion: correcta` y llega un correo a la bandeja (o a spam: dime dónde).

## Después

Borra el servicio de Render y el repositorio. Esa URL tampoco sirve para la API real: solo prueba el SMTP.
