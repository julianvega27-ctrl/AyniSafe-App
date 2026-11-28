import { useMemo } from 'react';
import { divIcon, type PathOptions } from 'leaflet';
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { Link } from 'react-router';
import type { ElementoMapaOperativo, LimitesDistritales } from '../../api/cliente';
import { ESTADO } from './etiquetas';
import 'leaflet/dist/leaflet.css';

/**
 * Lienzo Leaflet del mapa operativo (P7 grupo B; MapView.jsx del origen). Se carga de forma diferida:
 * si el modulo o las teselas fallan, la pagina conserva filtros, resumen y lista. Los marcadores usan
 * un `divIcon` con clases del origen y sin estilos en linea (CSP `style-src 'self'`).
 */

const CENTRO: [number, number] = [-13.16, -74.22];

// Glifo fijo de la aplicacion; el texto del catalogo nunca entra en el HTML del marcador.
const PIN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="m12 3 10 18H2L12 3Zm0 7v4m0 3h.01"/></svg>';

const icono = (publicado: boolean) =>
  divIcon({
    className: 'incident-map-icon',
    html: `<span class="incident-map-symbol${publicado ? ' incident-map-symbol--publicado' : ''}" aria-hidden="true"><span class="incident-map-glyph">${PIN}</span></span>`,
    iconSize: [60, 68],
    iconAnchor: [30, 62],
    popupAnchor: [0, -55],
  });

const ESTILO_LIMITE: PathOptions = { className: 'map-limite', weight: 2, fill: true, fillOpacity: 0.04 };

export default function MapaLeaflet({
  elementos,
  limites,
  distritoId,
  onFalloTeselas,
}: {
  elementos: readonly ElementoMapaOperativo[];
  limites: LimitesDistritales | null;
  distritoId: string;
  onFalloTeselas: () => void;
}) {
  const iconos = useMemo(() => ({ si: icono(true), no: icono(false) }), []);
  // La capa de limites se recrea al cambiar de distrito para resaltarlo.
  const claveLimites = `${distritoId}:${limites?.features.length ?? 0}`;
  return (
    <MapContainer center={CENTRO} zoom={12} minZoom={5} maxZoom={19} scrollWheelZoom className="map-canvas">
      <TileLayer
        url={__TESELAS__.url}
        attribution={__TESELAS__.atribucion}
        maxNativeZoom={19}
        maxZoom={19}
        // La pagina envia no-referrer; la politica de OSM exige un Referer valido solo en las teselas.
        referrerPolicy="strict-origin-when-cross-origin"
        eventHandlers={{ tileerror: onFalloTeselas }}
      />
      {limites?.features.map((f) => (
        <GeoJSON
          key={`${claveLimites}:${f.properties.id}`}
          data={f as unknown as GeoJSON.GeoJsonObject}
          pathOptions={{ ...ESTILO_LIMITE, className: f.properties.id === distritoId ? 'map-limite map-limite--activo' : 'map-limite' }}
        />
      ))}
      {elementos.map((e) => (
        <Marker key={e.id} position={[e.punto.lat, e.punto.lon]} icon={e.publicacion.vigente ? iconos.si : iconos.no} title={`${e.categoria.nombre ?? 'Incidente'}: ${e.referencia}`}>
          <Tooltip className="incident-map-label" direction="bottom" offset={[0, 12]}>
            {e.categoria.nombre ?? 'Incidente'}
          </Tooltip>
          <Popup>
            <div className="incident-map-popup">
              <span className="eyebrow">{e.categoria.nombre ?? 'Incidente'}</span>
              <strong>{e.referencia}</strong>
              <span>
                {ESTADO[e.estado]}
                {e.publicacion.vigente ? ' · publicado en el mapa ciudadano' : ''}
              </span>
              <Link to={`/panel/operador/incidentes/${e.id}`}>Ver detalle →</Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
