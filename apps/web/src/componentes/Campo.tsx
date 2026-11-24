import { useId, useState, type InputHTMLAttributes } from 'react';
import { Icono } from './iconos';

interface PropsCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly etiqueta: string;
  readonly ayuda?: string;
  readonly error?: string;
}

/** Campo con etiqueta persistente, ayuda y error junto al campo. Admite autocompletado y pegado. */
export function Campo({ etiqueta, ayuda, error, ...entrada }: PropsCampo) {
  const id = useId();
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      {ayuda ? (
        <p className="campo__ayuda" id={idAyuda}>
          {ayuda}
        </p>
      ) : null}
      <input
        {...entrada}
        id={id}
        className="campo__entrada"
        aria-invalid={error ? true : undefined}
        aria-describedby={[idAyuda, idError].filter(Boolean).join(' ') || undefined}
      />
      {error ? (
        <p className="campo__error" id={idError}>
          <Icono nombre="error" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Contrasena con control Mostrar/Ocultar. Permite pegar (no hay manejadores de pegado) y gestores de
 * contrasenas. El valor vive solo en el estado del formulario: nunca se guarda en el navegador.
 */
export function CampoContrasena({ etiqueta, ayuda, error, ...entrada }: Omit<PropsCampo, 'type'>) {
  const id = useId();
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  const [visible, setVisible] = useState(false);
  return (
    <div className="campo">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      {ayuda ? (
        <p className="campo__ayuda" id={idAyuda}>
          {ayuda}
        </p>
      ) : null}
      <div className="campo__fila">
        <input
          {...entrada}
          id={id}
          type={visible ? 'text' : 'password'}
          className="campo__entrada"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={[idAyuda, idError].filter(Boolean).join(' ') || undefined}
        />
        <button
          type="button"
          className="boton boton--secundario"
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error ? (
        <p className="campo__error" id={idError}>
          <Icono nombre="error" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
