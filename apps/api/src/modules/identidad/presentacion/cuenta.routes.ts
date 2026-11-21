import { createHash } from 'node:crypto';
import { Router, type Response } from 'express';

export interface ConfigAndroid {
  /** Identificador de la app Android (applicationId). */
  readonly paquete: string;
  /** Huellas SHA-256 del certificado de firma, formato AA:BB:...; sin ellas assetlinks.json no se publica. */
  readonly huellasSha256: readonly string[];
}

/**
 * Lee el codigo del fragmento (#t=...) en el navegador: el fragmento nunca viaja al servidor, de
 * modo que ni los registros de acceso ni los intermediarios lo reciben. Despues lo quita de la
 * barra de direcciones y del historial.
 */
const SCRIPT = `(function(){
var m=/^#t=([A-Za-z0-9_-]{20,200})$/.exec(location.hash);
var con=document.getElementById('con'),sin=document.getElementById('sin'),est=document.getElementById('estado');
function avisar(t){est.textContent=t;}
if(m){
con.hidden=false;
var campo=document.getElementById('codigo');
campo.value=m[1];
document.getElementById('copiar').onclick=function(){
campo.select();
var p=(navigator.clipboard&&navigator.clipboard.writeText)?navigator.clipboard.writeText(campo.value):Promise.reject();
p.then(function(){avisar('Código copiado.');},function(){avisar('Selecciona el código y cópialo.');});
};
history.replaceState(null,'',location.pathname);
}else{sin.hidden=false;}
})();`;

const ESTILO = `body{margin:0;background:#F5F7FA;color:#172B3A;font:16px/1.5 system-ui,sans-serif}
main{max-width:32rem;margin:0 auto;padding:24px 16px}
h1{color:#17324D;font-size:1.5rem}
input{width:100%;box-sizing:border-box;min-height:48px;font:inherit;padding:8px;border:1px solid #17324D;border-radius:8px}
button{min-height:48px;margin-top:8px;padding:0 16px;font:inherit;color:#fff;background:#17324D;border:0;border-radius:8px}
p[role=status]{min-height:1.5em}`;

const sha = (texto: string): string => `'sha256-${createHash('sha256').update(texto).digest('base64')}'`;
const CSP = [
  "default-src 'none'",
  `script-src ${sha(SCRIPT)}`,
  `style-src ${sha(ESTILO)}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function pagina(titulo: string, instruccion: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>AyniSafe: ${titulo}</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
<h1>${titulo}</h1>
<p>${instruccion}</p>
<div id="con" hidden>
<label for="codigo">Código</label>
<input id="codigo" type="text" readonly autocomplete="off" spellcheck="false">
<button id="copiar" type="button">Copiar código</button>
<p id="estado" role="status"></p>
<p>Si la app no se abrió, instálala o ábrela, elige «Tengo un código» y pega este código.</p>
</div>
<p id="sin" hidden>Este enlace está incompleto. Vuelve a abrirlo desde el correo que recibiste.</p>
<noscript><p>Activa JavaScript para ver el código, o abre este enlace desde un celular que tenga la app de AyniSafe.</p></noscript>
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const RESTABLECER = pagina(
  'Restablecer contraseña',
  'Abre este enlace en el celular donde tienes la app de AyniSafe para elegir una contraseña nueva.',
);
const ACTIVAR = pagina(
  'Activar cuenta',
  'Abre este enlace en el celular donde tienes la app de AyniSafe para activar tu cuenta y elegir tu contraseña.',
);

function enviarPagina(res: Response, html: string): void {
  res
    .status(200)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': CSP,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    })
    .send(html);
}

/**
 * Paginas de respaldo del enlace del correo y asociacion de App Links. No reciben ni registran el
 * token: este solo existe en el fragmento, que lee el navegador.
 */
export function crearRutasCuenta(android: ConfigAndroid): Router {
  const router = Router();
  router.get('/cuenta/restablecer', (_req, res) => enviarPagina(res, RESTABLECER));
  router.get('/cuenta/activar', (_req, res) => enviarPagina(res, ACTIVAR));
  router.get('/.well-known/assetlinks.json', (_req, res) => {
    if (android.huellasSha256.length === 0) {
      res.status(404).type('text/plain').send('No configurado');
      return;
    }
    res
      .status(200)
      .set({ 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
      .json([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: android.paquete,
            sha256_cert_fingerprints: [...android.huellasSha256],
          },
        },
      ]);
  });
  return router;
}
