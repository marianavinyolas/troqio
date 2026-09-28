import { Insignia } from '@renderer/componentes/ui/Insignia'
import { Vacio } from '@renderer/componentes/ui/Vacio'
import type { Ruta } from '@renderer/rutas'

/**
 * Marcador de posicion para las pantallas de los proximos hitos.
 *
 * El hito 1 construye el shell, no las funcionalidades. En vez de esconder los
 * destinos futuros, se dejan visibles y se explica cuando llegan: asi el
 * cambio de pantalla del proximo hito es agregar un `case`, no repintar la
 * navegacion.
 */
export function Proximamente({ ruta }: { ruta: Ruta }) {
  return (
    <Vacio
      icono={ruta.icono}
      titulo={`${ruta.etiqueta} todavía no está disponible`}
      descripcion={ruta.descripcion}
      accion={<Insignia tono="marca">Llega en {ruta.hito}</Insignia>}
    />
  )
}
