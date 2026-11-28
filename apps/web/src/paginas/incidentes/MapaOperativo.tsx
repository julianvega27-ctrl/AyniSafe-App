import { Component, lazy, Suspense, useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  api,
  type CategoriaCatalogo,
  type DistritoCatalogo,
  type LimitesDistritales,
  type MapaOperativo as DatosMapa,
  type PeriodoOperativo,
} from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { FalloDeConexion } from '../../componentes/FalloDeConexion';
import { Icono } from '../../componentes/iconos';
import { Mensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';
import { ESTADO, fecha, PRIORIDAD } from './etiquetas';

/**
 * Mapa operativo del operador (P7 grupo B, spec `web/mapa-operativo`; MapView.jsx del origen). Filtros
 * por distrito, categoria y periodo, resumen, leyenda y una lista equivalente con enlace al detalle. El
 * lienzo Leaflet se carga de forma diferida dentro de un limite de error: si el mapa o sus teselas
 * fallan, la consulta sigue disponible en la lista. Sin consultas periodicas.
 */

const MapaLeaflet = lazy(() => import('./MapaLeaflet'));

const PERIODOS: readonly (readonly [PeriodoOperativo, string])[] = [
  ['24h', 'Últimas 24 horas'],
  ['7d', 'Últimos 7 días'],
  ['30d', 'Últimos 30 días'],
];

type Carga =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly datos: DatosMapa }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' };

/** Limite de error del lienzo: un fallo del mapa no impide consultar el resto. */
class LimiteMapa extends Component<{ children: ReactNode; alternativa: ReactNode }, { fallo: boolean }> {
  override state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  override render() {
    return this.state.fallo ? this.props.alternativa : this.props.children;
  }
}

export function MapaOperativo() {
  const { expirar } = useSesion();
  const idDistrito = useId();
  const idCategoria = useId();
  const idPeriodo = useId();
  const [distrito, setDistrito] = useState('');
  const [categoria, setCategoria] = useState('');
  const [periodo, setPeriodo] = useState<PeriodoOperativo>('7d');
  const [intento, setIntento] = useState(0);
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [distritos, setDistritos] = useState<readonly DistritoCatalogo[]>([]);
  const [categorias, setCategorias] = useState<readonly CategoriaCatalogo[]>([]);
  const [limites, setLimites] = useState<LimitesDistritales | null>(null);
  const [falloTeselas, setFalloTeselas] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    void Promise.all([api.distritos(control.signal), api.categorias(control.signal), api.limites(control.signal)])
      .then(([d, c, l]) => {
        if (d.tipo === 'ok') setDistritos(d.datos.distritos);
        if (c.tipo === 'ok') setCategorias(c.datos.categorias);
        if (l.tipo === 'ok') setLimites(l.datos);
      })
      .catch(() => undefined);
    return () => control.abort();
  }, []);

  useEffect(() => {
    const control = new AbortController();
    setCarga({ estado: 'cargando' });
    api
      .mapaOperativo({ ...(distrito ? { distrito } : {}), ...(categoria ? { categoria } : {}), periodo }, control.signal)
      .then((r) => {
        if (r.tipo === 'ok') return setCarga({ estado: 'listo', datos: r.datos });
        if (r.tipo === 'error' && r.estado === 401) return expirar();
        if (r.tipo === 'error') return setCarga({ estado: 'sin-permiso' });
        setCarga({ estado: 'fallo', causa: r.tipo === 'red' ? 'red' : 'servicio' });
      })
      .catch(() => undefined);
    return () => control.abort();
  }, [distrito, categoria, periodo, intento, expirar]);

  const elementos = carga.estado === 'listo' ? carga.datos.elementos : [];
  const conteo = [...elementos.reduce((m, e) => m.set(e.categoria.id, { nombre: e.categoria.nombre ?? e.categoria.id, n: (m.get(e.categoria.id)?.n ?? 0) + 1 }), new Map<string, { nombre: string; n: number }>())]
    .sort((a, b) => b[1].n - a[1].n);

  return (
    <section className="panel" aria-labelledby="titulo-mapa">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Ayacucho piloto</span>
          <h2 id="titulo-mapa">Explorar territorio</h2>
        </div>
      </div>
      <div className="map-filters">
        <div className="field">
          <label htmlFor={idCategoria}>Tipo de incidente</label>
          <select id={idCategoria} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todos los tipos</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={idDistrito}>Distrito</label>
          <select id={idDistrito} value={distrito} onChange={(e) => setDistrito(e.target.value)}>
            <option value="">Todos los distritos</option>
            {distritos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={idPeriodo}>Período</label>
          <select id={idPeriodo} value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoOperativo)}>
            {PERIODOS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="map-filter-footer">
        <p className="map-note">Fecha de registro · Hora de Perú · Puntos exactos limitados a los incidentes de tu sede.</p>
        <Boton variante="secundario" onClick={() => setIntento((n) => n + 1)} cargando={carga.estado === 'cargando'}>
          Actualizar
        </Boton>
      </div>

      {carga.estado === 'fallo' ? <FalloDeConexion tipo={carga.causa} onReintentar={() => setIntento((n) => n + 1)} /> : null}
      {carga.estado === 'sin-permiso' ? (
        <Mensaje tipo="error" titulo="No se pudo consultar el mapa">
          Tu sede no está habilitada para atención o los filtros no son válidos.
        </Mensaje>
      ) : null}

      {carga.estado === 'listo' ? (
        <>
          <div className="map-summary" role="status">
            <strong>
              {elementos.length} incidente{elementos.length === 1 ? '' : 's'} visible{elementos.length === 1 ? '' : 's'}
            </strong>
            <span>{elementos.filter((e) => e.estado !== 'CERRADO').length} en seguimiento</span>
            <span>{elementos.filter((e) => e.publicacion.vigente).length} publicados en el mapa ciudadano</span>
          </div>
          {carga.datos.truncado ? (
            <Mensaje tipo="info" titulo="Se muestran los 500 más recientes">
              Acota los filtros para ver el resto.
            </Mensaje>
          ) : null}
          {falloTeselas ? (
            <Mensaje tipo="info" titulo="Mapa base no disponible">
              No cargaron las calles del mapa. Los puntos, los límites y la lista siguen disponibles.
            </Mensaje>
          ) : null}
          <LimiteMapa
            alternativa={
              <Mensaje tipo="info" titulo="El mapa no está disponible">
                No se pudo mostrar el mapa. Consulta los incidentes en la lista.
              </Mensaje>
            }
          >
            <Suspense fallback={<p className="loading">Cargando mapa…</p>}>
              <div className="map-frame">
                <MapaLeaflet elementos={elementos} limites={limites} distritoId={distrito} onFalloTeselas={() => setFalloTeselas(true)} />
              </div>
            </Suspense>
          </LimiteMapa>
          <div className="map-legend" aria-label="Tipos de incidentes visibles">
            {conteo.map(([id, c]) => {
              const activo = categoria === id;
              return (
                <button
                  type="button"
                  key={id}
                  className={`map-legend-item${activo ? ' active' : ''}`}
                  aria-pressed={activo}
                  onClick={() => setCategoria(activo ? '' : id)}
                >
                  <span>{c.nombre}</span>
                  <strong>{c.n}</strong>
                </button>
              );
            })}
            {!conteo.length ? <span>Sin incidentes para estos filtros.</span> : null}
          </div>
          {conteo.length ? <p className="map-legend-help">Toca un tipo para filtrarlo.</p> : null}
          <p className="map-note">Mapa base: {__TESELAS__.atribucion} · Límites referenciales del catálogo territorial.</p>

          {elementos.length ? (
            <div className="table-wrap">
              <table>
                <caption className="solo-lectores">Incidentes del mapa, del más reciente al más antiguo</caption>
                <thead>
                  <tr>
                    <th scope="col">Incidente</th>
                    <th scope="col">Distrito</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Prioridad</th>
                    <th scope="col">Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {elementos.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link to={`/panel/operador/incidentes/${e.id}`}>{e.referencia}</Link>
                        <div className="metadatos">
                          {e.categoria.nombre ?? e.categoria.id}
                          {e.publicacion.vigente ? (
                            <span className="pill">
                              <Icono nombre="exito" /> Publicado{e.publicacion.reservada ? ' (reservado)' : ''}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>{e.distrito?.nombre ?? 'Pendiente'}</td>
                      <td>{ESTADO[e.estado]}</td>
                      <td>{PRIORIDAD[e.prioridad].texto}</td>
                      <td>{fecha(e.registradoEn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
      {carga.estado === 'cargando' ? <p className="loading">Cargando incidentes…</p> : null}
    </section>
  );
}
