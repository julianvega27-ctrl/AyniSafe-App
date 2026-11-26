import { ErrorTerritorial, objeto, type Anillo, type Bbox, type Geometria, type Poligono, type Posicion,
  type ResultadoTerritorial, type SnapshotTerritorial, type SolicitudPunto } from './territorio';

/** Tolerancia numérica en grados, no precisión GPS ni margen de jurisdicción. */
export const TOLERANCIA_BORDE = 1e-10;
// Referencias nativas: evita búsquedas globales por cada pareja de segmentos en la VM de Jest.
const { min, max, abs, hypot } = Math;
type Lugar = 'interior' | 'borde' | 'exterior';
const cruz = (a: Posicion, b: Posicion, p: Posicion): number =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const iguales = (a: Posicion, b: Posicion): boolean => a[0] === b[0] && a[1] === b[1];

function enSegmento(p: Posicion, a: Posicion, b: Posicion, tolerancia = TOLERANCIA_BORDE): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const largo = hypot(dx, dy);
  if (largo === 0) return hypot(p[0] - a[0], p[1] - a[1]) <= tolerancia;
  return abs(cruz(a, b, p)) <= tolerancia * largo
    && p[0] >= min(a[0], b[0]) - tolerancia && p[0] <= max(a[0], b[0]) + tolerancia
    && p[1] >= min(a[1], b[1]) - tolerancia && p[1] <= max(a[1], b[1]) + tolerancia;
}

export function lugarEnAnillo(p: Posicion, anillo: Anillo): Lugar {
  let dentro = false;
  for (let i = 0; i < anillo.length - 1; i++) {
    const a = anillo[i]!, b = anillo[i + 1]!;
    if (enSegmento(p, a, b)) return 'borde';
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) dentro = !dentro;
  }
  return dentro ? 'interior' : 'exterior';
}
export function lugarEnPoligono(p: Posicion, poligono: Poligono): Lugar {
  const exterior = lugarEnAnillo(p, poligono[0]!);
  if (exterior !== 'interior') return exterior;
  for (const hueco of poligono.slice(1)) {
    const lugar = lugarEnAnillo(p, hueco);
    if (lugar === 'borde') return 'borde';
    if (lugar === 'interior') return 'exterior';
  }
  return 'interior';
}
export const poligonos = (g: Geometria): readonly Poligono[] => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
export function lugarEnGeometria(p: Posicion, g: Geometria): Lugar {
  const lugares = poligonos(g).map(poly => lugarEnPoligono(p, poly));
  return lugares.includes('borde') ? 'borde' : lugares.includes('interior') ? 'interior' : 'exterior';
}
export function calcularBbox(g: Geometria): Bbox {
  const puntos = poligonos(g).flatMap(p => p.flatMap(a => [...a]));
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of puntos) { x1 = min(x1, x); y1 = min(y1, y); x2 = max(x2, x); y2 = max(y2, y); }
  return [x1, y1, x2, y2];
}
function intersectan(a: Posicion, b: Posicion, c: Posicion, d: Posicion): boolean {
  if (max(a[0], b[0]) < min(c[0], d[0]) || max(c[0], d[0]) < min(a[0], b[0])
    || max(a[1], b[1]) < min(c[1], d[1]) || max(c[1], d[1]) < min(a[1], b[1])) return false;
  const abC = cruz(a, b, c), abD = cruz(a, b, d), cdA = cruz(c, d, a), cdB = cruz(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) || (abC === 0 && enSegmento(c, a, b, 0))
    || (abD === 0 && enSegmento(d, a, b, 0)) || (cdA === 0 && enSegmento(a, c, d, 0)) || (cdB === 0 && enSegmento(b, c, d, 0));
}
function anillosIntersectan(a: Anillo, b: Anillo): boolean {
  for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++) {
    if (intersectan(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
  }
  return false;
}
function validarAnillo(valor: unknown): Anillo {
  if (!Array.isArray(valor) || valor.length < 4 || valor.some(p => !Array.isArray(p) || p.length !== 2
    || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !Number.isFinite(p[0]) || !Number.isFinite(p[1])
    || p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90)) throw new ErrorTerritorial('VALIDATION_ERROR');
  const a = valor as unknown as Anillo;
  if (!iguales(a[0]!, a[a.length - 1]!)) throw new ErrorTerritorial('VALIDATION_ERROR');
  let area = 0;
  // Trasladar al origen reduce cancelación con coordenadas geográficas pequeñas.
  const origen = a[0]!;
  for (let i = 0; i < a.length - 1; i++) {
    if (iguales(a[i]!, a[i + 1]!)) throw new ErrorTerritorial('VALIDATION_ERROR');
    area += cruz(origen, a[i]!, a[i + 1]!);
    for (let j = i + 1; j < a.length - 1; j++) {
      const adyacentes = j === i + 1 || (i === 0 && j === a.length - 2);
      if (!adyacentes && intersectan(a[i]!, a[i + 1]!, a[j]!, a[j + 1]!)) throw new ErrorTerritorial('VALIDATION_ERROR');
      if (adyacentes) {
        const comun = j === i + 1 ? a[j]! : a[0]!;
        const otroA = j === i + 1 ? a[i]! : a[i + 1]!;
        const otroB = j === i + 1 ? a[j + 1]! : a[j]!;
        if (cruz(otroA, comun, otroB) === 0 && (enSegmento(otroA, comun, otroB, 0) || enSegmento(otroB, otroA, comun, 0))) {
          throw new ErrorTerritorial('VALIDATION_ERROR');
        }
      }
    }
  }
  if (area === 0) throw new ErrorTerritorial('VALIDATION_ERROR');
  return a;
}
function validarPoligono(valor: unknown): Poligono {
  if (!Array.isArray(valor) || !valor.length) throw new ErrorTerritorial('VALIDATION_ERROR');
  const p = valor.map(validarAnillo);
  for (let i = 1; i < p.length; i++) {
    if (lugarEnAnillo(p[i]![0]!, p[0]!) !== 'interior' || anillosIntersectan(p[0]!, p[i]!)) throw new ErrorTerritorial('VALIDATION_ERROR');
    for (let j = 1; j < i; j++) {
      if (anillosIntersectan(p[i]!, p[j]!) || lugarEnAnillo(p[i]![0]!, p[j]!) !== 'exterior'
        || lugarEnAnillo(p[j]![0]!, p[i]!) !== 'exterior') throw new ErrorTerritorial('VALIDATION_ERROR');
    }
  }
  return p;
}
/** Detecta superposición de interiores; compartir borde entre distritos es permitido. */
export function seSuperponen(a: Poligono, b: Poligono): boolean {
  for (const [p, otro] of [[a, b], [b, a]] as const) {
    for (const anillo of p) for (let i = 0; i < anillo.length - 1; i++) {
      const x = anillo[i]!, y = anillo[i + 1]!;
      if (lugarEnPoligono(x, otro) === 'interior' || lugarEnPoligono([(x[0] + y[0]) / 2, (x[1] + y[1]) / 2], otro) === 'interior') return true;
    }
  }
  for (const ra of a) for (const rb of b) for (let i = 0; i < ra.length - 1; i++) for (let j = 0; j < rb.length - 1; j++) {
    if (cruz(ra[i]!, ra[i + 1]!, rb[j]!) * cruz(ra[i]!, ra[i + 1]!, rb[j + 1]!) < 0
      && cruz(rb[j]!, rb[j + 1]!, ra[i]!) * cruz(rb[j]!, rb[j + 1]!, ra[i + 1]!) < 0) return true;
  }
  // Interiores idénticos pueden tener todos sus vértices sobre el borde del otro.
  const ring = a[0]!;
  for (let i = 0; i < ring.length - 1; i++) {
    const x = ring[i]!, y = ring[i + 1]!, len = hypot(y[0] - x[0], y[1] - x[1]);
    for (const signo of [-1, 1]) {
      const p: Posicion = [(x[0] + y[0]) / 2 + signo * (y[1] - x[1]) / len * 1e-8,
        (x[1] + y[1]) / 2 - signo * (y[0] - x[0]) / len * 1e-8];
      if (lugarEnPoligono(p, a) === 'interior' && lugarEnPoligono(p, b) === 'interior') return true;
    }
  }
  return false;
}
export function validarGeometria(valor: unknown): Geometria {
  if (!objeto(valor) || Object.keys(valor).some(k => !['type', 'coordinates'].includes(k))) throw new ErrorTerritorial('VALIDATION_ERROR');
  if (valor.type === 'Polygon') return { type: 'Polygon', coordinates: validarPoligono(valor.coordinates) };
  if (valor.type !== 'MultiPolygon' || !Array.isArray(valor.coordinates) || !valor.coordinates.length) throw new ErrorTerritorial('VALIDATION_ERROR');
  const polys = valor.coordinates.map(validarPoligono);
  for (let i = 0; i < polys.length; i++) for (let j = 0; j < i; j++) {
    // Componentes separados pueden tocarse solo en puntos; no compartir segmentos.
    if (seSuperponen(polys[i]!, polys[j]!)) throw new ErrorTerritorial('VALIDATION_ERROR');
    for (const ra of polys[i]!) for (const rb of polys[j]!) for (let x = 0; x < ra.length - 1; x++) for (let y = 0; y < rb.length - 1; y++) {
      const a = ra[x]!, b = ra[x + 1]!, c = rb[y]!, d = rb[y + 1]!;
      if (cruz(a, b, c) === 0 && cruz(a, b, d) === 0 && (min(max(a[0], b[0]), max(c[0], d[0])) > max(min(a[0], b[0]), min(c[0], d[0]))
        || min(max(a[1], b[1]), max(c[1], d[1])) > max(min(a[1], b[1]), min(c[1], d[1])))) throw new ErrorTerritorial('VALIDATION_ERROR');
    }
  }
  return { type: 'MultiPolygon', coordinates: polys };
}
export function resolverPunto(punto: SolicitudPunto, snapshot: SnapshotTerritorial): ResultadoTerritorial {
  const p: Posicion = [punto.longitud, punto.latitud];
  const interiores = [];
  for (const limite of snapshot.limites) {
    const [x1, y1, x2, y2] = limite.bbox;
    if (p[0] < x1 - TOLERANCIA_BORDE || p[0] > x2 + TOLERANCIA_BORDE || p[1] < y1 - TOLERANCIA_BORDE || p[1] > y2 + TOLERANCIA_BORDE) continue;
    const lugar = lugarEnGeometria(p, limite.geometry);
    if (lugar === 'borde') return { estado: 'pendiente', distrito: null, motivo: 'frontera', version: snapshot.version };
    if (lugar === 'interior') interiores.push(limite.distrito);
  }
  if (interiores.length === 1) return { estado: 'resuelto', distrito: interiores[0]!, motivo: null, version: snapshot.version };
  return { estado: 'pendiente', distrito: null, motivo: interiores.length ? 'solapamiento' : 'fuera_area', version: snapshot.version };
}
