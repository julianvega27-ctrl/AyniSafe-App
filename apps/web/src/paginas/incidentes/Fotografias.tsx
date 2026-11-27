import { useEffect, useState } from 'react';
import { api, type EvidenciaVista } from '../../api/cliente';
import { Boton } from '../../componentes/Boton';
import { Dialogo } from '../../componentes/Dialogo';
import { Icono } from '../../componentes/iconos';
import { useSesion } from '../../sesion/SesionContexto';
import { fecha } from './etiquetas';

type EstadoFoto = { readonly estado: 'cargando' } | { readonly estado: 'lista'; readonly url: string } | { readonly estado: 'no-disponible' };

const alt = (n: number) => `Fotografía ${n} enviada por el ciudadano`;

/**
 * «Fotografías» del resumen (P5.2), con la composición de `Incidents.jsx` del origen: rejilla de tarjetas
 * con imagen y pie. Cada imagen se pide con la cookie institucional, se muestra con una URL de objeto que
 * se revoca al salir y nunca se guarda en el navegador ni expone URLs del proveedor.
 */
export function Fotografias({ incidenteId, evidencias }: { readonly incidenteId: string; readonly evidencias: readonly EvidenciaVista[] }) {
  const { expirar } = useSesion();
  const [fotos, setFotos] = useState<Readonly<Record<string, EstadoFoto>>>({});
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const claves = evidencias.map((e) => e.id).join(',');

  useEffect(() => {
    const control = new AbortController();
    const urls: string[] = [];
    let vigente = true;
    setFotos({});
    for (const e of evidencias) {
      api
        .contenidoEvidencia(incidenteId, e.id, control.signal)
        .then((r) => {
          if (!vigente) return;
          if (r.tipo === 'ok') {
            const url = URL.createObjectURL(r.datos);
            urls.push(url);
            setFotos((f) => ({ ...f, [e.id]: { estado: 'lista', url } }));
          } else {
            if (r.tipo === 'error' && r.estado === 401) expirar();
            setFotos((f) => ({ ...f, [e.id]: { estado: 'no-disponible' } }));
          }
        })
        .catch(() => {
          /* cancelada al salir */
        });
    }
    return () => {
      vigente = false;
      control.abort();
      for (const u of urls) URL.revokeObjectURL(u);
    };
    // `claves` resume la lista de evidencias; evita recargar por una nueva referencia del mismo arreglo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidenteId, claves, expirar]);

  const actual = ampliada === null ? null : fotos[evidencias[ampliada]?.id ?? ''];
  return (
    <section className="panel" aria-labelledby="titulo-fotografias">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Evidencias</span>
          <h2 id="titulo-fotografias">Fotografías</h2>
        </div>
      </div>
      {evidencias.length === 0 ? (
        <p className="empty">El ciudadano no adjuntó fotografías.</p>
      ) : (
        <ul className="evidence-grid">
          {evidencias.map((e, i) => {
            const f = fotos[e.id] ?? { estado: 'cargando' };
            return (
              <li key={e.id}>
                <figure className="evidence-card">
                  {f.estado === 'lista' ? (
                    <button type="button" className="evidence-open" onClick={() => setAmpliada(i)} aria-label={`Ampliar ${alt(i + 1).toLowerCase()}`}>
                      <img src={f.url} alt={alt(i + 1)} />
                    </button>
                  ) : (
                    <div className="evidence-placeholder" role={f.estado === 'no-disponible' ? undefined : 'status'}>
                      <Icono nombre={f.estado === 'no-disponible' ? 'aviso' : 'reloj'} />
                      <span>{f.estado === 'no-disponible' ? `Fotografía ${i + 1} no disponible` : `Cargando fotografía ${i + 1}…`}</span>
                    </div>
                  )}
                  <figcaption>Adjuntada {fecha(e.adjuntadaEn)}</figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      )}
      {ampliada !== null && actual?.estado === 'lista' ? (
        <Dialogo tituloId="titulo-foto-ampliada" ocupado={false} onCerrar={() => setAmpliada(null)}>
          <h2 id="titulo-foto-ampliada">{alt(ampliada + 1)}</h2>
          <img className="evidence-zoom" src={actual.url} alt={alt(ampliada + 1)} />
          <Boton variante="secundario" onClick={() => setAmpliada(null)}>
            Cerrar
          </Boton>
        </Dialogo>
      ) : null}
    </section>
  );
}
