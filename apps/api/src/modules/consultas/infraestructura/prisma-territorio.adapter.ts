import type { PrismaClient, Prisma } from '../../../generated/prisma/client';
import type { TerritorioRepositorio } from '../aplicacion/territorio.use-case';
import { ErrorTerritorial, type Geometria, type MetadatosTerritoriales, type SnapshotTerritorial } from '../dominio/territorio';
import { calcularBbox } from '../dominio/geometria';
import { calcularVersion, type prepararPaquete } from './paquete-territorial';

const AMBITO = 'ayacucho-metropolitano';
export class PrismaTerritorioAdapter implements TerritorioRepositorio {
  constructor(private readonly prisma: PrismaClient) {}
  async leer(id?: string): Promise<SnapshotTerritorial | null> {
    // El ID se fija primero; las geometrías referidas nunca cambian.
    const version = id ?? (await this.prisma.estadoTerritorial.findUnique({ where: { ambito: AMBITO } }))?.versionId;
    if (!version) return null;
    const fila = await this.prisma.versionTerritorial.findUnique({ where: { id: version },
      include: { geometrias: { include: { distrito: true }, orderBy: { distritoId: 'asc' } } } });
    if (!fila) return null;
    return { version: fila.id, metadatos: fila.metadatos as unknown as MetadatosTerritoriales,
      limites: fila.geometrias.map(g => ({ distrito: { id: g.distrito.id, nombre: g.distrito.nombre, ubigeo: g.ubigeo },
        geometry: g.geometria as unknown as Geometria,
        // Float[] puede redondearse al serializarlo el ORM. La geometría JSONB es la fuente exacta.
        bbox: calcularBbox(g.geometria as unknown as Geometria) })) };
  }
  async importar(paquete: ReturnType<typeof prepararPaquete>, activar = false): Promise<{ version: string; existente: boolean; activa: boolean }> {
    if (!paquete.contrastado) throw new ErrorTerritorial('VALIDATION_ERROR');
    const s = paquete.snapshot;
    if (calcularVersion(s.limites, s.metadatos) !== s.version) throw new ErrorTerritorial('VALIDATION_ERROR');
    return this.prisma.$transaction(async tx => {
      // Serializa importaciones/activaciones y hace idempotentes las repeticiones concurrentes.
      await tx.$queryRaw`SELECT ambito FROM estado_territorial WHERE ambito = ${AMBITO} FOR UPDATE`;
      const anterior = await tx.versionTerritorial.findUnique({ where: { id: s.version } });
      if (!anterior) {
        await tx.versionTerritorial.create({ data: { id: s.version, metadatos: s.metadatos as unknown as Prisma.InputJsonValue,
          geometrias: { create: s.limites.map(l => ({ distritoId: l.distrito.id, ubigeo: l.distrito.ubigeo!,
            geometria: l.geometry as unknown as Prisma.InputJsonValue, bbox: [...l.bbox] })) } } });
      } else {
        const previo = await tx.geometriaDistrital.findMany({ where: { versionId: s.version }, orderBy: { distritoId: 'asc' } });
        const contenido = s.limites.map(l => ({ distritoId: l.distrito.id, ubigeo: l.distrito.ubigeo,
          geometria: l.geometry, bbox: [...l.bbox] }));
        // JSONB no conserva orden de claves. Comparar estructura canónica, no bytes serializados.
        const normalizar = (v: unknown): unknown => Array.isArray(v) ? v.map(normalizar)
          : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalizar(x)])) : v;
        const guardado = previo.map(({ distritoId, ubigeo, geometria }) => ({ distritoId, ubigeo, geometria,
          bbox: calcularBbox(geometria as unknown as Geometria) }));
        if (JSON.stringify(normalizar(guardado)) !== JSON.stringify(normalizar(contenido))) throw new ErrorTerritorial('VALIDATION_ERROR');
      }
      if (activar) await tx.estadoTerritorial.update({ where: { ambito: AMBITO }, data: { versionId: s.version } });
      return { version: s.version, existente: !!anterior, activa: activar || (await tx.estadoTerritorial.findUnique({ where: { ambito: AMBITO } }))?.versionId === s.version };
    }, { timeout: 30000 });
  }
  async activar(version: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT ambito FROM estado_territorial WHERE ambito = ${AMBITO} FOR UPDATE`;
      if (!await tx.versionTerritorial.findUnique({ where: { id: version } })) throw new ErrorTerritorial('TERRITORY_VERSION_NOT_FOUND');
      await tx.estadoTerritorial.update({ where: { ambito: AMBITO }, data: { versionId: version } });
    });
  }
}
