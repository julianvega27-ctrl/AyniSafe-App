// Prueba MANUAL del proveedor de correo real (tarea 4.7). Envia un correo de prueba sin enlaces ni
// tokens con el adaptador indicado en EMAIL_ADAPTER (gmail-api o smtp) a las direcciones dadas.
// No imprime credenciales, tokens ni el cuerpo. Los adaptadores de prueba/archivo no sirven aqui.
//
//   EMAIL_ADAPTER=gmail-api npx tsx scripts/probar-correo.ts correo1@ejemplo.com correo2@ejemplo.com
import 'dotenv/config';
import { cargarConfigCorreo } from '../src/config/entorno';
import { FalloEnvioCorreoError } from '../src/modules/identidad/dominio/errores';
import { crearCorreo } from '../src/modules/identidad/infraestructura/crear-correo';

async function main(): Promise<void> {
  const destinos = process.argv.slice(2);
  if (destinos.length === 0) {
    console.error('Uso: EMAIL_ADAPTER=gmail-api npx tsx scripts/probar-correo.ts destino1 [destino2 ...]');
    process.exit(1);
  }
  const config = cargarConfigCorreo(process.env, 'development');
  if (config.adaptador !== 'gmail-api' && config.adaptador !== 'smtp') {
    console.error('Define EMAIL_ADAPTER=gmail-api (o smtp): los adaptadores archivo y prueba no envian nada real.');
    process.exit(1);
  }
  const correo = crearCorreo(config);
  console.log(`Adaptador: ${config.adaptador}. Remitente: ${config.remitenteNombre} <${config.remitenteDireccion}>`);
  for (const para of destinos) {
    const inicio = Date.now();
    try {
      await correo.enviar({
        para,
        asunto: 'Prueba de envío de AyniSafe',
        texto:
          'Correo de prueba del proveedor de correo de AyniSafe. No contiene enlaces ni códigos.\n' +
          'Indica si llegó a la bandeja de entrada o a spam, y qué remitente se ve.',
      });
      console.log(`  -> aceptado por el proveedor para un destinatario (${Date.now() - inicio} ms)`);
    } catch (e) {
      const codigo = e instanceof FalloEnvioCorreoError ? e.codigo : 'DESCONOCIDO';
      console.error(`  -> FALLO (${codigo}) tras ${Date.now() - inicio} ms`);
      process.exitCode = 1;
    }
  }
}

void main();
