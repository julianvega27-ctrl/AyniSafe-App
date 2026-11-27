import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api, type AsignacionAdmin, type CandidatoReasignacion } from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { Campo, CampoSeleccion } from '../../componentes/Campo';
import { Dialogo } from '../../componentes/Dialogo';
import { FalloDeConexion } from '../../componentes/FalloDeConexion';
import { Icono } from '../../componentes/iconos';
import { Mensaje, type TipoMensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';
import { CONFLICTO_ATENCION, ESTADO, fecha, INSTITUCION } from './etiquetas';

/**
 * Bloque «Responsables activos» del inicio del administrador (P6). Lista las asignaciones activas de
 * incidentes abiertos y permite liberarlas o reasignarlas con motivo. El administrador no ve el caso
 * ni adquiere permisos de atencion. Misma composicion que «Enrutamiento pendiente».
 */

type Estado =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly elementos: readonly AsignacionAdmin[] }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' };

interface Aviso {
  readonly tipo: TipoMensaje;
  readonly titulo: string;
  readonly texto?: string;
}

export function ResponsablesActivos() {
  const { expirar } = useSesion();
  const [datos, setDatos] = useState<Estado>({ estado: 'cargando' });
  const [version, setVersion] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [seleccion, setSeleccion] = useState<{ readonly asignacion: AsignacionAdmin; readonly modo: 'liberar' | 'reasignar' } | null>(null);

  useEffect(() => {
    const control = new AbortController();
    api
      .asignaciones(control.signal)
      .then((r) => {
        if (r.tipo === 'ok') setDatos({ estado: 'listo', elementos: r.datos.elementos });
        else if (r.tipo === 'error' && r.estado === 401) expirar();
        else if (r.tipo === 'error' && r.estado === 403) setDatos({ estado: 'sin-permiso' });
        else setDatos({ estado: 'fallo', causa: r.tipo === 'red' ? 'red' : 'servicio' });
      })
      .catch(() => {
        /* cancelada al salir */
      });
    return () => control.abort();
  }, [version, expirar]);

  const actualizar = useCallback(() => {
    setDatos({ estado: 'cargando' });
    setVersion((v) => v + 1);
  }, []);

  return (
    <section className="panel" aria-labelledby="titulo-responsables">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Atención</span>
          <h2 id="titulo-responsables">Responsables activos</h2>
        </div>
        <Boton variante="secundario" onClick={actualizar} cargando={datos.estado === 'cargando'}>
          Actualizar
        </Boton>
      </div>
      <p>Liberar o reasignar es una excepción administrativa con motivo. No da acceso al detalle del caso.</p>
      {aviso ? (
        <div role="status">
          <Mensaje tipo={aviso.tipo} titulo={aviso.titulo}>
            {aviso.texto}
          </Mensaje>
        </div>
      ) : null}
      {datos.estado === 'cargando' ? (
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Cargando responsables…</span>
        </p>
      ) : null}
      {datos.estado === 'fallo' ? <FalloDeConexion tipo={datos.causa} onReintentar={actualizar} /> : null}
      {datos.estado === 'sin-permiso' ? (
        <Mensaje tipo="error" titulo="No puedes consultar los responsables">
          Tu cuenta no tiene permiso para esta sección.
        </Mensaje>
      ) : null}
      {datos.estado === 'listo' && datos.elementos.length === 0 ? <p className="empty">No hay casos abiertos con responsable asignado.</p> : null}
      {datos.estado === 'listo' && datos.elementos.length > 0 ? (
        <div className="table-wrap">
          <table>
            <caption className="solo-lectores">Asignaciones activas de incidentes abiertos</caption>
            <thead>
              <tr>
                <th scope="col">Incidente</th>
                <th scope="col">Institución y sede</th>
                <th scope="col">Responsable</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {datos.elementos.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.referencia}</strong>
                    <small>{ESTADO[a.estado]}</small>
                  </td>
                  <td>
                    {INSTITUCION[a.institucion]}
                    <small>{a.sede.nombre ?? 'Sede no disponible'}</small>
                  </td>
                  <td>
                    {a.responsable.nombre ?? 'Operador'}
                    <small>Desde {fecha(a.asignadaEn)}</small>
                    {a.requiereReasignacion ? (
                      <span className="pill warn">
                        <Icono nombre="aviso" />
                        Requiere reasignación
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <div className="acciones-tarjeta">
                      <Boton variante="secundario" onClick={() => setSeleccion({ asignacion: a, modo: 'reasignar' })}>
                        Reasignar
                      </Boton>
                      <Boton variante="secundario" onClick={() => setSeleccion({ asignacion: a, modo: 'liberar' })}>
                        Liberar
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {seleccion ? (
        <DialogoAsignacion
          asignacion={seleccion.asignacion}
          modo={seleccion.modo}
          onCancelar={() => setSeleccion(null)}
          onResultado={(a) => {
            setSeleccion(null);
            setAviso(a);
            actualizar();
          }}
        />
      ) : null}
    </section>
  );
}

function DialogoAsignacion({ asignacion, modo, onCancelar, onResultado }: {
  asignacion: AsignacionAdmin;
  modo: 'liberar' | 'reasignar';
  onCancelar: () => void;
  onResultado: (a: Aviso) => void;
}) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const [motivo, setMotivo] = useState('');
  const [operadorId, setOperadorId] = useState('');
  const [candidatos, setCandidatos] = useState<{ estado: 'cargando' } | { estado: 'listo'; lista: readonly CandidatoReasignacion[] } | { estado: 'fallo' }>(
    modo === 'reasignar' ? { estado: 'cargando' } : { estado: 'listo', lista: [] },
  );
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    if (modo !== 'reasignar') return;
    const control = new AbortController();
    api
      .candidatosReasignacion(asignacion.id, control.signal)
      .then((r) => {
        if (r.tipo === 'ok') setCandidatos({ estado: 'listo', lista: r.datos.elementos });
        else if (r.tipo === 'error' && r.estado === 401) expirar();
        else setCandidatos({ estado: 'fallo' });
      })
      .catch(() => {
        /* cancelada */
      });
    return () => control.abort();
  }, [asignacion.id, modo, expirar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const locales: Record<string, string> = {};
    if (modo === 'reasignar' && !operadorId) locales.operadorId = 'Elige un operador.';
    const n = [...motivo.trim()].length;
    if (n < 10 || n > 500) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    setErrores(locales);
    if (Object.keys(locales).length) return;
    setEnviando(true);
    setFallo(null);
    const r = modo === 'reasignar'
      ? await api.reasignarAsignacion(asignacion.id, operadorId, motivo.trim())
      : await api.liberarAsignacion(asignacion.id, motivo.trim());
    setEnviando(false);
    if (r.tipo === 'ok') {
      return onResultado({
        tipo: 'exito',
        titulo: modo === 'reasignar' ? `Caso ${asignacion.referencia} reasignado` : `Asignación de ${asignacion.referencia} liberada`,
        texto: modo === 'liberar' ? 'Otro operador de la institución puede asumirlo.' : undefined,
      });
    }
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.estado === 400) return setErrores(r.campos ?? { motivo: 'Revisa los datos.' });
    if (r.tipo === 'error' && r.estado === 404) return onResultado({ tipo: 'aviso', titulo: 'La asignación ya no está activa', texto: 'La lista se actualizó.' });
    if (r.tipo === 'error' && r.codigo === 'DESTINO_NO_VALIDO') return setFallo(CONFLICTO_ATENCION.DESTINO_NO_VALIDO!);
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) {
      return onResultado({ tipo: 'aviso', titulo: 'No se cambió la asignación', texto: CONFLICTO_ATENCION[r.codigo] });
    }
    setFallo('No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.');
  }

  const listo = candidatos.estado === 'listo';
  const sinCandidatos = modo === 'reasignar' && listo && candidatos.lista.length === 0;
  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCancelar}>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
        <h3 id={idTitulo} className="form-grid__completo">
          {modo === 'reasignar' ? 'Reasignar' : 'Liberar'} {asignacion.referencia} ({INSTITUCION[asignacion.institucion]})
        </h3>
        {fallo ? (
          <div className="form-grid__completo" role="status">
            <Mensaje tipo="error" titulo="No se cambió la asignación">{fallo}</Mensaje>
          </div>
        ) : null}
        {candidatos.estado === 'cargando' ? (
          <p role="status" className="pendiente form-grid__completo">
            <Icono nombre="reloj" />
            <span>Cargando operadores…</span>
          </p>
        ) : null}
        {candidatos.estado === 'fallo' ? (
          <div className="form-grid__completo">
            <Mensaje tipo="error" titulo="No pudimos cargar los operadores">Cierra el formulario y vuelve a intentarlo.</Mensaje>
          </div>
        ) : null}
        {sinCandidatos ? (
          <div className="form-grid__completo">
            <Mensaje tipo="aviso" titulo="No hay otro operador elegible">
              Solo se puede reasignar a un operador activo de una sede habilitada de {INSTITUCION[asignacion.institucion]} que participe en el caso.
            </Mensaje>
          </div>
        ) : null}
        {modo === 'reasignar' && listo && candidatos.lista.length > 0 ? (
          <CampoSeleccion etiqueta="Nuevo responsable" value={operadorId} onChange={(e) => setOperadorId(e.target.value)} error={errores.operadorId} required>
            <option value="">Elige un operador</option>
            {candidatos.lista.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {c.sede.nombre}
              </option>
            ))}
          </CampoSeleccion>
        ) : null}
        {listo && !sinCandidatos ? (
          <Campo
            etiqueta="Motivo"
            ayuda="Entre 10 y 500 caracteres. Queda registrado con tu cuenta."
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
            error={errores.motivo}
            required
          />
        ) : null}
        <div className="acciones-tarjeta form-grid__completo">
          {listo && !sinCandidatos ? (
            <Boton type="submit" cargando={enviando}>
              {modo === 'reasignar' ? 'Reasignar' : 'Liberar asignación'}
            </Boton>
          ) : null}
          <Boton variante="secundario" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
