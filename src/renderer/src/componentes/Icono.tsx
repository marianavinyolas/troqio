import { cx } from '@renderer/cx'
import { claveTrazo, type NombreIcono, TRAZOS } from '@renderer/iconos'

interface Props {
  nombre: NombreIcono
  className?: string
}

/**
 * Icono del set propio. Hereda `currentColor`, asi que se tiñe con el color
 * de texto del padre y no necesita props de color.
 */
export function Icono({ nombre, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cx('size-5', className)}
    >
      {TRAZOS[nombre].map((trazo, indice) => {
        const key = claveTrazo(trazo, indice)
        if ('d' in trazo) return <path key={key} d={trazo.d} />
        if ('circulo' in trazo)
          return (
            <circle key={key} cx={trazo.circulo[0]} cy={trazo.circulo[1]} r={trazo.circulo[2]} />
          )
        if ('linea' in trazo)
          return (
            <line
              key={key}
              x1={trazo.linea[0]}
              y1={trazo.linea[1]}
              x2={trazo.linea[2]}
              y2={trazo.linea[3]}
            />
          )
        return (
          <rect
            key={key}
            x={trazo.rect[0]}
            y={trazo.rect[1]}
            width={trazo.rect[2]}
            height={trazo.rect[3]}
            rx={trazo.rect[4]}
          />
        )
      })}
    </svg>
  )
}
