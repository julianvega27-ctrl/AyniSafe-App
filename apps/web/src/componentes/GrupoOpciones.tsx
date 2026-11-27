import { useId } from 'react';
import { Icono } from './iconos';

/**
 * Grupo de opciones de selección única con nombre accesible (fieldset + leyenda + radios). Usa la
 * composición `.choice-list` del origen, sin estilos locales. Operable con teclado: Tab entra al
 * grupo y las flechas cambian la opción; el lector anuncia la marcada. Sin preselección.
 */
export function GrupoOpciones<T extends string | number>({
  leyenda,
  opciones,
  valor,
  alCambiar,
  error,
  deshabilitado = false,
}: {
  readonly leyenda: string;
  readonly opciones: readonly (readonly [T, string])[];
  readonly valor: T | null;
  readonly alCambiar: (v: T) => void;
  readonly error?: string;
  readonly deshabilitado?: boolean;
}) {
  const nombre = useId();
  const idError = error ? `${nombre}-error` : undefined;
  return (
    <fieldset className="choice-list" aria-describedby={idError} aria-invalid={error ? true : undefined}>
      <legend>{leyenda}</legend>
      {opciones.map(([v, texto]) => (
        <label key={String(v)}>
          <input
            type="radio"
            name={nombre}
            checked={valor === v}
            disabled={deshabilitado}
            onChange={() => alCambiar(v)}
          />
          {texto}
        </label>
      ))}
      {error ? (
        <p className="campo__error" id={idError}>
          <Icono nombre="error" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
