import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { api, type Faltante, type PendienteEnrutamiento, type Sede } from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { Dialogo } from '../../componentes/Dialogo';
import { Campo, CampoSeleccion } from '../../componentes/Campo';
import { FalloDeConexion } from '../../componentes/FalloDeConexion';
import { Icono } from '../../componentes/iconos';
import { Mensaje, type TipoMensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';
import { fecha, INSTITUCION, MOTIVO_FALTANTE, PAPEL, REQUISITO_DESIGNACION, textoTerritorio } from './etiquetas';

/**
 * Inicio del administrador (P4.2): solo el bloque «Enrutamiento pendiente» (RF35). Lista FIFO de los
 * casos sin sede para alguna institucion destinataria, con designacion auditada de una sede habilitada
 * y reevaluacion tras corregir la configuracion. El resto del resumen administrativo sigue pendiente
 * (P8). El administrador no ve descripcion ni datos sanitarios.
 */

type Estado =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly elementos: readonly PendienteEnrutamiento[]; readonly siguiente: string | null }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' };

interface Aviso {
  readonly tipo: TipoMensaje;
  readonly titulo: string;
  readonly texto?: string;
  readonly requisitos?: readonly string[];
}

interface Seleccion {
  readonly pendiente: PendienteEnrutamiento;
  readonly faltante: Faltante;
}

const CONFLICTO: Record<string, string> = {
  FALTANTE_INEXISTENTE: 'El caso ya no necesita una sede de esa institución. La lista se actualizó.',
  ENRUTAMIENTO_NO_PENDIENTE: 'El caso ya no está pendiente. La lista se actualizó.',
};

export function EnrutamientoPendiente() {
  const { expirar } = useSesion();
  const [datos, setDatos] = useState<Estado>({ estado: 'cargando' });
  const [version, setVersion] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [reevaluando, setReevaluando] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    api
      .pendientesEnrutamiento(null, control.signal)
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

  const actualizar = useCallback(() => {
    setDatos({ estado: 'cargando' });
    setVersion((v) => v + 1);
  }, []);

  async function cargarMas() {
    if (datos.estado !== 'listo' || !datos.siguiente || cargandoMas) return;
    setCargandoMas(true);
    const r = await api.pendientesEnrutamiento(datos.siguiente);
    setCargandoMas(false);
    if (r.tipo === 'ok') setDatos({ estado: 'listo', elementos: [...datos.elementos, ...r.datos.elementos], siguiente: r.datos.siguiente });
    else if (r.tipo === 'error' && r.estado === 401) expirar();
    else setAviso({ tipo: 'error', titulo: 'No pudimos cargar más casos', texto: 'Revisa tu conexión e inténtalo de nuevo.' });
  }

  async function reevaluar(p: PendienteEnrutamiento) {
    if (reevaluando) return;
    setReevaluando(p.incidenteId);
    setAviso(null);
    const r = await api.reevaluarEnrutamiento(p.incidenteId);
    setReevaluando(null);
    if (r.tipo === 'ok') {
      const resuelto = r.datos.enrutamiento.resultado === 'ENRUTADO';
      setAviso(
        resuelto
          ? { tipo: 'exito', titulo: `Caso ${p.referencia} asignado`, texto: 'Todas las instituciones tienen sede.' }
          : { tipo: 'aviso', titulo: `El caso ${p.referencia} sigue pendiente`, texto: 'Aún no hay sedes elegibles para las instituciones que faltan.' },
      );
      if (resuelto) actualizar();
      return;
    }
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.codigo && CONFLICTO[r.codigo]) {
      setAviso({ tipo: 'aviso', titulo: 'No se aplicó la reevaluación', texto: CONFLICTO[r.codigo] });
      actualizar();
      return;
    }
    setAviso(avisoGenerico(r.tipo === 'error' && r.estado === 403));
  }

  return (
    <section className="panel" aria-labelledby="titulo-pendientes">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Inicio</span>
          <h2 id="titulo-pendientes">Enrutamiento pendiente</h2>
        </div>
        <Boton variante="secundario" onClick={actualizar} cargando={datos.estado === 'cargando'}>
          Actualizar
        </Boton>
      </div>
      <p>
        Casos sin sede para alguna institución destinataria, del más antiguo al más reciente. Corrige la cobertura y reevalúa, o designa
        una sede habilitada como excepción para el caso.
      </p>

      {aviso ? (
        <div role="status">
          <Mensaje tipo={aviso.tipo} titulo={aviso.titulo}>
            {aviso.texto}
            {aviso.requisitos?.length ? (
              <ul className="faltantes">
                {aviso.requisitos.map((q) => (
                  <li key={q}>{REQUISITO_DESIGNACION[q] ?? q}</li>
                ))}
              </ul>
            ) : null}
          </Mensaje>
        </div>
      ) : null}

      {datos.estado === 'cargando' ? (
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Cargando los casos pendientes…</span>
        </p>
      ) : null}
      {datos.estado === 'fallo' ? <FalloDeConexion tipo={datos.causa} onReintentar={actualizar} /> : null}
      {datos.estado === 'sin-permiso' ? (
        <Mensaje tipo="error" titulo="No tienes permiso">
          Tu cuenta no puede consultar los casos pendientes.
        </Mensaje>
      ) : null}
      {datos.estado === 'listo' && datos.elementos.length === 0 ? <p className="empty">No hay casos sin asignar.</p> : null}

      {datos.estado === 'listo' && datos.elementos.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <caption className="solo-lectores">Casos con enrutamiento pendiente en orden de llegada</caption>
              <thead>
                <tr>
                  <th scope="col">Incidente</th>
                  <th scope="col">Distrito</th>
                  <th scope="col">Registro</th>
                  <th scope="col">Instituciones sin sede</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.elementos.map((p) => (
                  <tr key={p.incidenteId}>
                    <td>
                      <strong>{p.categoria.nombre ?? 'Categoría no disponible'}</strong>
                      <br />
                      <small>{p.referencia}</small>
                    </td>
                    <td>{textoTerritorio(p.territorio)}</td>
                    <td>{fecha(p.registradoEn)}</td>
                    <td>
                      <ul className="lista-faltantes">
                        {p.faltantes.map((f) => (
                          <li key={f.institucion}>
                            <span className="pill warn">
                              <Icono nombre="aviso" />
                              <span>
                                {INSTITUCION[f.institucion]} · {PAPEL[f.papel]}
                              </span>
                            </span>
                            <small>{MOTIVO_FALTANTE[f.motivo]}</small>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setAviso(null);
                                setSeleccion({ pendiente: p, faltante: f });
                              }}
                            >
                              Designar sede<span className="solo-lectores"> de {INSTITUCION[f.institucion]} para {p.referencia}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        disabled={reevaluando !== null}
                        aria-busy={reevaluando === p.incidenteId || undefined}
                        onClick={() => void reevaluar(p)}
                      >
                        {reevaluando === p.incidenteId ? 'Reevaluando…' : 'Reevaluar'}
                        <span className="solo-lectores"> {p.referencia}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {datos.siguiente ? (
            <div className="cargar-mas">
              <Boton variante="secundario" onClick={() => void cargarMas()} cargando={cargandoMas}>
                Cargar más
              </Boton>
            </div>
          ) : null}
        </>
      ) : null}

      {seleccion ? (
        <FormularioDesignacion
          key={`${seleccion.pendiente.incidenteId}-${seleccion.faltante.institucion}`}
          seleccion={seleccion}
          onCancelar={() => setSeleccion(null)}
          onResultado={(a, recargar) => {
            setAviso(a);
            if (recargar) {
              setSeleccion(null);
              actualizar();
            }
          }}
        />
      ) : null}
    </section>
  );
}

function avisoGenerico(prohibido: boolean): Aviso {
  return prohibido
    ? { tipo: 'error', titulo: 'No tienes permiso', texto: 'Tu cuenta no puede hacer este cambio.' }
    : { tipo: 'error', titulo: 'No pudimos confirmar el cambio', texto: 'Revisa tu conexión y actualiza la lista antes de volver a intentarlo.' };
}

type Sedes = { readonly estado: 'cargando' } | { readonly estado: 'listo'; readonly sedes: readonly Sede[] } | { readonly estado: 'fallo' };

function FormularioDesignacion({
  seleccion,
  onCancelar,
  onResultado,
}: {
  seleccion: Seleccion;
  onCancelar: () => void;
  onResultado: (aviso: Aviso, recargar: boolean) => void;
}) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const { pendiente, faltante } = seleccion;
  const [sedes, setSedes] = useState<Sedes>({ estado: 'cargando' });
  const [sedeId, setSedeId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<Aviso | null>(null);

  useEffect(() => {
    const control = new AbortController();
    api
      .sedes(control.signal)
      .then((r) => {
        if (r.tipo === 'ok') {
          setSedes({
            estado: 'listo',
            sedes: r.datos.sedes.filter((s) => s.institucionId === faltante.institucion && s.activa && s.habilitadaAtencion),
          });
        } else if (r.tipo === 'error' && r.estado === 401) expirar();
        else setSedes({ estado: 'fallo' });
      })
      .catch(() => {
        /* cancelada */
      });
    return () => control.abort();
  }, [faltante.institucion, expirar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const locales: Record<string, string> = {};
    if (!sedeId) locales.sedeId = 'Elige una sede.';
    const largo = [...motivo.trim()].length;
    if (largo < 10 || largo > 500) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    setErrores(locales);
    if (Object.keys(locales).length) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.designarSede(pendiente.incidenteId, { institucion: faltante.institucion, sedeId, motivo: motivo.trim() });
    setEnviando(false);
    if (r.tipo === 'ok') {
      const resuelto = r.datos.enrutamiento.resultado === 'ENRUTADO';
      onResultado(
        {
          tipo: 'exito',
          titulo: `Sede designada para ${pendiente.referencia}`,
          texto: resuelto ? 'El caso ya tiene sede para todas sus instituciones.' : 'El caso sigue pendiente para otras instituciones.',
        },
        true,
      );
      return;
    }
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.codigo === 'SEDE_NO_DESIGNABLE') {
      setFallo({ tipo: 'error', titulo: 'No se designó la sede', texto: 'La sede elegida no cumple los requisitos:', requisitos: r.requisitos ?? [] });
      return;
    }
    if (r.tipo === 'error' && r.codigo && CONFLICTO[r.codigo]) {
      onResultado({ tipo: 'aviso', titulo: 'No se designó la sede', texto: CONFLICTO[r.codigo] }, true);
      return;
    }
    if (r.tipo === 'error' && r.estado === 400) {
      setErrores(r.campos ?? { motivo: 'Revisa los datos.' });
      return;
    }
    if (r.tipo === 'error' && r.estado === 404) {
      onResultado({ tipo: 'aviso', titulo: 'El caso ya no existe', texto: 'La lista se actualizó.' }, true);
      return;
    }
    setFallo(avisoGenerico(r.tipo === 'error' && r.estado === 403));
  }

  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCancelar}>
    <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
      <h3 id={idTitulo} className="form-grid__completo">
        Designar sede de {INSTITUCION[faltante.institucion]} ({PAPEL[faltante.papel].toLowerCase()}) para {pendiente.referencia}
      </h3>
      {fallo ? <div className="form-grid__completo" role="status"><Mensaje tipo={fallo.tipo} titulo={fallo.titulo}>
        {fallo.texto}
        {fallo.requisitos?.length ? <ul>{fallo.requisitos.map(q => <li key={q}>{REQUISITO_DESIGNACION[q] ?? q}</li>)}</ul> : null}
      </Mensaje></div> : null}
      {sedes.estado === 'cargando' ? (
        <p role="status" className="pendiente form-grid__completo">
          <Icono nombre="reloj" />
          <span>Cargando sedes…</span>
        </p>
      ) : null}
      {sedes.estado === 'fallo' ? (
        <div className="form-grid__completo">
          <Mensaje tipo="error" titulo="No pudimos cargar las sedes">
            Cierra el formulario y vuelve a intentarlo.
          </Mensaje>
        </div>
      ) : null}
      {sedes.estado === 'listo' && sedes.sedes.length === 0 ? (
        <div className="form-grid__completo">
          <Mensaje tipo="aviso" titulo={`No hay sedes de ${INSTITUCION[faltante.institucion]} habilitadas`}>
            Habilita una sede en «Instituciones y sedes» y vuelve a intentarlo.
          </Mensaje>
        </div>
      ) : null}
      {sedes.estado === 'listo' && sedes.sedes.length > 0 ? (
        <>
          <CampoSeleccion etiqueta="Sede habilitada" value={sedeId} onChange={(e) => setSedeId(e.target.value)} error={errores.sedeId} required>
            <option value="">Elige una sede</option>
            {sedes.sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
                {s.esDemostracion ? ' (demostración)' : ''}
              </option>
            ))}
          </CampoSeleccion>
          <Campo
            etiqueta="Motivo de la designación"
            ayuda="Entre 10 y 500 caracteres. Queda registrado con tu cuenta."
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
            error={errores.motivo}
            required
          />
        </>
      ) : null}
      <div className="acciones-tarjeta form-grid__completo">
        {sedes.estado === 'listo' && sedes.sedes.length > 0 ? (
          <Boton type="submit" cargando={enviando}>
            Designar sede
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
