import { useId, useState, type FormEvent } from 'react';
import { api, type CodigoNoPublicable, type PublicacionOperador, type ResumenIncidente } from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { Dialogo } from '../../componentes/Dialogo';
import { Icono } from '../../componentes/iconos';
import { Mensaje } from '../../componentes/Mensaje';
import { useSesion } from '../../sesion/SesionContexto';
import { CAUSA_RETIRO, CONFLICTO_ATENCION, ESTADO, fecha } from './etiquetas';

/**
 * Publicacion en el mapa ciudadano (P7, spec `web/bandeja-incidentes`). Muestra el estado, la vista
 * previa de lo que se vera en el mapa publico y solo las acciones que la API permite. Composicion
 * `mini-card`/`kv` y componentes compartidos, sin estilos locales.
 */

const NO_PUBLICABLE: Record<CodigoNoPublicable, string> = {
  NO_VERIFICADO: 'Se publicará en el mapa ciudadano al marcarlo verificado.',
  FUERA_DE_VIGENCIA: 'Ocurrió hace más de 7 días: ya no se puede publicar.',
  DISTRITO_PENDIENTE: 'El distrito está pendiente: no se puede publicar.',
  INCIDENTE_CERRADO: 'El caso está cerrado y salió del mapa.',
  INCIDENTE_VINCULADO: 'Está vinculado a otro reporte: se publica, si corresponde, el incidente principal.',
};

type Modo = 'publicar' | 'retirar' | 'reservar' | 'quitar_reserva';

const largo = (t: string) => [...t.trim()].length;

function estadoTexto(p: PublicacionOperador): string {
  switch (p.estado) {
    case 'VIGENTE':
      return `Publicado hasta ${fecha(p.venceEn!)}${p.reservada ? ' · reservado' : ''}`;
    case 'RETIRADA':
      return `No publicado: ${CAUSA_RETIRO[p.causaRetiro ?? ''] ?? 'retirado'}`;
    case 'VENCIDA':
      return `La publicación venció el ${fecha(p.venceEn!)} (7 días desde la ocurrencia)`;
    default:
      return 'No publicado';
  }
}

/** Lo que vera el ciudadano en el mapa publico: nunca descripcion, fotos ni datos personales. */
function VistaPrevia({ resumen, p }: { resumen: ResumenIncidente; p: PublicacionOperador }) {
  const soloConteo = p.sensible || p.reservada;
  return (
    <div className="mini-card" aria-live="polite">
      <span className="eyebrow">Lo que verá la ciudadanía</span>
      {soloConteo ? (
        <span>
          {p.sensible ? 'Categoría reservada' : 'Caso reservado'}: no se muestra como punto. Solo cuenta en el total por distrito y mes, si
          hay al menos cinco casos.
        </span>
      ) : (
        <span>
          {resumen.categoria.nombre ?? 'Incidente'} · {resumen.distrito?.nombre ?? 'Distrito pendiente'} · zona aproximada de 300 m ·{' '}
          {ESTADO[resumen.estado]} · antigüedad desde la ocurrencia
        </span>
      )}
      <span className="metadatos">Nunca se publican la descripción, las fotos, el teléfono ni la ubicación exacta.</span>
    </div>
  );
}

export function BloquePublicacion({ resumen, onActualizado }: { resumen: ResumenIncidente; onActualizado: (aviso: string) => void }) {
  const p = resumen.atencion?.publicacion;
  const [modo, setModo] = useState<Modo | null>(null);
  if (!p || resumen.papel !== 'principal') return null;
  const puede = (a: Modo) => p.accionesPermitidas.includes(a);
  const explicacion = p.estado !== 'VIGENTE' && p.noPublicable ? NO_PUBLICABLE[p.noPublicable] : null;

  return (
    <li className="mini-card">
      <span className="eyebrow">Publicación en el mapa</span>
      <strong>
        <Icono nombre={p.estado === 'VIGENTE' ? 'exito' : 'info'} /> {estadoTexto(p)}
      </strong>
      {explicacion ? <span>{explicacion}</span> : null}
      {p.estado === 'VIGENTE' || puede('publicar') ? <VistaPrevia resumen={resumen} p={p} /> : null}
      {p.accionesPermitidas.length ? (
        <div className="acciones-tarjeta">
          {puede('publicar') ? <Boton onClick={() => setModo('publicar')}>Publicar en el mapa</Boton> : null}
          {puede('retirar') ? (
            <Boton variante="secundario" onClick={() => setModo('retirar')}>
              Retirar
            </Boton>
          ) : null}
          {puede('reservar') ? (
            <Boton variante="secundario" onClick={() => setModo('reservar')}>
              Reservar
            </Boton>
          ) : null}
          {puede('quitar_reserva') ? (
            <Boton variante="secundario" onClick={() => setModo('quitar_reserva')}>
              Quitar reserva
            </Boton>
          ) : null}
        </div>
      ) : null}
      {modo ? (
        <DialogoPublicacion
          resumen={resumen}
          modo={modo}
          onCerrar={() => setModo(null)}
          onResultado={(aviso) => {
            setModo(null);
            onActualizado(aviso);
          }}
        />
      ) : null}
    </li>
  );
}

const TITULO: Record<Modo, string> = {
  publicar: 'Publicar en el mapa',
  retirar: 'Retirar del mapa',
  reservar: 'Reservar el caso',
  quitar_reserva: 'Quitar la reserva',
};

const EXPLICA: Record<Modo, string> = {
  publicar:
    'Vuelves a mostrar este incidente verificado en el mapa ciudadano, como zona aproximada, hasta 7 días desde la ocurrencia. Saldrá del mapa al cerrarlo.',
  retirar: 'Deja de mostrarse en el mapa de inmediato. Para volver a publicarlo hará falta otra autorización del responsable.',
  reservar: 'El caso dejará de mostrarse como punto y solo contará en el total por distrito y mes.',
  quitar_reserva: 'El caso volverá a mostrarse como zona aproximada en el mapa.',
};

function DialogoPublicacion({ resumen, modo, onCerrar, onResultado }: {
  resumen: ResumenIncidente;
  modo: Modo;
  onCerrar: () => void;
  onResultado: (aviso: string) => void;
}) {
  const { expirar } = useSesion();
  const idTitulo = useId();
  const idReserva = useId();
  const [reservada, setReservada] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const pideMotivo = modo !== 'publicar' || reservada;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const locales: Record<string, string> = {};
    if (pideMotivo && (largo(motivo) < 10 || largo(motivo) > 500)) locales.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
    setErrores(locales);
    if (Object.keys(locales).length) return;
    setEnviando(true);
    setFallo(null);
    const r =
      modo === 'publicar'
        ? await api.publicarIncidente(resumen.id, {
            estadoEsperado: resumen.estado,
            ...(reservada ? { reservada: true, motivoReserva: motivo.trim() } : {}),
          })
        : modo === 'retirar'
          ? await api.retirarPublicacion(resumen.id, motivo.trim())
          : await api.reservarPublicacion(resumen.id, modo === 'reservar', motivo.trim());
    setEnviando(false);
    if (r.tipo === 'ok') {
      return onResultado(
        modo === 'publicar'
          ? 'Incidente publicado en el mapa como zona aproximada.'
          : modo === 'retirar'
            ? 'Publicación retirada del mapa.'
            : modo === 'reservar'
              ? 'Caso reservado: ya no se muestra como punto.'
              : 'Reserva quitada.',
      );
    }
    if (r.tipo === 'error' && r.estado === 401) return expirar();
    if (r.tipo === 'error' && r.estado === 400) {
      const c = r.campos ?? {};
      return setErrores({ motivo: c.motivo ?? c.motivoReserva ?? 'Revisa los datos.' });
    }
    if (r.tipo === 'error' && r.codigo && CONFLICTO_ATENCION[r.codigo]) return onResultado(CONFLICTO_ATENCION[r.codigo]!);
    setFallo('No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo; no se duplicará.');
  }

  return (
    <Dialogo tituloId={idTitulo} ocupado={enviando} onCerrar={onCerrar}>
      <form className="form-grid compact" onSubmit={(e) => void enviar(e)} aria-labelledby={idTitulo} noValidate>
        <h3 id={idTitulo} className="form-grid__completo">
          {TITULO[modo]}: {resumen.referencia}
        </h3>
        <p className="form-grid__completo nota-panel">{EXPLICA[modo]}</p>
        {fallo ? (
          <div className="form-grid__completo" role="status">
            <Mensaje tipo="error" titulo="No se completó la acción">{fallo}</Mensaje>
          </div>
        ) : null}
        {modo === 'publicar' ? (
          <div className="check form-grid__completo">
            <input id={idReserva} type="checkbox" checked={reservada} onChange={(e) => setReservada(e.target.checked)} disabled={enviando} />
            <label htmlFor={idReserva}>Publicar como caso reservado (solo en el total por distrito y mes)</label>
          </div>
        ) : null}
        {pideMotivo ? (
          <Campo
            etiqueta="Motivo"
            ayuda="Entre 10 y 500 caracteres. Solo lo ve tu institución; queda registrado con tu cuenta."
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
            error={errores.motivo}
            required
          />
        ) : null}
        <div className="acciones-tarjeta form-grid__completo">
          <Boton type="submit" cargando={enviando}>
            {TITULO[modo]}
          </Boton>
          <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
