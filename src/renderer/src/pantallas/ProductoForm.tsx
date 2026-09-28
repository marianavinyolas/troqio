import { Icono } from '@renderer/componentes/Icono'
import { Boton } from '@renderer/componentes/ui/Boton'
import { Campo } from '@renderer/componentes/ui/Campo'
import { Insignia } from '@renderer/componentes/ui/Insignia'
import { Tarjeta } from '@renderer/componentes/ui/Tarjeta'
import {
  ActualizarProductoSchema,
  DatosProductoSchema,
  type ProductoConStock,
  vacioANulo
} from '@shared/ipc'
import { useState } from 'react'

interface Props {
  producto: ProductoConStock | null
  onVolver(): void
  onGuardado(nombre: string): void
}

/** Errores por campo, para poder pegarle el mensaje al control que falló. */
type Errores = Partial<Record<'nombre' | 'codigoBarras' | 'formulario', string>>

/**
 * Alta y edición de un producto.
 *
 * El stock no se edita acá, y no es una omisión: el saldo se cambia con
 * movimientos, no escribiendo un campo. Si se pudiera editar, el libro de
 * movimientos dejaría de explicar el saldo, y con él la única forma de saber
 * qué pasó con una caja.
 */
export function ProductoForm({ producto, onVolver, onGuardado }: Props) {
  const editando = producto !== null

  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [principioActivo, setPrincipioActivo] = useState(producto?.principioActivo ?? '')
  const [numeroTroquel, setNumeroTroquel] = useState(producto?.numeroTroquel ?? '')
  const [codigoBarras, setCodigoBarras] = useState(producto?.codigoBarras ?? '')

  const [errores, setErrores] = useState<Errores>({})
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (guardando) return
    setGuardando(true)
    setErrores({})

    const datos = {
      nombre,
      // Los campos opcionales que quedaron vacíos van como null, no como "":
      // "" no es lo mismo que "no informado".
      principioActivo: vacioANulo(principioActivo),
      numeroTroquel: vacioANulo(numeroTroquel),
      codigoBarras
    }

    /*
     * Valida acá, antes de cruzar el IPC, y no solo en el main.
     *
     * El main valida igual: es la barrera real. Pero un `ZodError` no
     * sobrevive el cruce del IPC con sus `issues` intactos, así que si el
     * renderer espera al error para pintar los mensajes, lo que llega es un
     * volcado JSON ilegible en vez de "El nombre es obligatorio".
     *
     * Con el MISMO schema de `@shared/ipc` — una sola fuente de verdad, no
     * dos copias — el mensaje pegado al campo sale antes y sale bien.
     * `chequeo.data` viene recortado por el schema: es lo que se guarda.
     */
    try {
      if (editando && producto) {
        const chequeo = ActualizarProductoSchema.safeParse({ id: producto.id, ...datos })
        if (!chequeo.success) {
          setErrores(porCampo(chequeo.error.issues))
          setGuardando(false)
          return
        }
        await window.troqio.productos.actualizar(chequeo.data)
        onGuardado(chequeo.data.nombre)
      } else {
        const chequeo = DatosProductoSchema.safeParse(datos)
        if (!chequeo.success) {
          setErrores(porCampo(chequeo.error.issues))
          setGuardando(false)
          return
        }
        await window.troqio.productos.crear(chequeo.data)
        onGuardado(chequeo.data.nombre)
      }
    } catch (e) {
      // Lo que llega acá ya pasó la validación: es un fallo de la base, y va
      // en el aviso general. Se saca el prefijo que Electron le pega al
      // mensaje, que no le dice nada a quien está usando la app.
      setErrores({
        formulario:
          e instanceof Error
            ? e.message.replace(/^Error invoking remote method .*: /, '')
            : String(e)
      })
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Boton variante="fantasma" tamano="sm" onClick={onVolver}>
          <Icono nombre="atras" className="size-4" />
          Catálogo
        </Boton>
        <h2 className="text-sm font-semibold text-ink">
          {editando ? 'Editar producto' : 'Nuevo producto'}
        </h2>
        {editando && producto && !producto.activo && (
          <Insignia tono="neutro">Dado de baja</Insignia>
        )}
      </div>

      {errores.formulario && <AvisoError texto={errores.formulario} />}

      <Tarjeta
        descripcion={
          editando
            ? 'El stock no se edita desde acá: se cambia con movimientos, para que el historial siga explicando el saldo.'
            : 'El producto entra con stock 0. La cantidad se carga en el conteo.'
        }
      >
        <div className="flex flex-col gap-4 px-5 py-4">
          <Campo
            etiqueta="Nombre comercial"
            ayuda="Como está escrito en la caja."
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            error={errores.nombre}
            autoFocus
          />

          <Campo
            etiqueta="Principio activo"
            ayuda="Opcional. Se escribe como figura en el envase."
            value={principioActivo}
            onChange={e => setPrincipioActivo(e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Código de barras"
              icono="codigo-barras"
              ayuda="8 a 14 dígitos. Es lo que lee el escáner."
              value={codigoBarras}
              onChange={e => setCodigoBarras(e.target.value)}
              error={errores.codigoBarras}
            />

            <Campo
              etiqueta="Número de troquel"
              ayuda="Opcional. El número del troquel pegado al recetario."
              value={numeroTroquel}
              onChange={e => setNumeroTroquel(e.target.value)}
            />
          </div>
        </div>
      </Tarjeta>

      {editando && producto && <FichaProducto producto={producto} />}

      <div className="flex items-center gap-2">
        <Boton variante="primario" onClick={guardar} disabled={guardando}>
          <Icono nombre="check" className="size-4" />
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear producto'}
        </Boton>
        <Boton variante="secundario" onClick={onVolver} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </div>
  )
}

/** Datos de solo lectura, para que al editar se vea qué hay hoy. */
function FichaProducto({ producto }: { producto: ProductoConStock }) {
  return (
    <Tarjeta titulo="Estado actual">
      <div className="grid grid-cols-[9rem_1fr] gap-4 border-b border-line px-5 py-3 last:border-b-0">
        <span className="text-sm text-ink-muted">Stock</span>
        <span className="text-sm text-ink">
          {producto.cantidad === 0 ? (
            <span className="text-ink-muted">Sin stock</span>
          ) : (
            `${producto.cantidad} ${producto.cantidad === 1 ? 'unidad' : 'unidades'}`
          )}
        </span>
      </div>
      <div className="grid grid-cols-[9rem_1fr] gap-4 px-5 py-3">
        <span className="text-sm text-ink-muted">Última modificación</span>
        <span className="text-sm text-ink">{formatearFecha(producto.actualizadoEn)}</span>
      </div>
    </Tarjeta>
  )
}

function AvisoError({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger/5 px-4 py-3">
      <Icono nombre="alerta" className="mt-0.5 size-4.5 shrink-0 text-danger" />
      <p className="text-sm text-danger">{texto}</p>
    </div>
  )
}

/**
 * Pega cada mensaje a su campo.
 *
 * Un `path` vacío o desconocido no es un campo: es un problema del conjunto
 * (por ejemplo, que el objeto no es un objeto), y va al aviso general para no
 * pegarle un texto a un control que no tiene nada que ver.
 */
function porCampo(issues: { path: PropertyKey[]; message: string }[]): Errores {
  const errores: Errores = {}

  for (const issue of issues) {
    const campo = issue.path[0]
    if (campo === 'nombre' || campo === 'codigoBarras') {
      errores[campo] ??= issue.message
    } else {
      errores.formulario ??= issue.message
    }
  }

  return errores
}

/** dd/mm/aaaa, sin la zona horaria: es una fecha local, no un instante. */
function formatearFecha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
