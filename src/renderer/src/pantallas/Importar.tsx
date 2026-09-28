import { Icono } from '@renderer/componentes/Icono'
import { Boton } from '@renderer/componentes/ui/Boton'
import { Insignia } from '@renderer/componentes/ui/Insignia'
import { Tarjeta } from '@renderer/componentes/ui/Tarjeta'
import { Vacio } from '@renderer/componentes/ui/Vacio'
import type {
  ArchivoElegido,
  InformeImportacion,
  ModoImportacion,
  ResultadoImportacion
} from '@shared/ipc'
import { useState } from 'react'

interface Props {
  onVolver(): void
  onImportado(resultado: ResultadoImportacion): void
}

type Fase = 'elegir' | 'informe' | 'hecho'

/** Cómo se explica cada tipo de advertencia, en la pantalla. */
const TEXTO_ADVERTENCIA: Record<string, string> = {
  'codigo-duplicado-en-archivo':
    'El mismo código de barras aparece más de una vez en el archivo. Se importa solo el primero.',
  'codigo-ilegible':
    'El código tiene una longitud que no corresponde a un formato de código de barras. Se importa igual.',
  'checksum-invalido':
    'El dígito verificador del código no cierra. Puede ser un código interno: se importa igual.',
  'sin-numero-de-troquel': 'El producto no trae número de troquel. Se importa sin él.'
}

/**
 * Importación del catálogo heredado.
 *
 * El orden es elegir archivo → informe en seco → aplicar, y el informe es
 * obligatorio: no hay forma de importar sin ver antes cuántos productos entran,
 * cuántos ya están y cuántos se rechazan.
 *
 * El contenido del archivo se guarda en el estado del renderer y se vuelve a
 * mandar al main en cada paso. Son 165 kB, no vale la pena agregar un estado
 * compartido en el main para no reenviarlos.
 */
export function Importar({ onVolver, onImportado }: Props) {
  const [archivo, setArchivo] = useState<ArchivoElegido | null>(null)
  const [modo, setModo] = useState<ModoImportacion>('solo-nuevos')
  const [informe, setInforme] = useState<InformeImportacion | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [fase, setFase] = useState<Fase>('elegir')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function elegir() {
    setOcupado(true)
    setError(null)
    try {
      const elegido = await window.troqio.importar.elegirArchivo()
      // Cancelar el diálogo no es un error: es no hacer nada.
      if (!elegido) return

      setArchivo(elegido)
      setInforme(null)
      setFase('informe')
      await analizar(elegido, modo)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function analizar(elegido: ArchivoElegido, modoElegido: ModoImportacion) {
    setOcupado(true)
    setError(null)
    try {
      setInforme(
        await window.troqio.importar.analizar({
          contenido: elegido.contenido,
          nombreArchivo: elegido.nombre,
          rutaArchivo: elegido.ruta,
          modo: modoElegido
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFase('elegir')
    } finally {
      setOcupado(false)
    }
  }

  async function cambiarModo(nuevo: ModoImportacion) {
    if (!archivo) return
    setModo(nuevo)
    await analizar(archivo, nuevo)
  }

  async function aplicar() {
    if (!archivo || ocupado) return
    setOcupado(true)
    setError(null)
    try {
      const salida = await window.troqio.importar.aplicar({
        contenido: archivo.contenido,
        nombreArchivo: archivo.nombre,
        rutaArchivo: archivo.ruta,
        modo
      })
      setResultado(salida)
      setFase('hecho')
      onImportado(salida)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  if (fase === 'hecho' && resultado) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Boton variante="fantasma" tamano="sm" onClick={onVolver}>
            <Icono nombre="atras" className="size-4" />
            Catálogo
          </Boton>
          <h2 className="text-sm font-semibold text-ink">Importación terminada</h2>
        </div>

        <Tarjeta titulo={archivo?.nombre ?? 'el archivo'}>
          <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
            <Contador etiqueta="Productos creados" valor={resultado.insertados} tono="ok" />
            <Contador etiqueta="Datos actualizados" valor={resultado.actualizados} />
            <Contador etiqueta="Ya estaban, sin tocar" valor={resultado.conservados} />
            <Contador etiqueta="No se importaron" valor={resultado.rechazados} />
          </div>
        </Tarjeta>

        <AvisoStockCero />

        <div className="flex gap-2">
          <Boton variante="primario" onClick={onVolver}>
            Ver el catálogo
          </Boton>
          <Boton variante="secundario" onClick={elegir} disabled={ocupado}>
            Importar otro archivo
          </Boton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Boton variante="fantasma" tamano="sm" onClick={onVolver} disabled={ocupado}>
          <Icono nombre="atras" className="size-4" />
          Catálogo
        </Boton>
        <h2 className="text-sm font-semibold text-ink">Importar catálogo</h2>
      </div>

      {error && <AvisoError texto={error} />}

      <Tarjeta
        titulo="Archivo de origen"
        descripcion="El mismo JSON que exportaste del sistema anterior."
        acciones={
          <Boton variante={informe ? 'secundario' : 'primario'} onClick={elegir} disabled={ocupado}>
            <Icono nombre="subir" className="size-4" />
            {informe ? 'Cambiar archivo' : 'Elegir archivo'}
          </Boton>
        }
      >
        {archivo ? (
          <div className="flex flex-col gap-1 px-5 py-4">
            <p className="text-sm font-medium text-ink">{archivo.nombre}</p>
            <p className="text-xs break-all text-ink-subtle">{archivo.ruta}</p>
            <p className="text-xs text-ink-muted">
              {(archivo.contenido.length / 1024).toFixed(0)} kB
            </p>
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-ink-muted">Todavía no elegiste ningún archivo.</p>
        )}
      </Tarjeta>

      {informe && (
        <>
          <Tarjeta titulo="Qué va a pasar" descripcion="Nada se escribe hasta que confirmes.">
            <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-3">
              <Contador etiqueta="Productos nuevos" valor={informe.nuevos} tono="ok" />
              <Contador
                etiqueta="Ya están, se conservan"
                valor={informe.aConservar}
                nota={modo === 'solo-nuevos' ? 'No se pisa nada' : undefined}
              />
              <Contador
                etiqueta="Se van a actualizar"
                valor={informe.aActualizar}
                tono={informe.aActualizar > 0 ? 'aviso' : undefined}
              />
            </div>

            <div className="border-t border-line px-5 py-4">
              <p className="mb-2.5 text-xs font-medium text-ink-muted">
                Qué hacer con los que ya están
              </p>
              <div className="flex flex-col gap-2">
                <OpcionModo
                  activo={modo === 'solo-nuevos'}
                  onClick={() => cambiarModo('solo-nuevos')}
                  titulo="Conservar lo que ya está"
                  descripcion="Solo agrega los que faltan. Es el que conviene por defecto: una edición hecha a mano en Troqio no se pierde por reimportar."
                />
                <OpcionModo
                  activo={modo === 'actualizar'}
                  onClick={() => cambiarModo('actualizar')}
                  titulo="Actualizar con los datos del archivo"
                  descripcion="Pisa nombre, principio activo, troquel y código. El stock no se toca nunca: es de la farmacia, no del archivo."
                />
              </div>
            </div>
          </Tarjeta>

          <AvisoStockCero />

          {informe.advertencias.length > 0 && (
            <Tarjeta titulo="Advertencias" descripcion="No impiden importar.">
              <ul className="flex flex-col divide-y divide-line">
                {informe.advertencias.map(a => (
                  <li key={a.tipo} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Insignia tono="aviso">
                        {a.veces === 1 ? '1 caso' : `${a.veces} casos`}
                      </Insignia>
                      <span className="text-sm text-ink">
                        {TEXTO_ADVERTENCIA[a.tipo] ?? a.tipo}
                      </span>
                    </div>
                    {a.ejemplos.length > 0 && (
                      <p className="mt-1 pl-1 text-xs text-ink-subtle">
                        {a.ejemplos.join(' · ')}
                        {a.veces > a.ejemplos.length ? ' · …' : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          {informe.rechazados.length > 0 && (
            <Tarjeta
              titulo={`${informe.rechazados.length} ${informe.rechazados.length === 1 ? 'registro no se importa' : 'registros no se importan'}`}
              descripcion="Estos hay que revisarlos a mano en el archivo de origen."
            >
              <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto">
                {informe.rechazados.map(r => (
                  <li key={r.registro} className="flex items-baseline gap-3 px-5 py-2.5">
                    <span className="w-20 shrink-0 font-mono text-xs text-ink-subtle">
                      N.º {r.registro}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {r.nombre ?? <span className="text-ink-subtle">sin nombre</span>}
                    </span>
                    <span className="shrink-0 text-xs text-danger">{r.motivo}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <div className="flex items-center gap-2">
            <Boton variante="primario" onClick={aplicar} disabled={ocupado}>
              <Icono nombre="check" className="size-4" />
              {ocupado
                ? 'Importando...'
                : `Importar ${informe.nuevos + informe.aActualizar} productos`}
            </Boton>
            <Boton variante="secundario" onClick={onVolver} disabled={ocupado}>
              Cancelar
            </Boton>
          </div>
        </>
      )}

      {!informe && !archivo && (
        <Vacio
          icono="datos"
          titulo="Elegí el archivo del catálogo"
          descripcion="Se lee en seco y te muestra el informe antes de escribir nada en la base. Podés repetir la importación sin duplicar nada."
        />
      )}
    </div>
  )
}

/**
 * El aviso de que no entra stock.
 *
 * No es un detalle menor: el archivo de origen trae `units: 0` en los 681
 * registros, que es un artefacto de la exportación y no un conteo. Si no se
 * dice, el usuario importa, ve el catálogo entero en cero y piensa que se
 * rompió algo.
 */
function AvisoStockCero() {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-warn/30 bg-warn/8 px-4 py-3">
      <Icono nombre="info" className="mt-0.5 size-4.5 shrink-0 text-warn" />
      <p className="text-sm text-ink-muted">
        Todos los productos entran con <strong className="font-medium text-ink">stock 0</strong>. El
        archivo de origen no trae cantidades reales, así que la importación no inventa un conteo. La
        cantidad se carga después, en el conteo del salón.
      </p>
    </div>
  )
}

function Contador({
  etiqueta,
  valor,
  nota,
  tono
}: {
  etiqueta: string
  valor: number
  nota?: string
  tono?: 'ok' | 'aviso'
}) {
  return (
    <div className="rounded-control border border-line bg-raised px-3.5 py-3">
      <p
        className={`text-2xl font-semibold tabular-nums ${
          tono === 'ok' ? 'text-ok' : tono === 'aviso' ? 'text-warn' : 'text-ink'
        }`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{etiqueta}</p>
      {nota && <p className="mt-0.5 text-xs text-ink-subtle">{nota}</p>}
    </div>
  )
}

function OpcionModo({
  activo,
  onClick,
  titulo,
  descripcion
}: {
  activo: boolean
  onClick(): void
  titulo: string
  descripcion: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 text-left transition-colors ${
        activo ? 'border-brand/40 bg-brand-soft' : 'border-line bg-surface hover:bg-raised'
      }`}
    >
      <span
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
          activo ? 'border-brand' : 'border-line-strong'
        }`}
      >
        {activo && <span className="size-2 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{titulo}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{descripcion}</span>
      </span>
    </button>
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
