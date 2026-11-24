import { Route, Routes } from 'react-router';
import { BotonEnlace } from './componentes/Boton';
import { Estructura, MarcoApp, useTitulo } from './componentes/Estructura';
import { Acceso } from './paginas/Acceso';
import { Activar } from './paginas/Activar';
import { PanelInicio, PanelRol, RutaProtegida } from './paginas/Panel';
import { Portada } from './paginas/Portada';

function NoEncontrada() {
  useTitulo('Página no encontrada');
  return (
    <Estructura>
      <h1>Página no encontrada</h1>
      <p>La dirección que abriste no existe.</p>
      <BotonEnlace to="/">Ir a la portada</BotonEnlace>
    </Estructura>
  );
}

/** Rutas publicas (portada, acceso, activacion) separadas de las del panel, que pasan por el guard. */
export function App() {
  return (
    <Routes>
      <Route element={<MarcoApp />}>
      <Route path="/" element={<Portada />} />
      <Route path="/acceso" element={<Acceso />} />
      <Route path="/activar" element={<Activar />} />
      <Route
        path="/panel"
        element={
          <RutaProtegida>
            <PanelInicio />
          </RutaProtegida>
        }
      />
      <Route
        path="/panel/administrador"
        element={
          <RutaProtegida>
            <PanelRol rol="administrador" />
          </RutaProtegida>
        }
      />
      <Route
        path="/panel/operador"
        element={
          <RutaProtegida>
            <PanelRol rol="operador" />
          </RutaProtegida>
        }
      />
      <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
