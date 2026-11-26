import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearPrismaClient } from '../src/modules/identidad/infraestructura/prisma-cliente';
import { PrismaTerritorioAdapter } from '../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { CONTRASTE_INEI, prepararPaquete, sha256 } from '../src/modules/consultas/infraestructura/paquete-territorial';
import { validarVersion } from '../src/modules/consultas/dominio/territorio';

/** CLI local administrativa; nunca recibe secretos por argumentos ni los imprime. */
export async function ejecutar(args: string[]): Promise<void> {
  const [accion, ...opciones] = args;
  if (!['validar', 'importar', 'activar'].includes(accion ?? '')) throw new Error('Uso: territorio validar|importar [archivo] [--dry-run] [--activar] | activar <version>');
  if (accion === 'activar') {
    if (opciones.length !== 1 || !validarVersion(opciones[0])) throw new Error('Indica una versión válida.');
    const prisma = crearPrismaClient(urlBd());
    try {
      await new PrismaTerritorioAdapter(prisma).activar(opciones[0]!);
      console.log(JSON.stringify({ accion: 'activar', version: opciones[0] }));
    } finally { await prisma.$disconnect(); }
    return;
  }
  if (opciones.some(o => o.startsWith('--') && !['--dry-run', '--activar'].includes(o))
    || opciones.filter(o => !o.startsWith('--')).length > 1 || (accion === 'validar' && opciones.includes('--activar'))
    || (opciones.includes('--dry-run') && opciones.includes('--activar'))) throw new Error('Opciones territoriales no válidas.');
  const archivo = opciones.find(o => !o.startsWith('--')) ?? 'data/ayacucho-metropolitano.geojson';
  const bytes = readFileSync(resolve(archivo));
  const constancia = sha256(bytes) === CONTRASTE_INEI.sha256Archivo ? CONTRASTE_INEI : undefined;
  const preparado = prepararPaquete(bytes, constancia);
  const resumen = { version: preparado.snapshot.version, contrastado: preparado.contrastado,
    distritos: preparado.snapshot.limites.length, solapamientos: preparado.solapamientos };
  if (accion === 'validar' || opciones.includes('--dry-run')) {
    console.log(JSON.stringify({ ...resumen, simulacion: true, escrituras: 0 })); return;
  }
  if (!preparado.contrastado) throw new Error('Paquete sin constancia de contraste; solo se permite validación o simulación.');
  const prisma = crearPrismaClient(urlBd());
  try {
    console.log(JSON.stringify({ ...resumen, ...await new PrismaTerritorioAdapter(prisma).importar(preparado, opciones.includes('--activar')) }));
  } finally { await prisma.$disconnect(); }
}
function urlBd(): string {
  if (!process.env.DATABASE_URL) throw new Error('Falta la configuración de base de datos.');
  return process.env.DATABASE_URL;
}
if (require.main === module) {
  ejecutar(process.argv.slice(2)).catch(() => {
    // No imprimir errores de drivers ni rutas/argumentos potencialmente privados.
    console.error('No se pudo completar la operación territorial. Revisa acción, paquete, contraste y configuración.');
    process.exitCode = 1;
  });
}
