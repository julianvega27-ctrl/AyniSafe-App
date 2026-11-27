import { useId, useState, type FormEvent } from 'react';
import { api, type Prioridad, type ResultadoCierre, type ResumenIncidente, type Verificacion } from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { Dialogo } from '../../componentes/Dialogo';
import { GrupoOpciones } from '../../componentes/GrupoOpciones';
import { Icono } from '../../componentes/iconos';
import { Mensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';
import { CONFLICTO_ATENCION, ESTADO, fecha, INSTITUCION, PRIORIDAD, RESULTADO, textoHistorial, VERIFICACION } from './etiquetas';

/**
 * Atencion institucional en el resumen del operador (P6, spec `web/bandeja-incidentes`). Muestra el
 * responsable de su institucion, ofrece solo las acciones que la API informa como permitidas y explica
 * los conflictos sin presentar la accion como hecha. Composicion `panel`/`kv`/`linea-tiempo` y
 * componentes compartidos existentes, sin estilos nuevos.
 */

type Dialogo = 'cerrar_atendido' | 'descartar' | 'verificar' | 'vincular' | 'priorizar' | null;

const largo = (t: string) => [...t.trim()].length;

export function BloqueAtencion({ resumen, onActualizado }: { resumen: ResumenIncidente; onActualizado: (aviso: string) => void }) {
  const { expirar } = useSesion();
  const a = resumen.atencion;
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  if (!a) return null;
  const puede = (accion: string) => a.accionesPermitidas.includes(accion as never);

  async function asumir() {
    if (enviando) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.asumirCaso(resumen.id);
    setEnviando(false);
    if (r.tipo === 'ok') return onActualizado(r.datos.estado === 'EN_REVISION' && resumen.estado === 'REGISTRADO' ? 'Asumiste el caso. El incidente pasó a revisión.' : 'Asumiste el caso.');
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) return onActualizado(CONFLICTO_ATENCION[r.codigo]!);
    setFallo('No pudimos asumir el caso. Revisa tu conexión e inténtalo de nuevo.');
  }

  async function iniciar() {
    if (enviando) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.transicionar(resumen.id, { accion: 'iniciar_atencion', estadoEsperado: resumen.estado });
    setEnviando(false);
    if (r.tipo === 'ok') return onActualizado('Atención iniciada. No acredita llegada al lugar.');
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) return onActualizado(CONFLICTO_ATENCION[r.codigo]!);
    setFallo('No pudimos iniciar la atención. Inténtalo de nuevo.');
  }

  return (
    <section className="panel" aria-labelledby="titulo-atencion">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Atención</span>
          <h2 id="titulo-atencion">Responsable y estado</h2>
        </div>
        <span className="pill">
          <Icono nombre={resumen.verificacion === 'VERIFICADO' ? 'exito' : resumen.verificacion === 'NO_VERIFICADO' ? 'aviso' : 'reloj'} />
          {VERIFICACION[resumen.verificacion]}
        </span>
      </div>
      {fallo ? (
        <div role="status">
          <Mensaje tipo="error" titulo="No se completó la acción">{fallo}</Mensaje>
        </div>
      ) : null}
      <dl className="kv">
        <dt>Estado</dt>
        <dd>
          {ESTADO[resumen.estado]}
          {resumen.resultado ? ` · ${RESULTADO[resumen.resultado]}` : ''}
        </dd>
        <dt>Responsable de tu institución</dt>
        <dd>
          {a.responsable.asignado
            ? a.responsable.esUsted
              ? `Tú, desde ${fecha(a.responsable.desde)}`
              : `${a.responsable.nombre ?? 'Otro operador'}, desde ${fecha(a.responsable.desde)}`
            : 'Sin responsable'}
        </dd>
        <dt>Instituciones con responsable</dt>
        <dd>{a.institucionesConResponsable.length ? a.institucionesConResponsable.map((i) => INSTITUCION[i]).join(', ') : 'Ninguna'}</dd>
      </dl>
      {a.accionesPermitidas.length ? (
        <div className="acciones-tarjeta">
          {puede('asumir') ? (
            <Boton onClick={() => void asumir()} cargando={enviando}>
              Asumir caso
            </Boton>
          ) : null}
          {puede('iniciar_atencion') ? (
            <Boton onClick={() => void iniciar()} cargando={enviando}>
              Iniciar atención
            </Boton>
          ) : null}
          {puede('cerrar_atendido') ? (
            <Boton onClick={() => setDialogo('cerrar_atendido')} disabled={enviando}>
              Cerrar como atendido
            </Boton>
          ) : null}
          {puede('descartar') ? (
            <Boton variante="secundario" onClick={() => setDialogo('descartar')} disabled={enviando}>
              Descartar
            </Boton>
          ) : null}
          {puede('verificar') ? (
            <Boton variante="secundario" onClick={() => setDialogo('verificar')} disabled={enviando}>
              Registrar verificación
            </Boton>
          ) : null}
          {puede('priorizar') ? (
            <Boton variante="secundario" onClick={() => setDialogo('priorizar')} disabled={enviando}>
              Revisar prioridad
            </Boton>
          ) : null}
          {puede('vincular') ? (
            <Boton variante="secundario" onClick={() => setDialogo('vincular')} disabled={enviando}>
              Vincular como duplicado
            </Boton>
          ) : null}
        </div>
      ) : resumen.vinculado ? (
        <p className="nota-panel">Vinculado a otro reporte del mismo hecho: se atiende desde el incidente principal.</p>
      ) : resumen.estado !== 'CERRADO' && a.responsable.asignado && !a.responsable.esUsted ? (
        <p className="nota-panel">Otro operador de tu institución es responsable de este caso.</p>
      ) : null}
      {a.historial.length ? (
        <>
          <h3 className="subtitulo-panel">Historial operativo</h3>
          <ol className="linea-tiempo" aria-label="Historial operativo, del más antiguo al más reciente">
            {a.historial.map((h, i) => (
              <li key={`${h.instante}-${i}`}>
                <span className="linea-tiempo__titulo">{textoHistorial(h)}</span>
                <span className="metadatos">{fecha(h.instante)}</span>
                {h.motivo ? <p className="linea-tiempo__motivo">Motivo: {h.motivo}</p> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {dialogo === 'verificar' ? (
        <DialogoVerificacion
          resumen={resumen}
          onCerrar={() => setDialogo(null)}
          onResultado={(aviso) => {
            setDialogo(null);
            onActualizado(aviso);
          }}
        />
      ) : null}
      {dialogo === 'priorizar' ? (
        <DialogoPrioridad
          resumen={resumen}
          onCerrar={() => setDialogo(null)}
          onResultado={(aviso) => {
            setDialogo(null);
            onActualizado(aviso);
          }}
        />
      ) : null}
      {dialogo === 'vincular' ? (
        <DialogoVinculo
          resumen={resumen}
          onCerrar={() => setDialogo(null)}
          onResultado={(aviso) => {
            setDialogo(null);
            onActualizado(aviso);
          }}
        />
      ) : null}
      {dialogo === 'cerrar_atendido' || dialogo === 'descartar' ? (
        <DialogoCierre
          resumen={resumen}
          resultado={dialogo === 'cerrar_atendido' ? 'ATENDIDO' : 'DESCARTADO'}
          onCerrar={() => setDialogo(null)}
          onResultado={(aviso) => {
            setDialogo(null);
            onActualizado(aviso);
          }}
        />
      ) : null}
    </section>
  );
}

function DialogoCierre({ resumen, resultado, onCerrar, onResultado }: {
  resumen: ResumenIncidente;
  resultado: ResultadoCierre;
  onCerrar: () => void;
  onResultado: (aviso: string) => void;
}) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const [motivo, setMotivo] = useState('');
  const [resumenCiudadano, setResumenCiudadano] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const locales: Record<string, string> = {};
    if (largo(motivo) < 10 || largo(motivo) > 500) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    if (largo(resumenCiudadano) < 10 || largo(resumenCiudadano) > 300) locales.resumenCiudadano = 'Escribe un resumen de 10 a 300 caracteres.';
    setErrores(locales);
    if (Object.keys(locales).length) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.transicionar(resumen.id, {
      accion: 'cerrar',
      estadoEsperado: resumen.estado,
      resultado,
      motivo: motivo.trim(),
      resumenCiudadano: resumenCiudadano.trim(),
    });
    setEnviando(false);
    if (r.tipo === 'ok') return onResultado(resultado === 'ATENDIDO' ? 'Caso cerrado como atendido.' : 'Caso descartado.');
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.estado === 400) return setErrores(r.campos ?? { motivo: 'Revisa los datos.' });
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) return onResultado(CONFLICTO_ATENCION[r.codigo]!);
    setFallo('No pudimos cerrar el caso. Revisa tu conexión e inténtalo de nuevo; no se duplicará.');
  }

  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCerrar}>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
        <h3 id={idTitulo} className="form-grid__completo">
          {resultado === 'ATENDIDO' ? 'Cerrar como atendido' : 'Descartar'} {resumen.referencia}
        </h3>
        {resultado === 'DESCARTADO' ? (
          <p className="form-grid__completo nota-panel">
            Descartar cierra el caso sin atención. No descartes por falta de foto, respuestas desconocidas o falta temporal de cobertura.
          </p>
        ) : null}
        {fallo ? (
          <div className="form-grid__completo" role="status">
            <Mensaje tipo="error" titulo="No se cerró el caso">{fallo}</Mensaje>
          </div>
        ) : null}
        <Campo
          etiqueta="Motivo interno"
          ayuda="Entre 10 y 500 caracteres. Solo lo ve tu institución; queda registrado con tu cuenta."
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          error={errores.motivo}
          required
        />
        <Campo
          etiqueta="Resumen para el ciudadano"
          ayuda="Entre 10 y 300 caracteres. Lo verá quien reportó, sin tu nombre."
          value={resumenCiudadano}
          maxLength={300}
          onChange={(e) => setResumenCiudadano(e.target.value)}
          error={errores.resumenCiudadano}
          required
        />
        <div className="acciones-tarjeta form-grid__completo">
          <Boton type="submit" cargando={enviando}>
            {resultado === 'ATENDIDO' ? 'Cerrar como atendido' : 'Descartar caso'}
          </Boton>
          <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}

const VALORES_VERIFICACION: readonly (readonly [Exclude<Verificacion, 'SIN_VERIFICAR'>, string])[] = [
  ['VERIFICADO', 'Verificado'],
  ['NO_VERIFICADO', 'No verificado'],
];

function DialogoVerificacion({ resumen, onCerrar, onResultado }: { resumen: ResumenIncidente; onCerrar: () => void; onResultado: (aviso: string) => void }) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const [valor, setValor] = useState<Exclude<Verificacion, 'SIN_VERIFICAR'> | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const locales: Record<string, string> = {};
    if (!valor) locales.valor = 'Elige verificado o no verificado.';
    if (largo(motivo) < 10 || largo(motivo) > 500) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    setErrores(locales);
    if (Object.keys(locales).length || !valor) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.verificar(resumen.id, { valor, motivo: motivo.trim(), estadoEsperado: resumen.estado });
    setEnviando(false);
    if (r.tipo === 'ok') return onResultado(`Verificación registrada: ${VERIFICACION[r.datos.verificacion].toLowerCase()}.`);
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.estado === 400) return setErrores(r.campos ?? { motivo: 'Revisa los datos.' });
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) return onResultado(CONFLICTO_ATENCION[r.codigo]!);
    setFallo('No pudimos registrar la verificación. Inténtalo de nuevo.');
  }

  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCerrar}>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
        <h3 id={idTitulo} className="form-grid__completo">
          Verificación de {resumen.referencia}
        </h3>
        <p className="form-grid__completo nota-panel">La verificación no cambia el estado, no publica el caso ni es requisito para cerrarlo.</p>
        {fallo ? (
          <div className="form-grid__completo" role="status">
            <Mensaje tipo="error" titulo="No se registró la verificación">{fallo}</Mensaje>
          </div>
        ) : null}
        <div className="form-grid__completo">
          <GrupoOpciones leyenda="¿Se verificó el hecho?" opciones={VALORES_VERIFICACION} valor={valor} alCambiar={setValor} error={errores.valor} deshabilitado={enviando} />
        </div>
        <Campo
          etiqueta="Motivo"
          ayuda="Entre 10 y 500 caracteres. Queda registrado con tu cuenta."
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          error={errores.motivo}
          required
        />
        <div className="acciones-tarjeta form-grid__completo">
          <Boton type="submit" cargando={enviando}>
            Registrar verificación
          </Boton>
          <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}

function DialogoVinculo({ resumen, onCerrar, onResultado }: { resumen: ResumenIncidente; onCerrar: () => void; onResultado: (aviso: string) => void }) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const locales: Record<string, string> = {};
    if (!referencia.trim()) locales.referenciaPrincipal = 'Escribe la referencia del incidente principal.';
    if (largo(motivo) < 10 || largo(motivo) > 500) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    setErrores(locales);
    if (Object.keys(locales).length) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.vincularDuplicado(resumen.id, referencia.trim(), motivo.trim());
    setEnviando(false);
    if (r.tipo === 'ok') return onResultado('Incidente vinculado. Se atenderá desde el incidente principal.');
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.estado === 400) return setErrores(r.campos ?? { motivo: 'Revisa los datos.' });
    if (r.tipo === 'error' && r.estado === 404) return setFallo('No encontramos ese incidente entre los de tu sede.');
    if (r.tipo === 'error' && r.codigo === 'VINCULO_NO_PERMITIDO') return setFallo(CONFLICTO_ATENCION.VINCULO_NO_PERMITIDO!);
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) return onResultado(CONFLICTO_ATENCION[r.codigo]!);
    setFallo('No pudimos vincular el incidente. Inténtalo de nuevo.');
  }

  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCerrar}>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
        <h3 id={idTitulo} className="form-grid__completo">
          Vincular {resumen.referencia} como duplicado
        </h3>
        <p className="form-grid__completo nota-panel">
          La vinculación coordina la atención del mismo hecho. No descarta el reporte ni comparte datos entre quienes reportaron.
        </p>
        {fallo ? (
          <div className="form-grid__completo" role="status">
            <Mensaje tipo="error" titulo="No se vinculó el incidente">{fallo}</Mensaje>
          </div>
        ) : null}
        <Campo
          etiqueta="Referencia del incidente principal"
          ayuda="Por ejemplo, INC-7K3M9-Q2TXA. Debe estar abierto y en la bandeja de tu sede."
          value={referencia}
          maxLength={40}
          onChange={(e) => setReferencia(e.target.value)}
          error={errores.referenciaPrincipal}
          required
        />
        <Campo
          etiqueta="Motivo"
          ayuda="Entre 10 y 500 caracteres. Queda registrado con tu cuenta."
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          error={errores.motivo}
          required
        />
        <div className="acciones-tarjeta form-grid__completo">
          <Boton type="submit" cargando={enviando}>
            Vincular
          </Boton>
          <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}

const VALORES_PRIORIDAD: readonly (readonly [Exclude<Prioridad, 'SIN_EVALUAR'>, string])[] = [
  ['NORMAL', 'Normal'],
  ['ALTA', 'Alta'],
  ['URGENTE', 'Urgente'],
];

function DialogoPrioridad({ resumen, onCerrar, onResultado }: { resumen: ResumenIncidente; onCerrar: () => void; onResultado: (aviso: string) => void }) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const [valor, setValor] = useState<Exclude<Prioridad, 'SIN_EVALUAR'> | null>(resumen.prioridad === 'SIN_EVALUAR' ? null : resumen.prioridad);
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const locales: Record<string, string> = {};
    if (!valor) locales.valor = 'Elige Normal, Alta o Urgente.';
    if (largo(motivo) < 10 || largo(motivo) > 500) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    setErrores(locales);
    if (Object.keys(locales).length || !valor) return;
    setEnviando(true);
    setFallo(null);
    const r = await api.revisarPrioridad(resumen.id, valor, motivo.trim());
    setEnviando(false);
    if (r.tipo === 'ok') return onResultado(`Prioridad revisada: ${PRIORIDAD[r.datos.prioridad].texto}. La bandeja mantiene el orden de llegada.`);
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.estado === 400) return setErrores(r.campos ?? { motivo: 'Revisa los datos.' });
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) return onResultado(CONFLICTO_ATENCION[r.codigo]!);
    setFallo('No pudimos revisar la prioridad. Inténtalo de nuevo.');
  }

  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCerrar}>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
        <h3 id={idTitulo} className="form-grid__completo">
          Revisar prioridad de {resumen.referencia}
        </h3>
        <p className="form-grid__completo nota-panel">
          Vigente: {PRIORIDAD[resumen.prioridad].texto}
          {resumen.prioridadOrigen === 'propuesta' ? ' (propuesta por la categoría)' : resumen.prioridadOrigen === 'revisada' ? ' (revisada)' : ''}. No es triaje
          clínico ni cambia el orden de llegada de la bandeja.
        </p>
        {fallo ? (
          <div className="form-grid__completo" role="status">
            <Mensaje tipo="error" titulo="No se revisó la prioridad">{fallo}</Mensaje>
          </div>
        ) : null}
        <div className="form-grid__completo">
          <GrupoOpciones leyenda="Prioridad" opciones={VALORES_PRIORIDAD} valor={valor} alCambiar={setValor} error={errores.valor} deshabilitado={enviando} />
        </div>
        <Campo
          etiqueta="Motivo"
          ayuda="Entre 10 y 500 caracteres. Queda registrado con tu cuenta."
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          error={errores.motivo}
          required
        />
        <div className="acciones-tarjeta form-grid__completo">
          <Boton type="submit" cargando={enviando}>
            Guardar prioridad
          </Boton>
          <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
