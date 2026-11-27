import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type FilaBandeja, type ResumenIncidente } from '../../api/cliente';
import { Boton, BotonEnlace } from '../../componentes/Boton';
import { FalloDeConexion } from '../../componentes/FalloDeConexion';
import { Icono } from '../../componentes/iconos';
import { Mensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';
import { BloqueCondicionMedica, SeccionEvaluacionSamu } from './Evaluacion';
import { ESTADO, fecha, INSTITUCION, PAPEL, textoTerritorio } from './etiquetas';

/**
 * Bandeja del operador (P4.2). Reproduce la tabla de Incidents.jsx del origen (efc1bce8) sin el
 * formulario telefonico ni los filtros de estado. Conserva el orden de la API (FIFO) y no consulta
 * periodicamente: «Actualizar» vuelve a pedir la primera pagina. Los avisos llegan en P8.
 */

export const RUTA_BANDEJA = '/panel/operador/incidentes';

type Estado =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly elementos: readonly FilaBandeja[]; readonly siguiente: string | null }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' };

/**
 * Ultima bandeja vista, solo en memoria y por usuario, para volver del resumen a la misma posicion.
 * No se guarda en el navegador y se descarta al pulsar «Actualizar».
 */
const memoria = new Map<string, { elementos: readonly FilaBandeja[]; siguiente: string | null; desplazamiento: number }>();

export function olvidarBandeja(): void {
  memoria.clear();
}

function Etiquetas({ fila }: { fila: FilaBandeja }) {
  return (
    <ul className="incident-indicators" aria-label="Indicadores">
      <li className="priority-badge priority-badge--unknown">
        <Icono nombre="reloj" />
        <span>Prioridad: Sin evaluar</span>
      </li>
      {fila.condicionMedicaPorConfirmar ? (
        <li className="pill warn">
          <Icono nombre="aviso" />
          <span>Condición médica por confirmar</span>
        </li>
      ) : null}
    </ul>
  );
}

export function Bandeja() {
  const { sesion, expirar } = useSesion();
  const usuarioId = sesion.estado === 'autenticado' ? sesion.usuario.id : '';
  const recordado = memoria.get(usuarioId);
  const [datos, setDatos] = useState<Estado>(
    recordado ? { estado: 'listo', elementos: recordado.elementos, siguiente: recordado.siguiente } : { estado: 'cargando' },
  );
  const [version, setVersion] = useState(recordado ? -1 : 0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [falloMas, setFalloMas] = useState(false);

  useLayoutEffect(() => {
    if (recordado && recordado.desplazamiento > 0) window.scrollTo(0, recordado.desplazamiento);
    // Solo al montar: restaura la posicion de la visita anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (version < 0) return;
    const control = new AbortController();
    api
      .bandeja(null, control.signal)
      .then((r) => {
        if (r.tipo === 'ok') setDatos({ estado: 'listo', elementos: r.datos.elementos, siguiente: r.datos.siguiente });
        else if (r.tipo === 'error' && r.estado === 401) expirar();
        else if (r.tipo === 'error' && r.estado === 403) setDatos({ estado: 'sin-permiso' });
        else setDatos({ estado: 'fallo', causa: r.tipo === 'red' ? 'red' : 'servicio' });
      })
      .catch(() => {
        /* cancelada al salir */
      });
    return () => control.abort();
  }, [version, expirar]);

  useEffect(() => {
    if (datos.estado === 'listo' && usuarioId) {
      memoria.set(usuarioId, { elementos: datos.elementos, siguiente: datos.siguiente, desplazamiento: memoria.get(usuarioId)?.desplazamiento ?? 0 });
    }
  }, [datos, usuarioId]);

  const actualizar = useCallback(() => {
    memoria.delete(usuarioId);
    setFalloMas(false);
    setDatos({ estado: 'cargando' });
    setVersion((v) => (v < 0 ? 1 : v + 1));
  }, [usuarioId]);

  async function cargarMas() {
    if (datos.estado !== 'listo' || !datos.siguiente || cargandoMas) return;
    setCargandoMas(true);
    setFalloMas(false);
    const r = await api.bandeja(datos.siguiente);
    setCargandoMas(false);
    if (r.tipo === 'ok') {
      setDatos({ estado: 'listo', elementos: [...datos.elementos, ...r.datos.elementos], siguiente: r.datos.siguiente });
    } else if (r.tipo === 'error' && r.estado === 401) expirar();
    else setFalloMas(true);
  }

  const recordarPosicion = () => {
    const actual = memoria.get(usuarioId);
    if (actual) memoria.set(usuarioId, { ...actual, desplazamiento: window.scrollY });
  };

  return (
    <section className="panel" aria-labelledby="titulo-bandeja">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Bandeja</span>
          <h2 id="titulo-bandeja">Incidentes de tu sede</h2>
        </div>
        <Boton variante="secundario" onClick={actualizar} cargando={datos.estado === 'cargando'}>
          Actualizar
        </Boton>
      </div>
      <p>En orden de llegada, del más antiguo al más reciente. La lista no se actualiza sola: usa «Actualizar».</p>

      {datos.estado === 'cargando' ? (
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Cargando la bandeja…</span>
        </p>
      ) : null}
      {datos.estado === 'fallo' ? <FalloDeConexion tipo={datos.causa} onReintentar={actualizar} /> : null}
      {datos.estado === 'sin-permiso' ? (
        <Mensaje tipo="error" titulo="No puedes consultar la bandeja">
          Tu cuenta no tiene permiso o tu sede no está habilitada para atención.
        </Mensaje>
      ) : null}

      {datos.estado === 'listo' && datos.elementos.length === 0 ? (
        <p className="empty">No hay incidentes asignados a tu sede.</p>
      ) : null}

      {datos.estado === 'listo' && datos.elementos.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <caption className="solo-lectores">Incidentes de tu sede en orden de llegada</caption>
              <thead>
                <tr>
                  <th scope="col">Incidente</th>
                  <th scope="col">Distrito</th>
                  <th scope="col">Tu institución</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Registro</th>
                </tr>
              </thead>
              <tbody>
                {datos.elementos.map((f) => (
                  <tr key={f.id} className="incident-list-row">
                    <td>
                      <Link className="incident-list-link" to={`${RUTA_BANDEJA}/${f.id}`} onClick={recordarPosicion}>
                        <strong>{f.categoria.nombre ?? 'Categoría no disponible'}</strong>
                        <small>{f.referencia}</small>
                      </Link>
                      <Etiquetas fila={f} />
                    </td>
                    <td>{f.distrito ? (f.distrito.nombre ?? f.distrito.id) : 'Sin distrito resuelto'}</td>
                    <td>
                      <span className="pill"><Icono nombre="info" />{PAPEL[f.papel]}</span>
                    </td>
                    <td>
                      <span className="pill"><Icono nombre={f.estado === 'CERRADO' ? 'exito' : 'reloj'} />{ESTADO[f.estado] ?? f.estado}</span>
                    </td>
                    <td>{fecha(f.registradoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {falloMas ? (
            <Mensaje tipo="error" titulo="No pudimos cargar más incidentes">
              Revisa tu conexión e inténtalo de nuevo.
            </Mensaje>
          ) : null}
          {datos.siguiente ? (
            <div className="cargar-mas">
              <Boton variante="secundario" onClick={() => void cargarMas()} cargando={cargandoMas}>
                Cargar más
              </Boton>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

type EstadoResumen =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly resumen: ResumenIncidente }
  | { readonly estado: 'no-disponible' }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' };

/**
 * Resumen limitado de un incidente de la bandeja. Ofrece solo las acciones que la API tiene: precisar
 * la condicion medica y, para SAMU participante, la evaluacion rapida (P5.1). Sin «Asumir caso» (P6).
 */
export function ResumenIncidenteVista({ id }: { id: string }) {
  const { expirar } = useSesion();
  const [datos, setDatos] = useState<EstadoResumen>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const actualizado = (texto: string) => {
    setAviso(texto);
    setIntento((n) => n + 1);
  };

  useEffect(() => {
    const control = new AbortController();
    api
      .resumenIncidente(id, control.signal)
      .then((r) => {
        if (r.tipo === 'ok') setDatos({ estado: 'listo', resumen: r.datos });
        else if (r.tipo === 'error' && r.estado === 401) expirar();
        else if (r.tipo === 'error' && r.estado === 404) setDatos({ estado: 'no-disponible' });
        else if (r.tipo === 'error' && r.estado === 403) setDatos({ estado: 'sin-permiso' });
        else setDatos({ estado: 'fallo', causa: r.tipo === 'red' ? 'red' : 'servicio' });
      })
      .catch(() => {
        /* cancelada al salir */
      });
    return () => control.abort();
  }, [id, intento, expirar]);

  const volver = (
    <BotonEnlace variante="secundario" to={RUTA_BANDEJA}>
      Volver a la bandeja
    </BotonEnlace>
  );

  if (datos.estado === 'cargando') {
    return (
      <p role="status" className="pendiente">
        <Icono nombre="reloj" />
        <span>Cargando el incidente…</span>
      </p>
    );
  }
  if (datos.estado === 'fallo') {
    return (
      <>
        <FalloDeConexion
          tipo={datos.causa}
          onReintentar={() => {
            setDatos({ estado: 'cargando' });
            setIntento((n) => n + 1);
          }}
        />
        {volver}
      </>
    );
  }
  if (datos.estado === 'no-disponible' || datos.estado === 'sin-permiso') {
    return (
      <>
        <Mensaje tipo="error" titulo={datos.estado === 'no-disponible' ? 'Incidente no disponible' : 'No puedes consultar este incidente'}>
          {datos.estado === 'no-disponible'
            ? 'No existe o no corresponde a tu sede.'
            : 'Tu cuenta no tiene permiso o tu sede no está habilitada para atención.'}
        </Mensaje>
        {volver}
      </>
    );
  }

  const r = datos.resumen;
  return (
    <div className="page-stack">
      <div>{volver}</div>
      {aviso ? (
        <div role="status">
          <Mensaje tipo="exito" titulo={aviso}>
            El resumen se actualizó con la condición vigente.
          </Mensaje>
        </div>
      ) : null}
      <div className="detail-grid">
        <section className="panel" aria-labelledby="titulo-resumen">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{r.referencia}</span>
              <h2 id="titulo-resumen">{r.categoria.nombre ?? 'Categoría no disponible'}</h2>
            </div>
            <span className="pill"><Icono nombre={r.estado === 'CERRADO' ? 'exito' : 'reloj'} />{ESTADO[r.estado] ?? r.estado}</span>
          </div>
          <Etiquetas fila={r} />
          <dl className="kv">
            <dt>Tu institución</dt>
            <dd>{PAPEL[r.papel]}</dd>
            <dt>Distrito</dt>
            <dd>{textoTerritorio(r.territorio)}</dd>
            <dt>Ocurrió</dt>
            <dd>
              {r.ocurrencia.modo === 'ahora' ? 'En el momento del reporte' : 'Antes del reporte'} · {fecha(r.ocurrencia.instante)}
            </dd>
            <dt>Registro</dt>
            <dd>{fecha(r.registradoEn)}</dd>
            <dt>Otras instituciones</dt>
            <dd>{r.otrasInstituciones.length ? r.otrasInstituciones.map((i) => INSTITUCION[i] ?? i).join(', ') : 'Ninguna'}</dd>
          </dl>
          <p className="description">{r.descripcion}</p>
        </section>
        <BloqueCondicionMedica resumen={r} onActualizado={actualizado} />
        {r.accesoSanitario ? <SeccionEvaluacionSamu resumen={r} version={intento} onActualizado={actualizado} /> : null}
      </div>
    </div>
  );
}
