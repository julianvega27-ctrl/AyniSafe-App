import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  api,
  type CantidadHeridos,
  type DetalleSanitario,
  type PrecisionCondicion,
  type RespuestaCiudadano,
  type ResumenIncidente,
  type SignosVida,
} from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { Dialogo } from '../../componentes/Dialogo';
import { GrupoOpciones } from '../../componentes/GrupoOpciones';
import { Icono } from '../../componentes/iconos';
import { Mensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';
import { CAMPO_EVALUACION, fecha, textoCantidad, textoOrigen, textoRespuesta, textoSignos } from './etiquetas';

/**
 * Evaluacion rapida en el resumen del operador (P5.1). La condicion vigente es el resumen de heridos
 * que ven todas las instituciones; la evaluacion completa y su historial solo los recibe el operador
 * SAMU participante (la API decide: `accesoSanitario`). Composicion `kv` de IncidentTriage.jsx del
 * origen (efc1bce8), sin estilos nuevos.
 */

type Respuesta = Exclude<RespuestaCiudadano, null>;
const RESPUESTAS: readonly (readonly [Respuesta, string])[] = [
  ['si', 'Sí'],
  ['no', 'No'],
  ['no_se', 'No sabe'],
];
const SIGNOS: readonly (readonly [Exclude<SignosVida, null>, string])[] = [
  ['observados', 'Se observan'],
  ['no_observados', 'No se han observado'],
  ['no_se', 'No sabe'],
];
type OpcionCantidad = '1' | '2' | '3' | '4' | '5' | 'otra' | 'no_se';
const CANTIDADES: readonly (readonly [OpcionCantidad, string])[] = [
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4'],
  ['5', '5'],
  ['otra', 'Otra cantidad'],
  ['no_se', 'No sabe'],
];
const OTRA_MINIMA = 6;
const MAXIMA = 999;

interface Valores {
  readonly heridos: RespuestaCiudadano;
  readonly atencionMedica: RespuestaCiudadano;
  readonly cantidad: CantidadHeridos;
  readonly signosVida: SignosVida;
  readonly consciente: RespuestaCiudadano;
  readonly sangrado: RespuestaCiudadano;
}

/** Solo lo que cambia respecto de la version vigente (la API guarda la instantanea completa). */
function cambios(inicial: Valores, actual: Valores, conPersona: boolean): Omit<PrecisionCondicion, 'motivo'> {
  const persona: Record<string, string> = {};
  if (conPersona) {
    if (actual.signosVida !== null && actual.signosVida !== inicial.signosVida) persona.signosVida = actual.signosVida;
    if (actual.consciente !== null && actual.consciente !== inicial.consciente) persona.consciente = actual.consciente;
    if (actual.sangrado !== null && actual.sangrado !== inicial.sangrado) persona.sangrado = actual.sangrado;
  }
  return {
    ...(actual.heridos !== null && actual.heridos !== inicial.heridos ? { heridos: actual.heridos } : {}),
    ...(actual.atencionMedica !== null && actual.atencionMedica !== inicial.atencionMedica ? { atencionMedica: actual.atencionMedica } : {}),
    ...(actual.heridos === 'si' && actual.cantidad !== null && actual.cantidad !== inicial.cantidad ? { cantidadHeridos: actual.cantidad } : {}),
    ...(Object.keys(persona).length ? { personaPrincipal: persona } : {}),
  };
}

const opcionDe = (c: CantidadHeridos): OpcionCantidad | null =>
  c === null ? null : c === 'no_se' ? 'no_se' : c >= OTRA_MINIMA ? 'otra' : (String(c) as OpcionCantidad);

function SelectorCantidad({ valor, alCambiar, deshabilitado }: { valor: CantidadHeridos; alCambiar: (c: CantidadHeridos) => void; deshabilitado: boolean }) {
  const otra = typeof valor === 'number' && valor >= OTRA_MINIMA;
  return (
    <div>
      <GrupoOpciones
        leyenda="¿Cuántas personas heridas hay?"
        opciones={CANTIDADES}
        valor={opcionDe(valor)}
        deshabilitado={deshabilitado}
        alCambiar={(o) => alCambiar(o === 'no_se' ? 'no_se' : o === 'otra' ? (otra ? valor : OTRA_MINIMA) : Number(o))}
      />
      {otra ? (
        <div className="acciones-tarjeta" role="group" aria-label="Otra cantidad de personas heridas">
          <Boton variante="secundario" aria-label="Restar una persona" disabled={deshabilitado || valor <= OTRA_MINIMA} onClick={() => alCambiar(valor - 1)}>
            −
          </Boton>
          <output aria-live="polite">{valor} personas heridas</output>
          <Boton variante="secundario" aria-label="Sumar una persona" disabled={deshabilitado || valor >= MAXIMA} onClick={() => alCambiar(valor + 1)}>
            +
          </Boton>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dialogo «Precisar condicion medica» (cualquier operador participante) o «Registrar aclaracion»
 * (operador SAMU, con la persona principal). Una sola solicitud con los campos cambiados y motivo.
 */
function DialogoEvaluacion({
  incidenteId,
  referencia,
  categoriaId,
  inicial,
  samu,
  onCerrar,
  onGuardado,
}: {
  incidenteId: string;
  referencia: string;
  categoriaId: string;
  inicial: Valores;
  samu: boolean;
  onCerrar: () => void;
  onGuardado: (samuIncorporado: boolean) => void;
}) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const [v, setV] = useState<Valores>(inicial);
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [fallo, setFallo] = useState<{ titulo: string; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const poner = <K extends keyof Valores>(k: K) => (valor: Valores[K]) => setV((a) => ({ ...a, [k]: valor }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const c = cambios(inicial, v, samu);
    const locales: Record<string, string> = {};
    const largo = [...motivo.trim()].length;
    if (largo < 10 || largo > 500) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    if (Object.keys(c).length === 0) locales.cuerpo = 'Cambia al menos una respuesta.';
    setErrores(locales);
    if (Object.keys(locales).length) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.precisarCondicion(incidenteId, { ...c, motivo: motivo.trim() });
    setEnviando(false);
    if (r.tipo === 'ok') return onGuardado(r.datos.samuIncorporado);
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.estado === 400) {
      setErrores(r.campos ?? { cuerpo: 'Revisa las respuestas.' });
      return;
    }
    if (r.tipo === 'error' && r.estado === 409) {
      setFallo({ titulo: 'No se guardó', texto: 'El incidente está cerrado: la condición ya no puede precisarse.' });
      return;
    }
    if (r.tipo === 'error' && r.estado === 404) {
      setFallo({ titulo: 'Incidente no disponible', texto: 'Ya no corresponde a tu sede. Cierra y vuelve a la bandeja.' });
      return;
    }
    setFallo({ titulo: 'No pudimos guardar', texto: 'Inténtalo de nuevo; no se duplicará.' });
  }

  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCerrar}>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
        <h3 id={idTitulo} className="form-grid__completo">
          {samu ? 'Registrar aclaración' : 'Precisar condición médica'} · {referencia}
        </h3>
        {fallo ? (
          <div className="form-grid__completo" role="status">
            <Mensaje tipo="error" titulo={fallo.titulo}>
              {fallo.texto}
            </Mensaje>
          </div>
        ) : null}
        <div className="form-grid__completo">
          <GrupoOpciones leyenda="¿Hay personas heridas?" opciones={RESPUESTAS} valor={v.heridos} deshabilitado={enviando} alCambiar={poner('heridos')} error={errores.heridos} />
        </div>
        {categoriaId === 'accidente-transito' ? (
          <div className="form-grid__completo">
            <GrupoOpciones
              leyenda="¿Se necesita atención médica?"
              opciones={RESPUESTAS}
              valor={v.atencionMedica}
              deshabilitado={enviando}
              alCambiar={poner('atencionMedica')}
              error={errores.atencionMedica}
            />
          </div>
        ) : null}
        {v.heridos === 'si' ? (
          <div className="form-grid__completo">
            <SelectorCantidad valor={v.cantidad} alCambiar={poner('cantidad')} deshabilitado={enviando} />
            {errores.cantidadHeridos ? <p className="campo__error"><Icono nombre="error" /><span>{errores.cantidadHeridos}</span></p> : null}
          </div>
        ) : null}
        {samu ? (
          <div className="form-grid__completo">
            <p>Persona principal: una sola persona, la más afectada.</p>
            <GrupoOpciones leyenda="Signos de vida" opciones={SIGNOS} valor={v.signosVida} deshabilitado={enviando} alCambiar={poner('signosVida')} />
            <GrupoOpciones leyenda="¿Está consciente?" opciones={RESPUESTAS} valor={v.consciente} deshabilitado={enviando} alCambiar={poner('consciente')} />
            <GrupoOpciones leyenda="¿Hay sangrado visible?" opciones={RESPUESTAS} valor={v.sangrado} deshabilitado={enviando} alCambiar={poner('sangrado')} />
          </div>
        ) : null}
        <div className="form-grid__completo">
          <Campo
            etiqueta="Motivo"
            ayuda="Entre 10 y 500 caracteres. Queda registrado con tu cuenta y solo lo lee SAMU."
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
            error={errores.motivo}
            required
          />
        </div>
        {errores.cuerpo || errores.personaPrincipal ? (
          <p className="campo__error form-grid__completo" role="alert">
            <Icono nombre="error" />
            <span>{errores.cuerpo ?? errores.personaPrincipal}</span>
          </p>
        ) : null}
        <div className="acciones-tarjeta form-grid__completo">
          <Boton type="submit" cargando={enviando}>
            Guardar
          </Boton>
          <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}

/**
 * Valor de una respuesta como insignia con texto e icono (nunca solo color). «Sí» usa el aviso ámbar
 * existente porque señala una condición que requiere atención; «No» la insignia neutra; desconocido o
 * sin respuesta, la insignia gris de «Sin evaluar». No es una clasificación clínica.
 */
function ValorRespuesta({ texto, tipo }: { texto: string; tipo: 'atencion' | 'neutro' | 'desconocido' }) {
  if (tipo === 'desconocido') {
    return (
      <span className="priority-badge priority-badge--unknown">
        <Icono nombre="info" />
        {texto}
      </span>
    );
  }
  return (
    <span className={tipo === 'atencion' ? 'pill warn' : 'pill'}>
      <Icono nombre={tipo === 'atencion' ? 'aviso' : 'exito'} />
      {texto}
    </span>
  );
}

const tipoRespuesta = (r: RespuestaCiudadano): 'atencion' | 'neutro' | 'desconocido' =>
  r === 'si' ? 'atencion' : r === 'no' ? 'neutro' : 'desconocido';
const tipoSignos = (s: SignosVida): 'atencion' | 'neutro' | 'desconocido' =>
  s === 'no_observados' ? 'atencion' : s === 'observados' ? 'neutro' : 'desconocido';

/** Tarjeta de una pregunta: valor vigente y, si difiere, lo que informó el ciudadano. */
function TarjetaRespuesta({ pregunta, valor, original }: { pregunta: string; valor: RespuestaCiudadano; original?: RespuestaCiudadano }) {
  return (
    <li className="mini-card">
      <span>{pregunta}</span>
      <div>
        <ValorRespuesta texto={textoRespuesta(valor)} tipo={tipoRespuesta(valor)} />
      </div>
      {original !== undefined && original !== valor ? <small>Ciudadano informó: {textoRespuesta(original)}</small> : null}
    </li>
  );
}

/** Bloque «Condición médica»: condición vigente en tarjetas, con la respuesta original del ciudadano. */
export function BloqueCondicionMedica({ resumen, onActualizado }: { resumen: ResumenIncidente; onActualizado: (aviso: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const c = resumen.condicionMedica;
  const editable = c !== null && resumen.estado !== 'CERRADO';
  const original = resumen.respuestasCiudadano;
  return (
    <section className="panel" aria-labelledby="titulo-condicion">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Resumen de heridos</span>
          <h2 id="titulo-condicion">Condición médica</h2>
        </div>
        {editable ? (
          <Boton variante="secundario" onClick={() => setAbierto(true)}>
            Precisar condición médica
          </Boton>
        ) : null}
      </div>
      {c ? (
        <>
          <p className="metadatos">
            {c.revisionPendiente ? (
              <span className="pill warn">
                <Icono nombre="aviso" />
                Por confirmar
              </span>
            ) : (
              <span className="pill">
                <Icono nombre="exito" />
                Sin respuestas pendientes
              </span>
            )}
            <span>
              Versión {c.version} · {textoOrigen(c.origen, c.institucion)} · {fecha(c.informadaEn)}
            </span>
          </p>
          <h3 className="subtitulo-panel">Condición vigente</h3>
          <ul className="cards cards--respuestas">
            <TarjetaRespuesta pregunta="¿Hay personas heridas?" valor={c.heridos} original={original.heridos} />
            {resumen.categoria.id === 'accidente-transito' ? (
              <TarjetaRespuesta pregunta="¿Atención médica?" valor={c.atencionMedica} original={original.atencionMedica} />
            ) : null}
            {c.heridos === 'si' ? (
              <li className="mini-card">
                <span>Personas heridas</span>
                <div>
                  {c.cantidadHeridos === null || c.cantidadHeridos === 'no_se' ? (
                    <ValorRespuesta texto={textoCantidad(c.cantidadHeridos)} tipo="desconocido" />
                  ) : (
                    <strong className="linea-tiempo__titulo">{c.cantidadHeridos}</strong>
                  )}
                </div>
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <>
          <h3 className="subtitulo-panel">Informado por el ciudadano</h3>
          <ul className="cards cards--respuestas">
            <TarjetaRespuesta pregunta="¿Hay personas heridas?" valor={original.heridos} />
            <TarjetaRespuesta pregunta="¿Atención médica?" valor={original.atencionMedica} />
          </ul>
        </>
      )}
      <p className="nota-panel">Observaciones informadas, sin revisión clínica; no describen el estado actual de las personas.</p>
      {abierto && c ? (
        <DialogoEvaluacion
          incidenteId={resumen.id}
          referencia={resumen.referencia}
          categoriaId={resumen.categoria.id}
          samu={false}
          inicial={{ heridos: c.heridos, atencionMedica: c.atencionMedica, cantidad: c.cantidadHeridos, signosVida: null, consciente: null, sangrado: null }}
          onCerrar={() => setAbierto(false)}
          onGuardado={(samuIncorporado) => {
            setAbierto(false);
            onActualizado(samuIncorporado ? 'Condición precisada. SAMU fue incorporado al caso.' : 'Condición precisada.');
          }}
        />
      ) : null}
    </section>
  );
}

type EstadoDetalle =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly detalle: DetalleSanitario }
  | { readonly estado: 'no-disponible' };

/** Sección «Evaluación rápida» del operador SAMU participante: vigente, historial y aclaración. */
export function SeccionEvaluacionSamu({ resumen, version, onActualizado }: { resumen: ResumenIncidente; version: number; onActualizado: (aviso: string) => void }) {
  const { expirar } = useSesion();
  const [datos, setDatos] = useState<EstadoDetalle>({ estado: 'cargando' });
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    setDatos({ estado: 'cargando' });
    api
      .evaluacionSanitaria(resumen.id, control.signal)
      .then((r) => {
        if (r.tipo === 'ok') setDatos({ estado: 'listo', detalle: r.datos });
        else if (r.tipo === 'error' && r.estado === 401) expirar();
        else setDatos({ estado: 'no-disponible' });
      })
      .catch(() => {
        /* cancelada al salir */
      });
    return () => control.abort();
  }, [resumen.id, version, expirar]);

  const persona = datos.estado === 'listo' ? datos.detalle.vigente.personaPrincipal : null;
  return (
    <section className="panel" aria-labelledby="titulo-evaluacion">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Solo SAMU</span>
          <h2 id="titulo-evaluacion">Evaluación rápida</h2>
        </div>
        {datos.estado === 'listo' && resumen.estado !== 'CERRADO' ? (
          <Boton variante="secundario" onClick={() => setAbierto(true)}>
            Registrar aclaración
          </Boton>
        ) : null}
      </div>
      {datos.estado === 'cargando' ? (
        <p role="status" className="pendiente">
          <Icono nombre="reloj" />
          <span>Cargando la evaluación…</span>
        </p>
      ) : null}
      {datos.estado === 'no-disponible' ? (
        <Mensaje tipo="aviso" titulo="Evaluación no disponible">
          No pudimos cargar la evaluación. El resto del resumen sigue disponible.
        </Mensaje>
      ) : null}
      {datos.estado === 'listo' && persona ? (
        <>
          {datos.detalle.pendiente ? (
            <Mensaje tipo="aviso" titulo="Evaluación pendiente">
              Nadie ha informado observaciones de la persona principal. Puedes registrarlas con «Registrar aclaración».
            </Mensaje>
          ) : null}
          <p className="metadatos">
            <span>
              Versión {datos.detalle.version} · informada el {fecha(datos.detalle.informadaEn)}
            </span>
          </p>
          <h3 className="subtitulo-panel">Persona principal</h3>
          <ul className="cards cards--respuestas">
            <li className="mini-card">
              <span>Signos de vida</span>
              <div>
                <ValorRespuesta texto={textoSignos(persona.signosVida)} tipo={tipoSignos(persona.signosVida)} />
              </div>
            </li>
            <TarjetaRespuesta pregunta="¿Está consciente?" valor={persona.consciente} />
            <TarjetaRespuesta pregunta="¿Sangrado visible?" valor={persona.sangrado} />
          </ul>
          <h3 className="subtitulo-panel">Historial</h3>
          <ol className="linea-tiempo" aria-label="Historial de versiones, de la más reciente a la más antigua">
            {[...datos.detalle.historial].reverse().map((h) => (
              <li key={h.version}>
                <span className="linea-tiempo__titulo">
                  Versión {h.version} · {textoOrigen(h.origen, h.institucion)}
                </span>
                <span className="metadatos">{fecha(h.instante)}</span>
                {h.camposModificados.length ? (
                  <ul className="estados" aria-label="Campos modificados">
                    {h.camposModificados.map((campo) => (
                      <li key={campo} className="pill">
                        {CAMPO_EVALUACION[campo]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="metadatos">Registro inicial del reporte</span>
                )}
                {h.motivo ? <p className="linea-tiempo__motivo">Motivo: {h.motivo}</p> : null}
              </li>
            ))}
          </ol>
          {abierto ? (
            <DialogoEvaluacion
              incidenteId={resumen.id}
              referencia={resumen.referencia}
              categoriaId={resumen.categoria.id}
              samu
              inicial={{
                heridos: datos.detalle.vigente.heridos,
                atencionMedica: datos.detalle.vigente.atencionMedica,
                cantidad: datos.detalle.vigente.cantidadHeridos,
                signosVida: persona.signosVida,
                consciente: persona.consciente,
                sangrado: persona.sangrado,
              }}
              onCerrar={() => setAbierto(false)}
              onGuardado={() => {
                setAbierto(false);
                onActualizado('Aclaración registrada.');
              }}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
