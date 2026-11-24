import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Boton, BotonEnlace } from '../src/componentes/Boton';
import { Campo, CampoContrasena } from '../src/componentes/Campo';
import { Mensaje, type TipoMensaje } from '../src/componentes/Mensaje';

describe('Boton: estados normal, pulsado, cargando y deshabilitado', () => {
  it('normal: ejecuta la accion y es un boton de formulario seguro por defecto', async () => {
    const accion = vi.fn();
    render(<Boton onClick={accion}>Guardar</Boton>);
    const b = screen.getByRole('button', { name: 'Guardar' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveClass('boton');
    await userEvent.click(b);
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it('cargando: sigue enfocable, anuncia que esta ocupado e ignora nuevas pulsaciones', async () => {
    const accion = vi.fn();
    render(<Boton cargando onClick={accion}>Guardar</Boton>);
    const b = screen.getByRole('button', { name: 'Guardar' });
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).not.toBeDisabled();
    b.focus();
    expect(b).toHaveFocus();
    await userEvent.click(b);
    expect(accion).not.toHaveBeenCalled();
  });

  it('deshabilitado: no se puede activar', async () => {
    const accion = vi.fn();
    render(
      <Boton disabled onClick={accion}>
        Guardar
      </Boton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('el enlace con aspecto de boton comparte las clases (altura minima de 48 px por CSS)', () => {
    render(
      <MemoryRouter>
        <BotonEnlace to="/acceso" variante="secundario">
          Acceso
        </BotonEnlace>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Acceso' })).toHaveClass('boton', 'boton--secundario');
  });
});

describe('Mensaje: texto e icono, nunca solo color', () => {
  it.each(['info', 'exito', 'aviso', 'error'] as TipoMensaje[])('%s lleva icono decorativo y texto', (tipo) => {
    const { container } = render(
      <Mensaje tipo={tipo} titulo="Titulo del mensaje">
        Explicacion comprensible.
      </Mensaje>,
    );
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Titulo del mensaje')).toBeInTheDocument();
    expect(screen.getByText('Explicacion comprensible.')).toBeInTheDocument();
  });

  it('los errores se anuncian de forma asertiva y el resto como estado', () => {
    const { rerender } = render(<Mensaje tipo="error" titulo="x" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<Mensaje tipo="info" titulo="x" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('puede incluir una accion para continuar', () => {
    render(<Mensaje tipo="error" titulo="Fallo" accion={<button type="button">Reintentar</button>} />);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('Campo: etiqueta persistente, ayuda, error y autocompletado', () => {
  it('asocia etiqueta, ayuda y error con el campo y marca el estado invalido', () => {
    render(<Campo etiqueta="Correo" ayuda="Usa tu correo institucional." error="Ingresa un correo válido." autoComplete="username" />);
    const campo = screen.getByLabelText('Correo');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('autocomplete', 'username');
    expect(campo).toHaveAccessibleDescription('Usa tu correo institucional. Ingresa un correo válido.');
    expect(screen.getByText('Ingresa un correo válido.').closest('p')!.querySelector('svg')).not.toBeNull();
  });

  it('sin error no declara estado invalido', () => {
    render(<Campo etiqueta="Nombre" />);
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid');
  });

  it('la contrasena empieza oculta, se puede mostrar y no desactiva el pegado', async () => {
    render(<CampoContrasena etiqueta="Contraseña" autoComplete="new-password" />);
    const campo = screen.getByLabelText('Contraseña');
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveAttribute('autocomplete', 'new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(campo).toHaveAttribute('type', 'text');
    await userEvent.click(campo);
    await userEvent.paste('pegado con espacios');
    expect(campo).toHaveValue('pegado con espacios');
  });
});
