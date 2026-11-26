import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  api,
  type CategoriaCatalogo,
  type DistritoCatalogo,
  type EstadoOperador,
  type Institucion,
  type OperadorSede,
  type Resultado,
  type Sede,
  type TipoInstitucion,
} from '../../api/cliente';
import { Boton, BotonEnlace } from '../../componentes/Boton';
import { Campo, CampoSeleccion } from '../../componentes/Campo';
import { FalloDeConexion } from '../../componentes/FalloDeConexion';
import { Icono, type NombreIcono } from '../../componentes/iconos';
import { Mensaje, type TipoMensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';

/**
 * Organizacion institucional (P3.2): Instituciones y sedes, Operadores y Coberturas. Reproduce la
 * composicion de Organization.jsx del origen (efc1bce8): un panel por institucion con su accion de
 * edicion en el encabezado, tarjetas de sede y paneles de alta con formulario compacto. La
 * autorizacion la decide la API: un 401 lleva al acceso y un 403 muestra «No tienes permiso».
 */

interface Aviso {
  readonly tipo: TipoMensaje;
  readonly titulo: string;
  readonly texto?: string;
  readonly faltantes?: readonly string[];
  readonly accion?: ReactNode;
}

const FALTANTE: Record<string, string> = {
  institucion_activa: 'La institución debe estar activa.',
  sede_activa: 'La sede debe estar activa.',
  sede_verificada: 'Registra la verificación documental de la sede.',
  cobertura: 'Elige al menos un distrito de cobertura.',
  competencias: 'Elige al menos una categoría que atiende.',
  operador_activo: 'Al menos un operador debe haber activado su cuenta y estar activo.',
};

const CONFLICTO: Record<string, string> = {
  SEDE_HABILITADA: 'La sede está habilitada para atención: deshabilítala antes de este cambio.',
  ULTIMO_OPERADOR_ACTIVO: 'Es el único operador activo de una sede habilitada. Activa a otro operador o deshabilita la sede antes de suspenderlo.',
  INVITACION_NO_APLICABLE: 'Solo se puede reenviar la invitación de una cuenta pendiente de activación.',
  SEDE_EXISTENTE: 'Ya existe una sede con ese nombre en esta institución.',
  EMAIL_IN_USE: 'Este correo ya pertenece a otra cuenta.',
  NOT_FOUND: 'El registro ya no existe. Recarga la lista.',
};

const ESTADO_OPERADOR: Record<EstadoOperador, string> = {
  pendiente_activacion: 'Pendiente de activación',
  activo: 'Activo',
  suspendido: 'Suspendido',
};

type Listo = {
  readonly estado: 'listo';
  readonly instituciones: readonly Institucion[];
  readonly sedes: readonly Sede[];
  readonly distritos: readonly DistritoCatalogo[];
  readonly categorias: readonly CategoriaCatalogo[];
};
type Datos =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'sin-permiso' }
  | { readonly estado: 'fallo'; readonly causa: 'red' | 'servicio' }
  | Listo;

type Clasificado<T> = { tipo: 'ok'; datos: T } | { tipo: 'detenido' } | { tipo: 'aviso'; aviso: Aviso };

/** Traduce un resultado: 401 expira la sesion, 403 avisa sin datos, el resto se convierte en aviso. */
function useClasificar() {
  const { expirar } = useSesion();
  return useCallback(
    <T,>(r: Resultado<T>): Clasificado<T> => {
      if (r.tipo === 'ok') return { tipo: 'ok', datos: r.datos };
      if (r.tipo === 'error' && r.estado === 401) {
        expirar();
        return { tipo: 'detenido' };
      }
      if (r.tipo === 'error' && r.estado === 403) {
        return { tipo: 'aviso', aviso: { tipo: 'error', titulo: 'No tienes permiso', texto: 'Tu cuenta no puede hacer este cambio.' } };
      }
      if (r.tipo === 'error' && r.codigo === 'REQUISITOS_HABILITACION') {
        return { tipo: 'aviso', aviso: { tipo: 'aviso', titulo: 'Aún no se puede habilitar la sede', faltantes: r.faltantes ?? [] } };
      }
      if (r.tipo === 'error' && r.codigo && CONFLICTO[r.codigo]) {
        return { tipo: 'aviso', aviso: { tipo: 'error', titulo: 'No se aplicó el cambio', texto: CONFLICTO[r.codigo] } };
      }
      if (r.tipo === 'error') {
        return { tipo: 'aviso', aviso: { tipo: 'error', titulo: 'Revisa los datos', texto: 'La solicitud no es válida.' } };
      }
      return {
        tipo: 'aviso',
        aviso: {
          tipo: 'error',
          titulo: 'No pudimos confirmar el cambio',
          texto: 'Revisa tu conexión y recarga la información antes de volver a intentarlo.',
        },
      };
    },
    [expirar],
  );
}

function useDatosOrganizacion() {
  const { expirar } = useSesion();
  const [datos, setDatos] = useState<Datos>({ estado: 'cargando' });
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const control = new AbortController();
    Promise.all([
      api.instituciones(control.signal),
      api.sedes(control.signal),
      api.distritos(control.signal),
      api.categorias(control.signal),
    ])
      .then(([inst, sedes, dist, cat]) => {
        const todos = [inst, sedes, dist, cat];
        if (todos.some((r) => r.tipo === 'error' && r.estado === 401)) {
          expirar();
          return;
        }
        if (todos.some((r) => r.tipo === 'error' && r.estado === 403)) {
          setDatos({ estado: 'sin-permiso' });
          return;
        }
        if (inst.tipo === 'ok' && sedes.tipo === 'ok' && dist.tipo === 'ok' && cat.tipo === 'ok') {
          setDatos({
            estado: 'listo',
            instituciones: inst.datos.instituciones,
            sedes: sedes.datos.sedes,
            distritos: dist.datos.distritos,
            categorias: cat.datos.categorias,
          });
          return;
        }
        setDatos({ estado: 'fallo', causa: todos.some((r) => r.tipo === 'red') ? 'red' : 'servicio' });
      })
      .catch(() => {
        /* cancelada al salir de la seccion */
      });
    return () => control.abort();
  }, [version, expirar]);

  return { datos, recargar };
}

/** Panel del origen (ui.jsx): encabezado con titulo y accion opcional a la derecha. */
function PanelTarjeta({ titulo, eyebrow, accion, children }: { titulo: string; eyebrow?: string; accion?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="panel-heading">
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2 id={id}>{titulo}</h2>
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

function AvisoMensaje({ aviso }: { aviso: Aviso | null }) {
  if (!aviso) return null;
  return (
    // La lista va como accion: Mensaje envuelve el texto en un parrafo, que no admite listas.
    <Mensaje
      tipo={aviso.tipo}
      titulo={aviso.titulo}
      accion={
        aviso.faltantes || aviso.accion ? (
          <>
            {aviso.faltantes ? (
              <ul className="faltantes" aria-label="Requisitos faltantes">
                {aviso.faltantes.map((f) => (
                  <li key={f}>{FALTANTE[f] ?? f}</li>
                ))}
              </ul>
            ) : null}
            {aviso.accion}
          </>
        ) : undefined
      }
    >
      {aviso.texto}
    </Mensaje>
  );
}

/** Pill del origen; AyniSafe: siempre con texto e icono, el tono nunca es el unico indicador. */
function Pill({ icono, aviso, children }: { icono: NombreIcono; aviso?: boolean; children: ReactNode }) {
  return (
    <li className={aviso ? 'pill warn' : 'pill'}>
      <Icono nombre={icono} />
      {children}
    </li>
  );
}

function EstadosSede({ sede }: { sede: Sede }) {
  const verificada = sede.verificacion.estado === 'verificada';
  return (
    <ul className="estados" aria-label={`Estado de ${sede.nombre}`}>
      <Pill icono={verificada ? 'exito' : 'aviso'} aviso={!verificada}>
        {verificada ? 'Verificada' : 'Sin verificar'}
      </Pill>
      <Pill icono={sede.habilitadaAtencion ? 'exito' : 'candado'} aviso={!sede.habilitadaAtencion}>
        {sede.habilitadaAtencion ? 'Habilitada para atención' : 'Deshabilitada para atención'}
      </Pill>
      {sede.activa ? null : (
        <Pill icono="aviso" aviso>
          Suspendida
        </Pill>
      )}
      {sede.esDemostracion ? <Pill icono="info">Demostración</Pill> : null}
    </ul>
  );
}

function Contenedor({ datos, recargar, children }: { datos: Datos; recargar: () => void; children: (d: Listo) => ReactNode }) {
  if (datos.estado === 'cargando') {
    return (
      <p role="status" className="pendiente">
        <Icono nombre="reloj" />
        <span>Cargando la organización…</span>
      </p>
    );
  }
  if (datos.estado === 'sin-permiso') {
    return (
      <Mensaje tipo="error" titulo="No tienes permiso">
        Tu cuenta no puede administrar la organización.
      </Mensaje>
    );
  }
  if (datos.estado === 'fallo') return <FalloDeConexion tipo={datos.causa} onReintentar={recargar} />;
  return <div className="page-stack">{children(datos)}</div>;
}

const nombreDistrito = (distritos: readonly DistritoCatalogo[], id: string | null): string =>
  id ? (distritos.find((d) => d.id === id)?.nombre ?? id) : 'Sin ubicación registrada';

// --- Instituciones y sedes ------------------------------------------------------------------

function FormularioInstitucion({ institucion, alCerrar, alGuardar }: { institucion: Institucion; alCerrar: () => void; alGuardar: () => void }) {
  const clasificar = useClasificar();
  const [nombre, setNombre] = useState(institucion.nombre);
  const [contacto, setContacto] = useState(institucion.contacto ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setAviso(null);
    const r = await api.actualizarInstitucion(institucion.id, { nombre, contacto: contacto.trim() === '' ? null : contacto });
    setGuardando(false);
    if (r.tipo === 'error' && r.estado === 400) {
      setErrores(r.campos ?? {});
      return;
    }
    const c = clasificar(r);
    if (c.tipo === 'ok') {
      alCerrar();
      alGuardar();
    } else if (c.tipo === 'aviso') setAviso(c.aviso);
  }

  return (
    <form className="form-grid compact" onSubmit={(e) => void guardar(e)} aria-label={`Editar ${institucion.nombre}`} noValidate>
      <Campo etiqueta="Nombre visible" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} maxLength={120} />
      <Campo etiqueta="Contacto (opcional)" value={contacto} onChange={(e) => setContacto(e.target.value)} error={errores.contacto} maxLength={40} />
      <div className="acciones-tarjeta">
        <Boton type="submit" cargando={guardando}>
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
      </div>
      <div className="form-grid__completo">
        <AvisoMensaje aviso={aviso} />
      </div>
    </form>
  );
}

function TarjetaSede({ sede, distritos, alCambiar }: { sede: Sede; distritos: readonly DistritoCatalogo[]; alCambiar: () => void }) {
  const clasificar = useClasificar();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function alternarActiva() {
    setOcupado(true);
    setAviso(null);
    const c = clasificar(await api.actualizarSede(sede.id, { activa: !sede.activa }));
    setOcupado(false);
    if (c.tipo === 'ok') alCambiar();
    else if (c.tipo === 'aviso') setAviso(c.aviso);
  }

  return (
    <li className="mini-card">
      <strong>{sede.nombre}</strong>
      <span>{nombreDistrito(distritos, sede.distritoUbicacionId)}</span>
      <EstadosSede sede={sede} />
      <BotonEnlace variante="secundario" to={`/panel/administrador/operadores?sede=${encodeURIComponent(sede.id)}`}>
        Operadores de la sede
      </BotonEnlace>
      <button type="button" className={sede.activa ? 'text-button danger' : 'text-button'} onClick={() => void alternarActiva()} disabled={ocupado}>
        {sede.activa ? 'Suspender sede' : 'Reactivar sede'}
      </button>
      <AvisoMensaje aviso={aviso} />
    </li>
  );
}

function PanelInstitucion({ institucion, sedes, distritos, alCambiar }: { institucion: Institucion; sedes: readonly Sede[]; distritos: readonly DistritoCatalogo[]; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  return (
    <PanelTarjeta
      titulo={institucion.nombre}
      accion={
        editando ? null : (
          <button type="button" className="text-button" onClick={() => setEditando(true)} aria-label={`Editar nombre y contacto de ${institucion.nombre}`}>
            Editar nombre y contacto
          </button>
        )
      }
    >
      <p>
        {institucion.activa ? 'Activa' : 'Inactiva'} · Contacto: {institucion.contacto ?? 'sin registrar'}
      </p>
      {editando ? <FormularioInstitucion institucion={institucion} alCerrar={() => setEditando(false)} alGuardar={alCambiar} /> : null}
      {sedes.length > 0 ? (
        <ul className="cards" aria-label={`Sedes de ${institucion.nombre}`}>
          {sedes.map((s) => (
            <TarjetaSede key={s.id} sede={s} distritos={distritos} alCambiar={alCambiar} />
          ))}
        </ul>
      ) : (
        <p className="empty">Esta institución todavía no tiene sedes.</p>
      )}
    </PanelTarjeta>
  );
}

interface ValoresSede {
  institucionId: TipoInstitucion | '';
  nombre: string;
  distrito: string;
  operadorNombre: string;
  operadorCorreo: string;
  demostracion: boolean;
}

const SEDE_VACIA: ValoresSede = { institucionId: '', nombre: '', distrito: '', operadorNombre: '', operadorCorreo: '', demostracion: false };

/** Traduce los campos de la API (`operador.correo`) a los del formulario. */
function erroresSede(campos: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const destino: Record<string, string> = { 'operador.nombre': 'operadorNombre', 'operador.correo': 'operadorCorreo', operador: 'operadorNombre', distritoUbicacionId: 'distrito' };
  const e: Record<string, string> = {};
  for (const [campo, mensaje] of Object.entries(campos ?? {})) e[destino[campo] ?? campo] = mensaje;
  return e;
}

function FormularioSede({ instituciones, distritos, alCrear, recargar }: { instituciones: readonly Institucion[]; distritos: readonly DistritoCatalogo[]; alCrear: () => void; recargar: () => void }) {
  const clasificar = useClasificar();
  const idDemo = useId();
  const idNota = useId();
  const [v, setV] = useState<ValoresSede>(SEDE_VACIA);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const poner = (campo: keyof ValoresSede) => (valor: string | boolean) => setV((x) => ({ ...x, [campo]: valor }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (v.institucionId === '') {
      setErrores({ institucionId: 'Elige la institución.' });
      return;
    }
    setEnviando(true);
    setAviso(null);
    const r = await api.crearSede({
      institucionId: v.institucionId,
      nombre: v.nombre,
      ...(v.distrito ? { distritoUbicacionId: v.distrito } : {}),
      ...(v.demostracion ? { esDemostracion: true } : {}),
      operador: { nombre: v.operadorNombre, correo: v.operadorCorreo },
    });
    setEnviando(false);
    if (r.tipo === 'ok') {
      setErrores({});
      setV(SEDE_VACIA);
      setAviso({
        tipo: 'exito',
        titulo: `Sede «${r.datos.sede.nombre}» creada`,
        texto: `Queda deshabilitada para atención. Enviamos la invitación de activación a ${r.datos.operador.correo}.`,
      });
      alCrear();
      return;
    }
    if (r.tipo === 'error' && r.estado === 400) {
      setErrores(erroresSede(r.campos));
      return;
    }
    if (r.tipo === 'error' && r.codigo === 'SEDE_EXISTENTE') {
      setErrores({ nombre: CONFLICTO.SEDE_EXISTENTE! });
      return;
    }
    if (r.tipo === 'error' && r.codigo === 'EMAIL_IN_USE') {
      setErrores({ operadorCorreo: CONFLICTO.EMAIL_IN_USE! });
      return;
    }
    if (r.tipo === 'red' || r.tipo === 'servicio') {
      // Resultado incierto: la sede pudo crearse. Se conserva el formulario y se pide recargar antes de reintentar.
      setAviso({
        tipo: 'aviso',
        titulo: 'No sabemos si la sede se creó',
        texto: 'Recarga la lista y comprueba si la sede aparece antes de volver a enviarla.',
        accion: (
          <Boton variante="secundario" onClick={recargar}>
            Recargar la lista
          </Boton>
        ),
      });
      return;
    }
    const c = clasificar(r);
    if (c.tipo === 'aviso') setAviso(c.aviso);
  }

  return (
    <PanelTarjeta titulo="Agregar sede con su operador inicial">
      <p className="campo__ayuda" id={idNota}>
        La sede nace deshabilitada para atención. El operador inicial recibe un enlace de un solo uso para elegir su
        contraseña. El distrito de ubicación no define la cobertura.
      </p>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-label="Agregar sede con su operador inicial" aria-describedby={idNota} noValidate>
        <CampoSeleccion etiqueta="Institución" value={v.institucionId} onChange={(e) => poner('institucionId')(e.target.value)} error={errores.institucionId}>
          <option value="">Seleccionar</option>
          {instituciones.map((i) => (
            <option key={i.id} value={i.id} disabled={!i.activa}>
              {i.nombre}
              {i.activa ? '' : ' (inactiva)'}
            </option>
          ))}
        </CampoSeleccion>
        <Campo etiqueta="Nombre de sede" value={v.nombre} onChange={(e) => poner('nombre')(e.target.value)} error={errores.nombre} maxLength={150} autoComplete="off" />
        <CampoSeleccion etiqueta="Distrito (opcional)" value={v.distrito} onChange={(e) => poner('distrito')(e.target.value)} error={errores.distrito}>
          <option value="">Sin ubicación registrada</option>
          {distritos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </CampoSeleccion>
        <Campo etiqueta="Nombre del operador" value={v.operadorNombre} onChange={(e) => poner('operadorNombre')(e.target.value)} error={errores.operadorNombre} maxLength={100} autoComplete="off" />
        <Campo
          etiqueta="Correo del operador"
          type="email"
          value={v.operadorCorreo}
          onChange={(e) => poner('operadorCorreo')(e.target.value)}
          error={errores.operadorCorreo}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <div className="check">
          <input id={idDemo} type="checkbox" checked={v.demostracion} onChange={(e) => poner('demostracion')(e.target.checked)} />
          <label htmlFor={idDemo}>Datos de demostración</label>
        </div>
        <div>
          <Boton type="submit" cargando={enviando} bloque>
            {enviando ? 'Creando sede…' : 'Crear sede e invitar'}
          </Boton>
        </div>
        {errores.cuerpo ? <p className="campo__error form-grid__completo">{errores.cuerpo}</p> : null}
        <div className="form-grid__completo">
          <AvisoMensaje aviso={aviso} />
        </div>
      </form>
    </PanelTarjeta>
  );
}

export function InstitucionesSedes() {
  const { datos, recargar } = useDatosOrganizacion();
  return (
    <Contenedor datos={datos} recargar={recargar}>
      {(d) => (
        <>
          {d.instituciones.map((inst) => (
            <PanelInstitucion
              key={`${inst.id}-${inst.nombre}-${inst.contacto ?? ''}`}
              institucion={inst}
              sedes={d.sedes.filter((s) => s.institucionId === inst.id)}
              distritos={d.distritos}
              alCambiar={recargar}
            />
          ))}
          <FormularioSede instituciones={d.instituciones} distritos={d.distritos} alCrear={recargar} recargar={recargar} />
        </>
      )}
    </Contenedor>
  );
}

// --- Selector de sede compartido -----------------------------------------------------------

function SelectorSede({ instituciones, sedes, valor, alCambiar }: { instituciones: readonly Institucion[]; sedes: readonly Sede[]; valor: string; alCambiar: (id: string) => void }) {
  return (
    <div className="selector-sede">
      <CampoSeleccion etiqueta="Sede" value={valor} onChange={(e) => alCambiar(e.target.value)}>
        {instituciones.map((inst) => {
          const propias = sedes.filter((s) => s.institucionId === inst.id);
          if (propias.length === 0) return null;
          return (
            <optgroup key={inst.id} label={inst.nombre}>
              {propias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </optgroup>
          );
        })}
      </CampoSeleccion>
    </div>
  );
}

/** Sede elegida: la de `?sede=` si existe (enlace «Operadores de la sede»), o la primera. */
function useSedeElegida(sedes: readonly Sede[] | null): [string, (id: string) => void] {
  const [parametros, setParametros] = useSearchParams();
  const pedida = parametros.get('sede') ?? '';
  const vigente = sedes?.some((s) => s.id === pedida) ? pedida : (sedes?.[0]?.id ?? '');
  const elegir = useCallback((id: string) => setParametros({ sede: id }, { replace: true }), [setParametros]);
  return [vigente, elegir];
}

// --- Operadores --------------------------------------------------------------------------

function ListaOperadores({ sedeId }: { sedeId: string }) {
  const clasificar = useClasificar();
  const [operadores, setOperadores] = useState<readonly OperadorSede[] | null>(null);
  const [fallo, setFallo] = useState<'red' | 'servicio' | null>(null);
  const [version, setVersion] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', correo: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const recargar = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    const control = new AbortController();
    api
      .operadores(sedeId, control.signal)
      .then((r) => {
        const c = clasificar(r);
        if (c.tipo === 'ok') {
          setFallo(null);
          setOperadores(c.datos.operadores);
        } else if (c.tipo === 'aviso') setFallo(r.tipo === 'red' ? 'red' : 'servicio');
      })
      .catch(() => {
        /* cancelada */
      });
    return () => control.abort();
  }, [sedeId, version, clasificar]);

  async function accion(op: OperadorSede, tipo: 'suspender' | 'reactivar' | 'reenviar') {
    setOcupado(op.id);
    setAviso(null);
    const r: Resultado<unknown> =
      tipo === 'reenviar'
        ? await api.reenviarInvitacion(op.id)
        : await api.cambiarEstadoOperador(op.id, tipo === 'suspender' ? 'suspendido' : 'activo');
    setOcupado(null);
    const c = clasificar(r);
    if (c.tipo === 'ok') {
      setAviso({
        tipo: 'exito',
        titulo:
          tipo === 'reenviar'
            ? `Invitación reenviada a ${op.correo}`
            : tipo === 'suspender'
              ? `${op.nombre} quedó suspendido`
              : `${op.nombre} quedó reactivado`,
        texto: tipo === 'reenviar' ? 'El enlace anterior deja de ser válido.' : undefined,
      });
      recargar();
    } else if (c.tipo === 'aviso') setAviso(c.aviso);
  }

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setAviso(null);
    const r = await api.agregarOperador(sedeId, nuevo);
    setEnviando(false);
    if (r.tipo === 'ok') {
      setNuevo({ nombre: '', correo: '' });
      setErrores({});
      setAviso({ tipo: 'exito', titulo: 'Operador agregado', texto: `Enviamos la invitación a ${r.datos.operador.correo}.` });
      recargar();
      return;
    }
    if (r.tipo === 'error' && r.estado === 400) setErrores(r.campos ?? {});
    else if (r.tipo === 'error' && r.codigo === 'EMAIL_IN_USE') setErrores({ correo: CONFLICTO.EMAIL_IN_USE! });
    else {
      const c = clasificar(r);
      if (c.tipo === 'aviso') setAviso(c.aviso);
    }
  }

  return (
    <>
      <AvisoMensaje aviso={aviso} />
      {fallo ? <FalloDeConexion tipo={fallo} onReintentar={recargar} /> : null}
      {operadores === null && !fallo ? (
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Cargando operadores…</span>
        </p>
      ) : null}
      {operadores && operadores.length === 0 ? <p className="empty">Esta sede todavía no tiene operadores.</p> : null}
      {operadores && operadores.length > 0 ? (
        <ul className="cards" aria-label="Operadores de la sede">
          {operadores.map((op) => (
            <li key={op.id} className="mini-card">
              <strong>{op.nombre}</strong>
              <span>{op.correo}</span>
              <ul className="estados" aria-label={`Estado de ${op.nombre}`}>
                <Pill icono={op.estado === 'activo' ? 'exito' : op.estado === 'suspendido' ? 'candado' : 'reloj'} aviso={op.estado !== 'activo'}>
                  {ESTADO_OPERADOR[op.estado]}
                </Pill>
                {op.esDemostracion ? <Pill icono="info">Demostración</Pill> : null}
              </ul>
              <div className="acciones-tarjeta">
                {op.estado === 'pendiente_activacion' ? (
                  <button type="button" className="text-button" disabled={ocupado === op.id} onClick={() => void accion(op, 'reenviar')}>
                    Reenviar invitación
                  </button>
                ) : null}
                {op.estado === 'suspendido' ? (
                  <button type="button" className="text-button" disabled={ocupado === op.id} onClick={() => void accion(op, 'reactivar')}>
                    Reactivar
                  </button>
                ) : (
                  <button type="button" className="text-button danger" disabled={ocupado === op.id} onClick={() => void accion(op, 'suspender')}>
                    Suspender
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="form-grid compact" onSubmit={(e) => void agregar(e)} aria-label="Agregar operador a esta sede" noValidate>
        <Campo etiqueta="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo((x) => ({ ...x, nombre: e.target.value }))} error={errores.nombre} maxLength={100} autoComplete="off" />
        <Campo etiqueta="Correo" type="email" value={nuevo.correo} onChange={(e) => setNuevo((x) => ({ ...x, correo: e.target.value }))} error={errores.correo} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <div>
          <Boton type="submit" cargando={enviando} bloque>
            {enviando ? 'Agregando…' : 'Agregar e invitar'}
          </Boton>
        </div>
      </form>
    </>
  );
}

export function Operadores() {
  const { datos, recargar } = useDatosOrganizacion();
  const [sedeId, setSedeId] = useSedeElegida(datos.estado === 'listo' ? datos.sedes : null);
  return (
    <Contenedor datos={datos} recargar={recargar}>
      {(d) => {
        if (d.sedes.length === 0) {
          return (
            <PanelTarjeta titulo="Operadores">
              <p className="empty">Primero crea una sede en «Instituciones y sedes».</p>
            </PanelTarjeta>
          );
        }
        const sede = d.sedes.find((s) => s.id === sedeId);
        return (
          <>
            <SelectorSede instituciones={d.instituciones} sedes={d.sedes} valor={sedeId} alCambiar={setSedeId} />
            <PanelTarjeta titulo={sede ? sede.nombre : 'Operadores'} eyebrow="Operadores con acceso">
              <ListaOperadores key={sedeId} sedeId={sedeId} />
            </PanelTarjeta>
          </>
        );
      }}
    </Contenedor>
  );
}

// --- Coberturas y competencias -----------------------------------------------------------

function ListaOpciones({ leyenda, opciones, elegidas, alCambiar }: { leyenda: string; opciones: readonly { id: string; nombre: string }[]; elegidas: ReadonlySet<string>; alCambiar: (s: Set<string>) => void }) {
  return (
    <fieldset className="choice-list">
      <legend>{leyenda}</legend>
      {opciones.map((o) => (
        <label key={o.id}>
          <input
            type="checkbox"
            checked={elegidas.has(o.id)}
            onChange={(e) => {
              const s = new Set(elegidas);
              if (e.target.checked) s.add(o.id);
              else s.delete(o.id);
              alCambiar(s);
            }}
          />
          {o.nombre}
        </label>
      ))}
    </fieldset>
  );
}

function ConfiguracionSede({ sede, distritos, categorias, alCambiar }: { sede: Sede; distritos: readonly DistritoCatalogo[]; categorias: readonly CategoriaCatalogo[]; alCambiar: () => void }) {
  const clasificar = useClasificar();
  const [elegidosDistritos, setDistritos] = useState<Set<string>>(new Set(sede.distritos));
  const [elegidasCategorias, setCategorias] = useState<Set<string>>(new Set(sede.categorias));
  const [fuente, setFuente] = useState(sede.verificacion.fuente ?? '');
  const [fecha, setFecha] = useState(sede.verificacion.fecha ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Tras guardar, la lista se recarga: se sincronizan las selecciones con lo confirmado por la API
  // sin desmontar el bloque, para que el aviso de resultado siga visible.
  const firmaDistritos = sede.distritos.join(',');
  const firmaCategorias = sede.categorias.join(',');
  useEffect(() => setDistritos(new Set(firmaDistritos ? firmaDistritos.split(',') : [])), [firmaDistritos]);
  useEffect(() => setCategorias(new Set(firmaCategorias ? firmaCategorias.split(',') : [])), [firmaCategorias]);

  async function ejecutar<T>(clave: string, llamada: () => Promise<Resultado<T>>, exito: string) {
    setOcupado(clave);
    setAviso(null);
    const r = await llamada();
    setOcupado(null);
    if (r.tipo === 'error' && r.estado === 400) {
      setErrores(r.campos ?? {});
      setAviso({ tipo: 'error', titulo: 'Revisa los datos', texto: 'Algunos valores no son válidos.' });
      return;
    }
    const c = clasificar(r);
    if (c.tipo === 'ok') {
      setErrores({});
      setAviso({ tipo: 'exito', titulo: exito });
      alCambiar();
    } else if (c.tipo === 'aviso') setAviso(c.aviso);
  }

  return (
    <>
      <AvisoMensaje aviso={aviso} />
      <PanelTarjeta titulo="Verificación documental">
        <p className="campo__ayuda">Verificar la sede no la habilita para atención.</p>
        <form
          className="form-grid compact"
          noValidate
          aria-label="Verificación documental"
          onSubmit={(e) => {
            e.preventDefault();
            void ejecutar('verificar', () => api.actualizarSede(sede.id, { verificacion: { estado: 'verificada', fuente, fecha } }), 'Verificación registrada');
          }}
        >
          <Campo etiqueta="Fuente del contraste" value={fuente} onChange={(e) => setFuente(e.target.value)} error={errores['verificacion.fuente'] ?? errores.verificacion} maxLength={300} />
          <Campo etiqueta="Fecha del contraste" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} error={errores['verificacion.fecha']} />
          <div className="acciones-tarjeta">
            <Boton type="submit" cargando={ocupado === 'verificar'}>
              Registrar verificación
            </Boton>
            {sede.verificacion.estado === 'verificada' ? (
              <Boton variante="secundario" cargando={ocupado === 'quitar'} onClick={() => void ejecutar('quitar', () => api.actualizarSede(sede.id, { verificacion: { estado: 'sin_verificar' } }), 'Verificación retirada')}>
                Quitar verificación
              </Boton>
            ) : null}
          </div>
        </form>
      </PanelTarjeta>

      <PanelTarjeta
        titulo="Distritos de cobertura"
        accion={
          <Boton cargando={ocupado === 'cobertura'} onClick={() => void ejecutar('cobertura', () => api.guardarCobertura(sede.id, [...elegidosDistritos]), 'Cobertura guardada')}>
            Guardar cobertura
          </Boton>
        }
      >
        <ListaOpciones leyenda="Distritos que atiende esta sede" opciones={distritos} elegidas={elegidosDistritos} alCambiar={setDistritos} />
      </PanelTarjeta>

      <PanelTarjeta
        titulo="Categorías que atiende"
        accion={
          <Boton cargando={ocupado === 'competencias'} onClick={() => void ejecutar('competencias', () => api.guardarCompetencias(sede.id, [...elegidasCategorias]), 'Competencias guardadas')}>
            Guardar categorías
          </Boton>
        }
      >
        <ListaOpciones leyenda="Categorías de competencia" opciones={categorias.filter((c) => c.activa)} elegidas={elegidasCategorias} alCambiar={setCategorias} />
      </PanelTarjeta>

      <PanelTarjeta
        titulo="Atención"
        accion={
          sede.habilitadaAtencion ? (
            <Boton variante="secundario" cargando={ocupado === 'deshabilitar'} onClick={() => void ejecutar('deshabilitar', () => api.deshabilitarSede(sede.id), 'Sede deshabilitada para atención')}>
              Deshabilitar atención
            </Boton>
          ) : (
            <Boton cargando={ocupado === 'habilitar'} onClick={() => void ejecutar('habilitar', () => api.habilitarSede(sede.id), 'Sede habilitada para atención')}>
              Habilitar atención
            </Boton>
          )
        }
      >
        <p>{sede.habilitadaAtencion ? 'La sede está habilitada para atención.' : 'La sede está deshabilitada para atención.'}</p>
        <p className="campo__ayuda">Requiere sede activa y verificada, al menos un distrito, una categoría y un operador activo.</p>
      </PanelTarjeta>
    </>
  );
}

export function Coberturas() {
  const { datos, recargar } = useDatosOrganizacion();
  const [sedeId, setSedeId] = useSedeElegida(datos.estado === 'listo' ? datos.sedes : null);
  return (
    <Contenedor datos={datos} recargar={recargar}>
      {(d) => {
        if (d.sedes.length === 0) {
          return (
            <PanelTarjeta titulo="Coberturas">
              <p className="empty">Primero crea una sede en «Instituciones y sedes».</p>
            </PanelTarjeta>
          );
        }
        const sede = d.sedes.find((s) => s.id === sedeId);
        return (
          <>
            <div className="selector-sede">
              <SelectorSede instituciones={d.instituciones} sedes={d.sedes} valor={sedeId} alCambiar={setSedeId} />
              {sede ? <EstadosSede sede={sede} /> : null}
            </div>
            {sede ? <ConfiguracionSede key={sede.id} sede={sede} distritos={d.distritos} categorias={d.categorias} alCambiar={recargar} /> : null}
          </>
        );
      }}
    </Contenedor>
  );
}

/** Contenido de una seccion disponible del administrador; nulo para las demas. */
export function SeccionOrganizacion({ id }: { id: string }) {
  if (id === 'instituciones-sedes') return <InstitucionesSedes />;
  if (id === 'operadores') return <Operadores />;
  if (id === 'coberturas') return <Coberturas />;
  return null;
}

/** Descripcion de la cabecera de cada seccion de organizacion, como la intro del origen. */
export const DESCRIPCION_SECCION: Readonly<Record<string, string>> = {
  'instituciones-sedes': 'Administra las instituciones, sus sedes y el operador inicial de cada sede.',
  operadores: 'Gestiona las cuentas individuales del personal de cada sede.',
  coberturas: 'Configura verificación, distritos, categorías y habilitación para atención de cada sede.',
};
