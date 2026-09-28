import { Icono } from '@renderer/componentes/Icono'
import { Boton, type VarianteBoton } from '@renderer/componentes/ui/Boton'
import { Campo } from '@renderer/componentes/ui/Campo'
import { Insignia, type TonoInsignia } from '@renderer/componentes/ui/Insignia'
import { Tarjeta } from '@renderer/componentes/ui/Tarjeta'
import { Vacio } from '@renderer/componentes/ui/Vacio'
import { cx } from '@renderer/cx'
import { NOMBRES_ICONO } from '@renderer/iconos'
import type { ReactNode } from 'react'

/**
 * Referencia viva del sistema de diseño.
 *
 * No es una pantalla de producto: es el lugar donde se mira como queda cada
 * token y cada componente antes de usarlos en una pantalla real. Sirve para
 * dos cosas: revisar el resultado, y que ningun componente quede sin ver
 * renderizado nunca (un `Boton` que nadie llego a pintar es un bug esperando).
 */

const VARIANTES: VarianteBoton[] = ['primario', 'secundario', 'fantasma', 'peligro']
const TONOS: TonoInsignia[] = ['neutro', 'marca', 'ok', 'aviso', 'peligro']

export function Estilos() {
  return (
    <div className="flex flex-col gap-5">
      <Seccion titulo="Color" descripcion="Todo el color sale de --color-* en styles.css">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Muestra color="bg-canvas" nombre="canvas" />
          <Muestra color="bg-surface" nombre="surface" borde />
          <Muestra color="bg-raised" nombre="raised" borde />
          <Muestra color="bg-line" nombre="line" borde />
          <Muestra color="bg-brand" nombre="brand" />
          <Muestra color="bg-brand-soft" nombre="brand-soft" borde />
          <Muestra color="bg-ok" nombre="ok" />
          <Muestra color="bg-warn" nombre="warn" />
          <Muestra color="bg-danger" nombre="danger" />
          <Muestra color="bg-ink" nombre="ink" />
        </div>
      </Seccion>

      <Seccion titulo="Tipografía y bordes" descripcion="Escala base, radios y sombras">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-ink-subtle">Escala de texto</p>
            <p className="text-2xl font-semibold tracking-tight">Título 24</p>
            <p className="text-lg font-semibold tracking-tight">Encabezado 18</p>
            <p className="text-sm text-ink">Cuerpo 14 · el tamaño por defecto</p>
            <p className="text-xs text-ink-muted">Apoyado 12 · meta y etiquetas</p>
            <p className="font-mono text-sm">Mono 14 · 0070942507240</p>
            <p className="text-sm tabular-nums text-ink-muted">Tabular 1234567890</p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-subtle">Radios y sombras</p>
            <div className="flex gap-3">
              <div className="rounded-card border border-line bg-surface px-4 py-3 text-xs shadow-card">
                rounded-card
              </div>
              <div className="rounded-control border border-line bg-surface px-4 py-3 text-xs">
                rounded-control
              </div>
              <div className="rounded-full border border-line bg-surface px-4 py-3 text-xs">
                pill
              </div>
            </div>
            <div className="rounded-card border border-line bg-surface px-4 py-4 text-xs shadow-raised">
              shadow-raised · para lo que flota (diálogos, menús)
            </div>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Botones" descripcion="Cuatro variantes, dos tamaños">
        <Tarjeta>
          <div className="flex flex-wrap items-center gap-3">
            {VARIANTES.map(variante => (
              <Boton key={variante} variante={variante}>
                {variante}
              </Boton>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Boton variante="primario" tamano="sm">
              Chico primario
            </Boton>
            <Boton tamano="sm">Chico secundario</Boton>
            <Boton variante="primario" disabled>
              Deshabilitado
            </Boton>
            <Boton variante="primario">
              <Icono nombre="mas" className="size-4" />
              Con icono
            </Boton>
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Campos" descripcion="Etiqueta, ayuda, error e icono siempre conectados">
        <Tarjeta>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre comercial" placeholder="IBUPROFENO 400 mg comp.x 20" />
            <Campo
              etiqueta="Con icono"
              icono="lupa"
              placeholder="Buscar por nombre o principio activo"
            />
            <Campo
              etiqueta="Código de barras"
              icono="codigo-barras"
              ayuda="EAN-8, EAN-13 o UPC-A. Se guarda como texto para no perder los ceros iniciales."
              defaultValue="0070942507240"
            />
            <Campo etiqueta="Con error" error="Este código de barras ya está cargado" />
            <Campo
              etiqueta="Con acción"
              placeholder="Slot a la derecha del texto"
              defaultValue="ibuprofeno"
              accion={
                <Boton variante="fantasma" tamano="sm" aria-label="Quitar" className="size-7 px-0">
                  <Icono nombre="atras" className="size-3.5" />
                </Boton>
              }
            />
            <Campo
              etiquetaOculta
              etiqueta="Solo para lectores de pantalla"
              placeholder=" invisible"
            />
            <Campo etiqueta="Deshabilitado" disabled defaultValue="No editable" />
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Insignias y estados vacíos" descripcion="Tonos y placeholder de lista vacía">
        <Tarjeta>
          <div className="flex flex-wrap items-center gap-2">
            {TONOS.map(tono => (
              <Insignia key={tono} tono={tono}>
                {tono}
              </Insignia>
            ))}
            <Insignia tono="ok">
              <span className="size-1.5 rounded-full bg-ok" />
              Con punto
            </Insignia>
          </div>
        </Tarjeta>

        <Vacio
          icono="caja"
          titulo="Todavía no hay productos"
          descripcion="Cuando exista el catálogo, esta es la pantalla que se ve la primera vez."
          accion={<Boton variante="primario">Importar catálogo</Boton>}
        />
      </Seccion>

      <Seccion titulo="Iconos" descripcion="Set propio, dibujado en SVG, sin dependencias">
        <Tarjeta>
          <div className="flex flex-wrap gap-4">
            {NOMBRES_ICONO.map(nombre => (
              <div key={nombre} className="flex w-20 flex-col items-center gap-1.5">
                <Icono nombre={nombre} className="size-6 text-ink" />
                <span className="text-center text-[0.625rem] break-all text-ink-subtle">
                  {nombre}
                </span>
              </div>
            ))}
          </div>
        </Tarjeta>
      </Seccion>
    </div>
  )
}

function Seccion({
  titulo,
  descripcion,
  children
}: {
  titulo: string
  descripcion: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
        <p className="text-xs text-ink-muted">{descripcion}</p>
      </div>
      {children}
    </section>
  )
}

function Muestra({ color, nombre, borde }: { color: string; nombre: string; borde?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cx('size-9 shrink-0 rounded-control', color, borde && 'border border-line')}
      />
      <span className="font-mono text-xs text-ink-muted">{nombre}</span>
    </div>
  )
}
