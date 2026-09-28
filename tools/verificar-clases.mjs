/**
 * Verifica que cada clase de utilidad usada en el renderer exista en el CSS
 * compilado.
 *
 * En Tailwind v4 una clase inexistente no da error: simplemente no genera
 * nada. `w-18` o `bg-ok/8` se aplican en silencio y el problema aparece mucho
 * despues, en un maquete mal alineado. Este script lo detecta al instante.
 *
 * Uso: node tools/verificar-clases.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
const dirAssets = path.join(raiz, 'out', 'renderer', 'assets')
const archivoCss = fs.readdirSync(dirAssets).find(f => f.endsWith('.css'))

if (!archivoCss) {
  console.error('No hay CSS compilado. Corré `pnpm build` primero.')
  process.exit(1)
}

const css = fs.readFileSync(path.join(dirAssets, archivoCss), 'utf8')

function tsx(dir, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entrada.name)
    if (entrada.isDirectory()) tsx(p, acc)
    else if (p.endsWith('.tsx')) acc.push(p)
  }
  return acc
}

const clases = new Set()

/*
 * No se puede distinguir una clase de una palabra en Castellano por su forma:
 * `copiar` y `bg-raised` son indistinguibles a ojo. Asi que en vez de adivinar
 * se exige que el token empiece con un prefijo de utilidad conocido; las
 * frases del codigo quedan afuera solas.
 */
const PREFIJOS = [
  'absolute',
  'animate',
  'aspect',
  'backdrop',
  'bg',
  'border',
  'bottom',
  'col',
  'cursor',
  'divide',
  'flex',
  'font',
  'from',
  'gap',
  'grid',
  'h',
  'hidden',
  'hover',
  'inset',
  'inline',
  'items',
  'justify',
  'leading',
  'left',
  'max',
  'min',
  'mx',
  'my',
  'm',
  'object',
  'opacity',
  'outline',
  'overflow',
  'p',
  'peer',
  'placeholder',
  'pointer',
  'px',
  'py',
  'pb',
  'pl',
  'pr',
  'pt',
  'relative',
  'right',
  'ring',
  'rounded',
  'row',
  'scale',
  'select',
  'self',
  'shadow',
  'size',
  'space',
  'sr',
  'text',
  'top',
  'truncate',
  'underline',
  'uppercase',
  'w',
  'whitespace',
  'z'
]

function pareceUtilidad(token) {
  // Saca el prefijo de variante (`hover:`, `lg:`, `focus-visible:`, ...).
  const base = token.includes(':') ? token.slice(token.lastIndexOf(':') + 1) : token
  return PREFIJOS.some(p => base === p || base.startsWith(`${p}-`))
}

// Los nombres de icono son cadenas que tambien viven en el codigo, pero no son
// clases. Se leen de la fuente para no duplicar la lista a mano.
const nombresIcono = new Set(
  (
    fs
      .readFileSync(path.join(raiz, 'src', 'renderer', 'src', 'iconos.ts'), 'utf8')
      .match(/NOMBRES_ICONO = \[([\s\S]*?)\]/)?.[1] ?? ''
  )
    .split(',')
    .map(s => s.replace(/['"\s]/g, ''))
    .filter(Boolean)
)

for (const archivo of tsx(path.join(raiz, 'src', 'renderer', 'src'))) {
  const src = fs.readFileSync(archivo, 'utf8')
  for (const m of src.matchAll(/['"`]([^"'`\n]*)['"`]/g)) {
    for (const t of m[1].split(/\s+/)) {
      if (nombresIcono.has(t)) continue
      if (pareceUtilidad(t)) clases.add(t)
    }
  }
}

// Tailwind escapa los caracteres especiales del selector de clase.
const selector = c => '.' + c.replace(/([.:/[\]%])/g, '\\$1')

const faltan = [...clases].filter(c => !css.includes(selector(c))).sort()

console.log(`clases en el renderer: ${clases.size}`)
if (faltan.length === 0) {
  console.log('todas existen en el CSS compilado')
} else {
  console.log(`\nSIN CSS GENERADO (${faltan.length}):`)
  for (const c of faltan) console.log(`  ${c}`)
  process.exit(1)
}
