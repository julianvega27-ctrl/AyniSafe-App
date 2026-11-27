import { describe, expect, it } from '@jest/globals';
import { InvitarCuentaUseCase } from '../../src/modules/identidad/aplicacion/invitar-cuenta.use-case';
import {
  AdministrarOrganizacionUseCase,
  AgregarOperadorUseCase,
  CrearSedeConOperadorUseCase,
  ReenviarInvitacionUseCase,
} from '../../src/modules/identidad/aplicacion/organizacion.use-case';
import type { EnviosCorreoPort } from '../../src/modules/identidad/aplicacion/puertos/envios-correo.port';
import type {
  CatalogoIdsPort,
  OrganizacionPort,
  TransaccionOrganizacion,
} from '../../src/modules/identidad/aplicacion/puertos/organizacion.port';
import { ValidacionError } from '../../src/modules/identidad/dominio/errores';
import {
  ConflictoOrganizacionError,
  CorreoOperadorEnUsoError,
  normalizarNombreSede,
  RecursoNoEncontradoError,
  requisitosFaltantes,
  SedeExistenteError,
  type Sede,
} from '../../src/modules/identidad/dominio/organizacion';
import {
  validarAltaOperador,
  validarAltaSede,
  validarCambioOperador,
  validarCambiosInstitucion,
  validarCambiosSede,
  validarConjunto,
} from '../../src/modules/identidad/dominio/validacion-organizacion';

const ALTA = {
  institucionId: 'pnp',
  nombre: '  Comisaría   PNP Ayacucho ',
  operador: { nombre: 'Rosa Quispe', correo: ' Rosa@Ejemplo.com ' },
};

describe('validacion de organizacion', () => {
  it('alta de sede: normaliza correo, recorta textos y exige operador inicial', () => {
    const r = validarAltaSede(ALTA);
    expect(r).toEqual({
      ok: true,
      valor: {
        institucionId: 'pnp', nombre: 'Comisaría   PNP Ayacucho', distritoUbicacionId: null, direccion: null,
        contacto: null, esDemostracion: false, operador: { nombre: 'Rosa Quispe', correoNormalizado: 'rosa@ejemplo.com' },
      },
    });
    const sinOperador = validarAltaSede({ institucionId: 'pnp', nombre: 'Sede' });
    expect(sinOperador.ok).toBe(false);
    expect(!sinOperador.ok && sinOperador.campos.operador).toBeDefined();
  });

  it('rechaza campos desconocidos (rol, contrasena), otro tipo de institucion y tipos incorrectos', () => {
    for (const extra of [{ rol: 'administrador' }, { contrasena: 'x'.repeat(20) }]) {
      const r = validarAltaSede({ ...ALTA, ...extra });
      expect(!r.ok && r.campos.cuerpo).toBe('El cuerpo contiene campos no admitidos.');
    }
    const conClave = validarAltaSede({ ...ALTA, operador: { ...ALTA.operador, contrasena: 'clave' } });
    expect(!conClave.ok && conClave.campos.operador).toBeDefined();
    for (const institucionId of ['municipalidad', 'otra', 'PNP', 1, null]) {
      const r = validarAltaSede({ ...ALTA, institucionId });
      expect(!r.ok && r.campos.institucionId).toBeDefined();
    }
    const tipos = validarAltaSede({ ...ALTA, nombre: 5, esDemostracion: 'si', distritoUbicacionId: 'Ayacucho' });
    expect(!tipos.ok && Object.keys(tipos.campos).sort()).toEqual(['distritoUbicacionId', 'esDemostracion', 'nombre']);
    expect(validarAltaSede(null).ok).toBe(false);
    expect(validarAltaSede([]).ok).toBe(false);
  });

  it('longitudes en puntos de codigo y correo invalido sin repetir el valor', () => {
    const largo = validarAltaSede({ ...ALTA, nombre: '\u{1F3E2}'.repeat(151) });
    expect(!largo.ok && largo.campos.nombre).toMatch(/150/);
    expect(validarAltaSede({ ...ALTA, nombre: '\u{1F3E2}'.repeat(150) }).ok).toBe(true);
    const correo = validarAltaSede({ ...ALTA, operador: { nombre: 'X', correo: 'secreto-sin-arroba' } });
    expect(!correo.ok && JSON.stringify(correo.campos)).not.toContain('secreto');
  });

  it('alta de operador, cambios de institucion, sede y operador', () => {
    expect(validarAltaOperador({ nombre: 'Ana', correo: 'ana@ejemplo.com', esDemostracion: true })).toEqual({
      ok: true, valor: { nombre: 'Ana', correoNormalizado: 'ana@ejemplo.com', esDemostracion: true },
    });
    expect(validarAltaOperador({ nombre: 'Ana', correo: 'ana@ejemplo.com', sedeId: 'x' }).ok).toBe(false);
    expect(validarCambiosInstitucion({ contacto: '' })).toEqual({ ok: true, valor: { contacto: null } });
    expect(validarCambiosInstitucion({ tipo: 'samu' }).ok).toBe(false);
    expect(validarCambiosInstitucion({}).ok).toBe(false);
    expect(validarCambiosSede({ verificacion: { estado: 'verificada', fuente: 'Oficio 12', fecha: '2026-11-25' } })).toEqual({
      ok: true, valor: { verificacion: { estado: 'verificada', fuente: 'Oficio 12', fecha: '2026-11-25' } },
    });
    for (const fecha of ['2026-02-30', '25/11/2026', 20261125]) {
      expect(validarCambiosSede({ verificacion: { estado: 'verificada', fuente: 'X', fecha } }).ok).toBe(false);
    }
    expect(validarCambiosSede({ verificacion: { estado: 'verificada' } }).ok).toBe(false);
    expect(validarCambiosSede({ habilitadaAtencion: true }).ok).toBe(false);
    expect(validarCambioOperador({ estado: 'suspendido' })).toEqual({ ok: true, valor: { estado: 'suspendido' } });
    expect(validarCambioOperador({ estado: 'pendiente_activacion' }).ok).toBe(false);
    expect(validarCambioOperador({ estado: 'activo', rol: 'administrador' }).ok).toBe(false);
  });

  it('conjuntos completos: ordena, rechaza repetidos, formatos y exceso', () => {
    expect(validarConjunto({ distritos: ['DIS-03', 'DIS-01'] }, 'distritos')).toEqual({ ok: true, valor: ['DIS-01', 'DIS-03'] });
    expect(validarConjunto({ distritos: [] }, 'distritos')).toEqual({ ok: true, valor: [] });
    expect(validarConjunto({ distritos: ['DIS-01', 'DIS-01'] }, 'distritos').ok).toBe(false);
    expect(validarConjunto({ distritos: ['Ayacucho'] }, 'distritos').ok).toBe(false);
    expect(validarConjunto({ distritos: 'DIS-01' }, 'distritos').ok).toBe(false);
    expect(validarConjunto({ categorias: ['Robo'] }, 'categorias').ok).toBe(false);
    expect(validarConjunto({ categorias: Array.from({ length: 33 }, (_, i) => `c${'a'.repeat(i)}`) }, 'categorias').ok).toBe(false);
    expect(validarConjunto({ categorias: ['robo'], extra: 1 }, 'categorias').ok).toBe(false);
  });

  it('normaliza el nombre de sede para la unicidad', () => {
    expect(normalizarNombreSede('  Comisaría   PNP  ')).toBe('comisaría pnp');
  });
});

describe('requisitos de habilitacion', () => {
  const completo = { institucionActiva: true, sedeActiva: true, verificada: true, distritos: 1, categorias: 2, operadoresActivos: 1 };
  it('vacio cuando se cumplen todos, y lista estable de faltantes', () => {
    expect(requisitosFaltantes(completo)).toEqual([]);
    expect(requisitosFaltantes({ institucionActiva: false, sedeActiva: false, verificada: false, distritos: 0, categorias: 0, operadoresActivos: 0 }))
      .toEqual(['institucion_activa', 'sede_activa', 'sede_verificada', 'cobertura', 'competencias', 'operador_activo']);
    expect(requisitosFaltantes({ ...completo, operadoresActivos: 0 })).toEqual(['operador_activo']);
  });
});

// --- Casos de uso con dobles -------------------------------------------------------------

const SEDE: Sede = {
  id: '11111111-1111-4111-8111-111111111111', institucionId: 'pnp', nombre: 'Sede', distritoUbicacionId: null,
  direccion: null, contacto: null, verificacion: { estado: 'sin_verificar', fuente: null, fecha: null },
  habilitadaAtencion: false, activa: true, esDemostracion: false, distritos: [], categorias: [],
};

interface Doble {
  readonly pasos: string[];
  readonly organizacion: OrganizacionPort;
  readonly envios: EnviosCorreoPort;
  confirmadas: number;
}

function doble(opciones: { sedeExiste?: boolean; correoLibre?: boolean; institucionActiva?: boolean; falloInvitacion?: boolean; estado?: 'activo' | 'pendiente_activacion' | null } = {}): Doble {
  const pasos: string[] = [];
  const contexto = { transaccion: true };
  const d: Doble = {
    pasos,
    confirmadas: 0,
    envios: {
      encolar: async (_n: unknown, tx: unknown) => {
        pasos.push(tx === contexto ? 'encolar-en-tx' : 'encolar-fuera');
        if (opciones.falloInvitacion) throw new Error('fallo del envio');
        return true;
      },
    } as unknown as EnviosCorreoPort,
    organizacion: {} as OrganizacionPort,
  };
  const tx: TransaccionOrganizacion = {
    contexto,
    bloquearInstitucionActiva: async () => { pasos.push('bloquear-institucion'); return opciones.institucionActiva ?? true; },
    bloquearSede: async () => { pasos.push('bloquear-sede'); return opciones.sedeExiste ?? true; },
    insertarSede: async () => { pasos.push('insertar-sede'); return opciones.sedeExiste === false ? null : SEDE.id; },
    insertarOperadorPendiente: async () => { pasos.push('insertar-operador'); return opciones.correoLibre === false ? null : '22222222-2222-4222-8222-222222222222'; },
    prepararReenvio: async () => { pasos.push('preparar-reenvio'); return opciones.estado === undefined ? 'pendiente_activacion' : opciones.estado; },
  };
  const sinUso = async () => { throw new Error('no se esperaba esta llamada'); };
  (d as { organizacion: OrganizacionPort }).organizacion = {
    enTransaccion: async (fn) => {
      const r = await fn(tx);
      d.confirmadas += 1;
      pasos.push('commit');
      return r;
    },
    obtenerSede: async () => SEDE,
    listarInstituciones: sinUso, actualizarInstitucion: sinUso, listarSedes: sinUso, actualizarSede: sinUso,
    reemplazarCobertura: async (_id, ids) => ({ ...SEDE, distritos: [...ids] }),
    reemplazarCompetencias: async (_id, ids) => ({ ...SEDE, categorias: [...ids] }),
    habilitar: sinUso, deshabilitar: sinUso, listarOperadores: async () => null, cambiarEstadoOperador: sinUso, ambitoDeOperador: sinUso,
    sedesElegibles: sinUso, estadoDesignacion: sinUso,
  };
  return d;
}

const reloj = { ahora: () => new Date('2026-11-25T12:00:00.000Z') };
const distritos: CatalogoIdsPort = { idsValidos: async () => new Set(['DIS-01', 'DIS-02']) };
const categorias: CatalogoIdsPort = { idsValidos: async () => new Set(['robo', 'asalto']) };

describe('CrearSedeConOperadorUseCase', () => {
  it('orquesta institucion → sede → operador → invitacion en la misma transaccion y despierta tras el commit', async () => {
    const d = doble();
    let despertado = 0;
    const caso = new CrearSedeConOperadorUseCase(d.organizacion, new InvitarCuentaUseCase(d.envios, reloj), distritos, () => {
      d.pasos.push('despertar');
      despertado += 1;
    });
    const r = await caso.ejecutar(ALTA, 'admin-id');
    expect(d.pasos).toEqual(['bloquear-institucion', 'insertar-sede', 'insertar-operador', 'encolar-en-tx', 'commit', 'despertar']);
    expect(despertado).toBe(1);
    expect(r.operador).toMatchObject({ estado: 'pendiente_activacion', correo: 'rosa@ejemplo.com', sedeId: SEDE.id });
  });

  it('traduce sede existente y correo en uso, sin confirmar ni despertar', async () => {
    for (const [opciones, error] of [[{ sedeExiste: false }, SedeExistenteError], [{ correoLibre: false }, CorreoOperadorEnUsoError]] as const) {
      const d = doble(opciones);
      let despertado = false;
      const caso = new CrearSedeConOperadorUseCase(d.organizacion, new InvitarCuentaUseCase(d.envios, reloj), distritos, () => { despertado = true; });
      await expect(caso.ejecutar(ALTA, 'admin')).rejects.toBeInstanceOf(error);
      expect(d.confirmadas).toBe(0);
      expect(despertado).toBe(false);
    }
  });

  it('si falla la invitacion no se confirma ni se despierta; institucion inactiva y distrito ajeno son 400', async () => {
    const d = doble({ falloInvitacion: true });
    let despertado = false;
    const caso = new CrearSedeConOperadorUseCase(d.organizacion, new InvitarCuentaUseCase(d.envios, reloj), distritos, () => { despertado = true; });
    await expect(caso.ejecutar(ALTA, 'admin')).rejects.toThrow('fallo del envio');
    expect(d.confirmadas).toBe(0);
    expect(despertado).toBe(false);

    const inactiva = doble({ institucionActiva: false });
    await expect(new CrearSedeConOperadorUseCase(inactiva.organizacion, new InvitarCuentaUseCase(inactiva.envios, reloj), distritos, () => {})
      .ejecutar(ALTA, 'admin')).rejects.toBeInstanceOf(ValidacionError);
    const ajeno = doble();
    await expect(new CrearSedeConOperadorUseCase(ajeno.organizacion, new InvitarCuentaUseCase(ajeno.envios, reloj), distritos, () => {})
      .ejecutar({ ...ALTA, distritoUbicacionId: 'DIS-07' }, 'admin')).rejects.toBeInstanceOf(ValidacionError);
    expect(ajeno.pasos).toEqual([]);
  });
});

describe('AgregarOperadorUseCase y ReenviarInvitacionUseCase', () => {
  it('agrega con invitacion en la transaccion; sede inexistente o id no UUID es 404 sin insertar', async () => {
    const d = doble();
    const caso = new AgregarOperadorUseCase(d.organizacion, new InvitarCuentaUseCase(d.envios, reloj), () => d.pasos.push('despertar'));
    await caso.ejecutar(SEDE.id, { nombre: 'Ana', correo: 'ana@ejemplo.com' });
    expect(d.pasos).toEqual(['bloquear-sede', 'insertar-operador', 'encolar-en-tx', 'commit', 'despertar']);
    const sinSede = doble({ sedeExiste: false });
    await expect(new AgregarOperadorUseCase(sinSede.organizacion, new InvitarCuentaUseCase(sinSede.envios, reloj), () => {})
      .ejecutar(SEDE.id, { nombre: 'Ana', correo: 'ana@ejemplo.com' })).rejects.toBeInstanceOf(RecursoNoEncontradoError);
    expect(sinSede.pasos).toEqual(['bloquear-sede']);
    await expect(caso.ejecutar('no-es-uuid', { nombre: 'Ana', correo: 'ana@ejemplo.com' })).rejects.toBeInstanceOf(RecursoNoEncontradoError);
  });

  it('reenvia solo a pendientes: activo es conflicto e inexistente es 404', async () => {
    const d = doble();
    await new ReenviarInvitacionUseCase(d.organizacion, new InvitarCuentaUseCase(d.envios, reloj), () => d.pasos.push('despertar'))
      .ejecutar('22222222-2222-4222-8222-222222222222');
    expect(d.pasos).toEqual(['preparar-reenvio', 'encolar-en-tx', 'commit', 'despertar']);
    for (const [estado, error] of [['activo', ConflictoOrganizacionError], [null, RecursoNoEncontradoError]] as const) {
      const x = doble({ estado });
      await expect(new ReenviarInvitacionUseCase(x.organizacion, new InvitarCuentaUseCase(x.envios, reloj), () => {})
        .ejecutar('22222222-2222-4222-8222-222222222222')).rejects.toBeInstanceOf(error);
      expect(x.pasos).not.toContain('encolar-en-tx');
    }
  });
});

describe('AdministrarOrganizacionUseCase', () => {
  it('valida identificadores contra los catalogos inyectados antes de persistir', async () => {
    const d = doble();
    const caso = new AdministrarOrganizacionUseCase(d.organizacion, distritos, categorias, reloj);
    expect((await caso.reemplazarCobertura(SEDE.id, { distritos: ['DIS-02', 'DIS-01'] })).distritos).toEqual(['DIS-01', 'DIS-02']);
    await expect(caso.reemplazarCobertura(SEDE.id, { distritos: ['DIS-05'] })).rejects.toBeInstanceOf(ValidacionError);
    await expect(caso.reemplazarCompetencias(SEDE.id, { categorias: ['incendio'] })).rejects.toBeInstanceOf(ValidacionError);
    expect((await caso.reemplazarCompetencias(SEDE.id, { categorias: [] })).categorias).toEqual([]);
    await expect(caso.listarOperadores(SEDE.id)).rejects.toBeInstanceOf(RecursoNoEncontradoError);
    await expect(caso.actualizarInstitucion('municipalidad', { nombre: 'X' })).rejects.toBeInstanceOf(RecursoNoEncontradoError);
  });

  it('un catalogo no disponible se traduce a servicio no disponible', async () => {
    const d = doble();
    const roto: CatalogoIdsPort = { idsValidos: async () => { throw new Error('caido'); } };
    const caso = new AdministrarOrganizacionUseCase(d.organizacion, roto, roto, reloj);
    await expect(caso.reemplazarCobertura(SEDE.id, { distritos: ['DIS-01'] })).rejects.toMatchObject({ name: 'ServicioNoDisponibleError' });
  });
});
