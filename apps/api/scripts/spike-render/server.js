// Servicio DESECHABLE de la tarea 1.2: comprueba desde Render Free si el SMTP saliente de Gmail
// funciona. No es parte de la API. No guarda nada y no imprime credenciales. Eliminar al terminar.
//
//   GET  /sondeo        -> intenta conectar a smtp.gmail.com en 465 y 587 (sin credenciales)
//   POST /enviar        -> envia un correo de prueba (sin enlaces ni tokens). Exige la cabecera
//                          x-spike-key igual a SPIKE_KEY. Cuerpo JSON: {"para":"correo@ejemplo.com"}
const http = require('node:http');
const net = require('node:net');
const nodemailer = require('nodemailer');

const PUERTO = Number(process.env.PORT || 3000);
const HOST = process.env.SMTP_HOST || 'smtp.gmail.com';

function sondear(puerto) {
  return new Promise((resolver) => {
    const t0 = Date.now();
    const socket = net.connect({ host: HOST, port: puerto, timeout: 8000 });
    socket.on('connect', () => { socket.destroy(); resolver({ puerto, resultado: 'conecta', ms: Date.now() - t0 }); });
    socket.on('timeout', () => { socket.destroy(); resolver({ puerto, resultado: 'TIMEOUT (probable bloqueo)', ms: Date.now() - t0 }); });
    socket.on('error', (e) => resolver({ puerto, resultado: `error ${e.code}`, ms: Date.now() - t0 }));
  });
}

function responder(res, estado, cuerpo) {
  res.writeHead(estado, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

function leerJson(req) {
  return new Promise((resolver) => {
    let datos = '';
    req.on('data', (c) => { datos += c; if (datos.length > 2000) req.destroy(); });
    req.on('end', () => { try { resolver(JSON.parse(datos || '{}')); } catch { resolver({}); } });
  });
}

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/sondeo') {
    return responder(res, 200, { host: HOST, resultados: await Promise.all([sondear(465), sondear(587)]) });
  }
  if (req.method === 'POST' && req.url === '/enviar') {
    const clave = process.env.SPIKE_KEY;
    if (!clave || req.headers['x-spike-key'] !== clave) return responder(res, 401, { error: 'no autorizado' });
    const { para } = await leerJson(req);
    if (typeof para !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return responder(res, 400, { error: 'para invalido' });
    const puerto = Number(process.env.SMTP_PORT || 465);
    const transporte = nodemailer.createTransport({
      host: HOST, port: puerto, secure: puerto === 465,
      auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE },
      connectionTimeout: 10000, socketTimeout: 15000, logger: false,
    });
    try {
      await transporte.verify();
      const r = await transporte.sendMail({
        from: { name: process.env.MAIL_REMITENTE_NOMBRE || 'AyniSafe', address: process.env.SMTP_USUARIO },
        to: para,
        subject: 'Prueba de envio desde Render (spike AyniSafe)',
        text: 'Correo de prueba enviado desde Render Free. No contiene enlaces ni tokens. Indica si llego a la bandeja de entrada o a spam.',
      });
      return responder(res, 200, { autenticacion: 'correcta', aceptados: r.accepted.length, rechazados: r.rejected.length, puerto });
    } catch (e) {
      return responder(res, 502, { autenticacion: 'fallo', codigo: e.code || 'desconocido', respuesta: e.responseCode || null, puerto });
    }
  }
  return responder(res, 404, { error: 'no encontrado' });
}).listen(PUERTO, () => console.log(`spike SMTP escuchando en ${PUERTO}`));
