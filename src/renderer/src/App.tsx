import { BarraSuperior } from '@renderer/componentes/BarraSuperior'
import { Navegacion } from '@renderer/componentes/Navegacion'
import { type ResultadoDiagnostico, useDiagnostico } from '@renderer/ganchos/useDiagnostico'
import { Catalogo } from '@renderer/pantallas/Catalogo'
import { Diagnostico } from '@renderer/pantallas/Diagnostico'
import { Estilos } from '@renderer/pantallas/Estilos'
import { Proximamente } from '@renderer/pantallas/Proximamente'
import { type IdRuta, obtenerRuta, RUTA_INICIAL } from '@renderer/rutas'
import { useState } from 'react'

/**
 * Shell de la app: riel de navegacion + cabecera + area de contenido.
 *
 * El hito 1 entrega solo esto. El enrutado es un `useState` a proposito: son
 * siete destinos y ninguno tiene URL, historial ni deep links. Cuando haga
 * falta (por ejemplo para abrir una ficha desde un resultado de busqueda) se
 * cambia por un router, no se agrega antes.
 */
export default function App() {
  const [rutaId, setRutaId] = useState<IdRuta>(RUTA_INICIAL)
  const { estado, datos, error } = useDiagnostico()

  const ruta = obtenerRuta(rutaId)

  return (
    <div className="flex h-full bg-canvas text-ink">
      <Navegacion activa={rutaId} onNavegar={setRutaId} version={datos?.appVersion ?? '0.0.0'} />

      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior titulo={ruta.etiqueta} descripcion={ruta.descripcion} />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-8 py-6">
            {pantalla(rutaId, { estado, datos, error })}
          </div>
        </main>
      </div>
    </div>
  )
}

/**
 * Que pantalla va en cada destino. Las que todavia no estan construidas caen
 * al marcador de posicion; cada hito que llega cambia una linea de aca.
 */
function pantalla(rutaId: IdRuta, diag: ResultadoDiagnostico) {
  switch (rutaId) {
    case 'catalogo':
      return <Catalogo />
    case 'diagnostico':
      return <Diagnostico {...diag} />
    case 'estilos':
      return <Estilos />
    default:
      return <Proximamente ruta={obtenerRuta(rutaId)} />
  }
}
