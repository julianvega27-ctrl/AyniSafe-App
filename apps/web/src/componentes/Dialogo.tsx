import { useEffect, useRef, type ReactNode } from 'react';

/** Diálogo nativo: foco contenido, Escape y retorno al control que lo abrió. */
export function Dialogo({ tituloId, ocupado, onCerrar, children }: {
  readonly tituloId: string;
  readonly ocupado: boolean;
  readonly onCerrar: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialogo = ref.current!;
    const previo = document.activeElement;
    // jsdom no implementa showModal; el navegador usa siempre el diálogo modal nativo.
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else dialogo.setAttribute('open', '');
    return () => {
      if (typeof dialogo.close === 'function') dialogo.close();
      if (previo instanceof HTMLElement && previo.isConnected) previo.focus();
    };
  }, []);
  return <dialog ref={ref} className="dialogo panel" aria-labelledby={tituloId} aria-modal="true" onKeyDown={e => {
    if (e.key !== 'Tab') return;
    const controles = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')];
    const primero = controles[0];
    const ultimo = controles.at(-1);
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo?.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus(); }
  }} onCancel={e => {
    e.preventDefault();
    if (!ocupado) onCerrar();
  }}>{children}</dialog>;
}
