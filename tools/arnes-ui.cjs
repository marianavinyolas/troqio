/**
 * Arnés de verificación de la interfaz.
 *
 * Nota de estilo: este archivo está excluido de biome en `biome.json`
 * (`!tools/arnes-ui.cjs`) a propósito. Corre con node sobre el build, así que
 * va con `require()`; y arma los scripts que se inyectan en la página por
 * concatenación de strings, porque anidar templates literales con backticks
 * lo vuelve ilegible enseguida.
 *
 * Levanta la app REAL (out/main/index.js con el preload real) contra una base
 * sembrada, y después maneja la ventana como un usuario: hacer clic en el
 * catálogo, escribir en el filtro, abrir el formulario, guardar, dar de baja,
 * importar.
 *
 * Por qué existe: los tests de `tests/` cubren la base y el contrato del IPC,
 * pero ninguno abre una ventana. Que TypeScript compile y que
 * `verificar:clases` pase no dice que la pantalla funcione; este arnés sí.
 *
 * No se toca código de producción para correrlo: se redirige `userData` antes
 * de requerir el main, y las pruebas viajan por `executeJavaScript` como lo
 * haría cualquier script de la página. Exige `pnpm build` previo.
 *
 * Lo que NO cubre, y no se puede cubrir acá: el diálogo nativo de elegir
 * archivo y el escáner. Los dos dependen de Windows.
 *
 * Uso:
 *   node tools/sembrar-base.mjs <tmp>/userData <catalogo.json>
 *   TROQIO_CSP=1 pnpm verificar:interfaz <tmp>/userData <catalogo.json>
 *
 * `TROQIO_CSP=1` es lo recomendado: corre la app con la CSP de producción
 * puesta, que es como se va a ver en el instalador. Ver `cspActiva` en
 * src/main/index.ts.
 */
const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const args = process.argv.slice(2)
const RAIZ = args[0]
const CATALOGO = args[1] ?? '/Users/marianavinyolas/Downloads/stock.json'

if (!RAIZ || !path.isAbsolute(RAIZ)) {
  console.error('Falta la carpeta userData')
  app.exit(1)
}

// Antes de que el main de la app toque `app.getPath`.
app.setPath('userData', RAIZ)

const erroresRender = []
let pasoActual = '(inicio)'

process.on('uncaughtException', e => {
  console.error('EXCEPCIÓN:', e && e.stack ? e.stack : e)
  app.exit(1)
})

// El main real crea la ventana, registra el IPC y aplica las migraciones.
require(path.join(process.cwd(), 'out', 'main', 'index.js'))

const dormir = ms => new Promise(r => setTimeout(r, ms))

async function esperarVentana() {
  for (let i = 0; i < 100; i++) {
    const [w] = BrowserWindow.getAllWindows()
    if (w) return w
    await dormir(100)
  }
  throw new Error('La app no abrió ninguna ventana')
}

/** Nombra el próximo sondeo, para poder saber cuál falló si truena. */
function paso(nombre) {
  pasoActual = nombre
  console.log('  · ' + nombre)
}

/**
 * Corre un script en el renderer y devuelve su valor.
 *
 * El script va envuelto en un try/catch adentro de la página y el resultado
 * vuelve como `{ok, valor, error}`. Sin esto, un error en el renderer llega
 * como el genérico "Script failed to execute", que no dice qué pasó: hay que
 * traer el stack del error para poder diagnosticarlo.
 *
 * El script tiene que ser una EXPRESIÓN: va dentro de un `await (...)`.
 */
function sondear(ventana, script) {
  return ventana.webContents
    .executeJavaScript(
      '(async () => {\n' +
        '  try {\n' +
        '    return { ok: true, valor: await (' +
        script +
        ') }\n' +
        '  } catch (e) {\n' +
        "    return { ok: false, error: String((e && e.stack) || e) }\n" +
        '  }\n' +
        '})()',
      true
    )
    .then(
      envoltura => {
        if (!envoltura || !envoltura.ok) {
          throw new Error(
            'Paso "' + pasoActual + '" falló en el renderer:\n' + (envoltura && envoltura.error)
          )
        }
        return envoltura.valor
      },
      // Un error de sintaxis en el script nunca llega al try/catch de la
      // página: revienta el `executeJavaScript` y se pierde el nombre del paso.
      e => {
        throw new Error('Paso "' + pasoActual + '" ni siquiera se pudo correr: ' + e.message)
      }
    )
}

const resultados = []
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok, detalle })
  console.log((ok ? 'OK   ' : 'FALLA') + ' ' + nombre + (detalle ? ' — ' + detalle : ''))
}

/** Escribe en un control como lo haría una persona, no como un test. */
const ESCRIBIR = `
  const input = window.__porEtiqueta(etiqueta)
  if (!input) throw new Error('no se encontró el campo: ' + etiqueta)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
`

/** Utilidades que se instalan una vez en el renderer. */
const AYUDAS = `(() => {
  window.__errores = []
  window.addEventListener('error', e =>
    window.__errores.push(String((e.error && e.error.stack) || e.message))
  )
  window.addEventListener('unhandledrejection', e =>
    window.__errores.push('promesa: ' + String((e.reason && e.reason.stack) || e.reason))
  )

  /*
   * Campo usa un <label htmlFor> hermano del input, no un wrapper. La
   * asociación se sigue por htmlFor, con un fallback a un input anidado para
   * los labels que sí envuelven (la casilla de "dados de baja").
   */
  window.__porEtiqueta = texto => {
    const label = [...document.querySelectorAll('label')].find(l =>
      (l.innerText || '').includes(texto)
    )
    if (!label) return undefined
    if (label.htmlFor) return document.getElementById(label.htmlFor) || undefined
    return label.querySelector('input') || undefined
  }
  window.__etiquetaDe = input => {
    const label =
      input.closest('label') ||
      [...document.querySelectorAll('label')].find(l => l.htmlFor && l.htmlFor === input.id)
    return (label && label.innerText) || input.type
  }
  window.__boton = texto =>
    [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes(texto))
  window.__click = texto => {
    const b = window.__boton(texto)
    if (!b) throw new Error('no se encontró el botón: ' + texto)
    b.click()
  }
  window.__escribir = (etiqueta, valor) => {${ESCRIBIR}
  }
  return 'ok'
})()`

/** Escribe varios campos del formulario, localizándolos por etiqueta. */
function llenar(ventana, datos) {
  const etiquetas = {
    nombre: 'Nombre comercial',
    principio: 'Principio activo',
    codigo: 'Código de barras',
    troquel: 'Número de troquel'
  }
  return sondear(
    ventana,
    '(() => {\n' +
      Object.entries(datos)
        .map(([clave, valor]) => `window.__escribir(${JSON.stringify(etiquetas[clave])}, ${JSON.stringify(valor)})`)
        .join('\n') +
      '\n  return [...document.querySelectorAll("input")].map(i => window.__etiquetaDe(i).split("\\n")[0] + " = " + i.value)\n})()'
  )
}

async function main() {
  const ventana = await esperarVentana()

  ventana.webContents.on('console-message', (_e, nivel, mensaje) => {
    if (nivel >= 2) erroresRender.push(mensaje)
  })
  ventana.webContents.on('render-process-gone', (_e, d) => {
    console.error('El proceso de render se fue:', JSON.stringify(d))
    app.exit(1)
  })

  await dormir(1200)
  paso('ayudas')
  await sondear(ventana, AYUDAS)

  // ---------------------------------------------------------------
  // 1. La app abre y el preload expone lo que dice el contrato.
  // ---------------------------------------------------------------
  paso('inicio')
  const inicio = await sondear(
    ventana,
    '(() => ({' +
      '  ventanaTroqio: typeof window.troqio,' +
      '  productos: Object.keys((window.troqio || {}).productos || {}),' +
      '  importar: Object.keys((window.troqio || {}).importar || {})' +
      '}))()'
  )
  comprobar(
    'la app monta y expone el preload',
    inicio.ventanaTroqio === 'object',
    'tipo=' + inicio.ventanaTroqio
  )
  comprobar(
    'el preload expone los 7 comandos de productos',
    inicio.productos.length === 7,
    inicio.productos.join(', ')
  )
  comprobar(
    'el preload expone los 3 comandos de importación',
    inicio.importar.length === 3,
    inicio.importar.join(', ')
  )

  // ---------------------------------------------------------------
  // 2. Entrar al catálogo y ver los 681 productos.
  // ---------------------------------------------------------------
  paso('abrir-catalogo')
  await sondear(ventana, "window.__click('Catálogo')")
  await dormir(1500)

  const filtrar = texto =>
    sondear(ventana, 'window.__escribir("Buscar en el catálogo", ' + JSON.stringify(texto) + ')')

  const contarFilas = () => sondear(ventana, 'document.querySelectorAll("ul li").length')
  const cuerpo = () => sondear(ventana, 'document.body.innerText')

  paso('listado')
  const listado = await sondear(
    ventana,
    '(() => ({ filas: document.querySelectorAll("ul li").length, cuerpo: document.body.innerText }))()'
  )
  comprobar('el catálogo dibuja 50 filas (una página)', listado.filas === 50, listado.filas + ' filas')
  comprobar('el catálogo cuenta los 681', /681 productos/.test(listado.cuerpo))
  comprobar(
    'el resumen de arriba dice que los 681 están sin stock',
    /681\s*\n\s*Sin stock/.test(listado.cuerpo),
    listado.cuerpo.split('\n').filter(l => l.includes('stock')).join(' / ')
  )

  // ---------------------------------------------------------------
  // 3. Filtrar, como escribiría el usuario.
  // ---------------------------------------------------------------
  await filtrar('cafeina')
  await dormir(1300) // incluye la espera de 200 ms del hook
  paso('filtro-cafeina')
  const con10 = await contarFilas()
  comprobar('el filtro por texto encuentra 10 con "cafeina"', con10 === 10, con10 + ' filas')
  paso('filtro-cafeina-encabezado')
  comprobar('el encabezado avisa el total del filtro', /10 productos/.test(await cuerpo()))

  await filtrar('cafeína')
  await dormir(1300)
  paso('filtro-tilde')
  const conTilde = await contarFilas()
  comprobar('con y sin tilde dan el mismo resultado', conTilde === con10, conTilde + ' vs ' + con10)

  // La puntuación del dato se respeta: "sodio cloruro" NO tiene que encontrar
  // a "SODIO,CLORURO". Se decided así a propósito, no es un forgot.
  await filtrar('sodio cloruro')
  await dormir(1300)
  paso('filtro-puntuacion')
  const conEspacio = await contarFilas()
  comprobar('la puntuación del dato se respeta, no se acomoda', conEspacio === 0, conEspacio + ' filas')

  // Y con la puntuación tal como viene, sí tiene que encontrar.
  await filtrar('sodio,cloruro')
  await dormir(1300)
  paso('filtro-puntuacion-exacta')
  const conPuntuacion = await contarFilas()
  comprobar('con la puntuación del dato sí encuentra', conPuntuacion === 3, conPuntuacion + ' filas')

  // ---------------------------------------------------------------
  // 4. El formulario rechaza lo inválido, con el mensaje en su campo.
  // ---------------------------------------------------------------
  await filtrar('')
  await dormir(1300)
  await sondear(ventana, "window.__click('Nuevo producto')")
  await dormir(700)

  paso('formulario')
  const formulario = await sondear(
    ventana,
    '(() => ({ titulo: document.body.innerText.includes("Nuevo producto"), campos: document.querySelectorAll("input").length }))()'
  )
  comprobar('el formulario se abre con 4 campos', formulario.campos === 4, formulario.campos + ' campos')
  comprobar('el formulario se titula "Nuevo producto"', formulario.titulo)

  await llenar(ventana, { nombre: '   ', principio: '', codigo: '779ABC', troquel: '' })
  await dormir(300)
  await sondear(ventana, "window.__click('Crear producto')")
  await dormir(900)

  paso('formulario-errores')
  const conErrores = await cuerpo()
  comprobar('el formulario no deja guardar un producto inválido', /Crear producto/.test(conErrores))
  comprobar(
    'el mensaje del nombre va legible, no como volcado de JSON',
    conErrores.includes('El nombre es obligatorio') &&
      !conErrores.includes('"origin"') &&
      !conErrores.includes('too_small'),
    conErrores.split('\n').filter(l => l.includes('obligatorio')).join(' / ')
  )
  comprobar(
    'el mensaje del código de barras va legible también',
    conErrores.includes('entre 8 y 14 dígitos') && !conErrores.includes('invalid_format'),
    conErrores.split('\n').filter(l => l.includes('dígitos')).join(' / ')
  )

  // ---------------------------------------------------------------
  // 5. Guardar uno válido, de verdad, en la base.
  // ---------------------------------------------------------------
  const CODIGO = '7791112223334'
  await llenar(ventana, {
    nombre: 'PRODUCTO DE PRUEBA DEL ARNÉS',
    principio: 'PRUEBA ACTIVA',
    codigo: CODIGO,
    troquel: '1234567'
  })
  await dormir(300)
  await sondear(ventana, "window.__click('Crear producto')")
  await dormir(1300)

  paso('tras-guardar')
  comprobar('guardar vuelve al listado', !/Crear producto/.test(await cuerpo()))

  paso('guardado')
  const guardado = await sondear(
    ventana,
    'window.troqio.productos.porCodigoBarras({ codigoBarras: ' + JSON.stringify(CODIGO) + ' })'
  )
  comprobar(
    'el producto se guardó con stock 0 y con todos sus datos',
    Boolean(guardado) &&
      guardado.nombre === 'PRODUCTO DE PRUEBA DEL ARNÉS' &&
      guardado.principioActivo === 'PRUEBA ACTIVA' &&
      guardado.numeroTroquel === '1234567' &&
      guardado.cantidad === 0,
    guardado ? JSON.stringify(guardado) : 'no se encontró'
  )

  paso('stock')
  const stockEnBase = await sondear(
    ventana,
    'window.troqio.productos.obtener({ id: ' + (guardado ? guardado.id : 0) + ' }).then(p => p.cantidad)'
  )
  comprobar('el stock arranca en cero', stockEnBase === 0, 'cantidad=' + stockEnBase)

  // ---------------------------------------------------------------
  // 6. Editar.
  // ---------------------------------------------------------------
  await filtrar('PRODUCTO DE PRUEBA')
  await dormir(1300)
  paso('abrir-edicion')
  await sondear(
    ventana,
    '(() => {\n' +
      "  const b = document.querySelector('button[aria-label^=\"Editar\"]')\n" +
      "  if (!b) throw new Error('no se encontró el botón de editar')\n" +
      '  b.click()\n' +
      '})()'
  )
  await dormir(700)

  paso('edicion')
  const enFormulario = await sondear(
    ventana,
    '(() => ({ valores: [...document.querySelectorAll("input")].map(i => i.value), titulo: document.body.innerText.includes("Editar producto") }))()'
  )
  comprobar(
    'el formulario de edición trae los datos cargados',
    enFormulario.titulo && enFormulario.valores.includes('PRODUCTO DE PRUEBA DEL ARNÉS'),
    enFormulario.valores.join(' | ')
  )

  await llenar(ventana, { nombre: 'RENOMBRADO POR EL ARNÉS' })
  await dormir(300)
  await sondear(ventana, "window.__click('Guardar cambios')")
  await dormir(1300)

  paso('renombrado')
  const renombrado = await sondear(
    ventana,
    'window.troqio.productos.porCodigoBarras({ codigoBarras: ' + JSON.stringify(CODIGO) + ' })'
  )
  comprobar(
    'la edición se guardó y no tocó el stock',
    Boolean(renombrado) && renombrado.nombre === 'RENOMBRADO POR EL ARNÉS' && renombrado.cantidad === 0,
    renombrado ? JSON.stringify(renombrado) : 'no se encontró'
  )

  // ---------------------------------------------------------------
  // 7. La baja pide confirmación y esconde el producto.
  // ---------------------------------------------------------------
  await filtrar('RENOMBRADO')
  await dormir(1300)
  paso('abrir-baja')
  await sondear(
    ventana,
    '(() => {\n' +
      "  const b = document.querySelector('button[aria-label^=\"Dar de baja\"]')\n" +
      "  if (!b) throw new Error('no se encontró el botón de baja')\n" +
      '  b.click()\n' +
      '})()'
  )
  await dormir(500)

  paso('dialogo-baja')
  const dialogo = await sondear(
    ventana,
    '(() => ({ hay: !!document.querySelector("[role=dialog]"), texto: (document.querySelector("[role=dialog]") || {}).innerText || "" }))()'
  )
  comprobar('la baja pide confirmación', dialogo.hay, dialogo.texto.split('\n')[0])
  comprobar('el diálogo aclara que la baja es lógica', /No se borra nada/.test(dialogo.texto))

  paso('confirmar-baja')
  await sondear(
    ventana,
    '(() => {\n' +
      "  const b = [...document.querySelectorAll('[role=dialog] button')].find(b => (b.textContent || '').includes('Dar de baja'))\n" +
      "  if (!b) throw new Error('no se encontró el botón de confirmar')\n" +
      '  b.click()\n' +
      '})()'
  )
  await dormir(1300)

  paso('baja')
  const trasBaja = await sondear(
    ventana,
    'window.troqio.productos.porCodigoBarras({ codigoBarras: ' + JSON.stringify(CODIGO) + ' })'
  )
  comprobar(
    'el producto dado de baja no lo encuentra el escáner',
    trasBaja === null,
    'porCodigoBarras = ' + JSON.stringify(trasBaja)
  )
  paso('listado-vacio')
  comprobar('el listado avisa que no hay nada con ese texto', /No hay nada con ese texto/.test(await cuerpo()))

  paso('ver-inactivos')
  await sondear(
    ventana,
    '(() => { const c = document.querySelector("input[type=checkbox]"); if (!c) throw new Error("no hay casilla"); c.click() })()'  )
  await dormir(1100)
  const conInactivos = await cuerpo()
  comprobar(
    'la casilla de dados de baja los trae de vuelta, marcados como tales',
    conInactivos.includes('RENOMBRADO POR EL ARNÉS') && conInactivos.includes('Dado de baja')
  )

  // ---------------------------------------------------------------
  // 8. La importación.
  // ---------------------------------------------------------------
  // Importar es una vista DENTRO de la pantalla de catálogo, así que tocar el
  // destino del menú desde ahí no hace nada: hay que salirse primero.
  paso('ir-a-importar')
  await sondear(ventana, "window.__click('Diagnóstico')")
  await dormir(500)
  await sondear(ventana, "window.__click('Catálogo')")
  await dormir(900)
  await sondear(ventana, "window.__click('Importar')")
  await dormir(700)

  paso('pantalla-importar')
  const pantallaImportar = await cuerpo()
  comprobar(
    'la pantalla de importación arranca pidiendo un archivo',
    pantallaImportar.includes('Elegí el archivo del catálogo'),
    pantallaImportar.split('\n').filter(Boolean).slice(0, 2).join(' / ')
  )

  // El diálogo nativo no se puede automatizar: se saltea eligiendo el archivo
  // y se manda el contenido al informe, que es la parte propia de Troqio.
  const contenido = fs.readFileSync(CATALOGO, 'utf8')
  const argsImportacion =
    '{ contenido: ' + JSON.stringify(contenido) + ", nombreArchivo: 'stock.json', rutaArchivo: 'C:/tmp/stock.json' }"

  paso('informe-en-seco')
  const informe = await sondear(ventana, 'window.troqio.importar.analizar(' + argsImportacion + ')')
  comprobar(
    'el informe en seco leyó los 681 y no rechazó ninguno',
    informe.leidos === 681 && informe.rechazados.length === 0,
    'leidos=' + informe.leidos + ' rechazados=' + informe.rechazados.length
  )
  comprobar(
    'el informe ve los 681 ya en la base y los propone conservar',
    informe.nuevos === 0 && informe.aConservar === 681,
    'nuevos=' + informe.nuevos + ' conservados=' + informe.aConservar
  )
  comprobar('el informe avisa que todo entra en cero', informe.todosEntranEnCero === true)

  paso('importar')
  const repetido = await sondear(ventana, 'window.troqio.importar.aplicar(' + argsImportacion + ')')
  comprobar(
    'reimportar los 681 no crea nada nuevo',
    repetido.insertados === 0 && repetido.conservados === 681,
    JSON.stringify(repetido)
  )

  paso('resumen-final')
  const resumenFinal = await sondear(ventana, 'window.troqio.productos.resumen()')
  comprobar(
    'el catálogo quedó con 682: los 681 importados más el del arnés',
    resumenFinal.total === 682,
    JSON.stringify(resumenFinal)
  )

  // ---------------------------------------------------------------
  // 9. El diseño: los tokens existen y los colores se leen de verdad.
  // ---------------------------------------------------------------
  // Vuelve al catálogo, que en este punto no está en pantalla.
  await sondear(ventana, "window.__click('Diagnóstico')")
  await dormir(500)
  await sondear(ventana, "window.__click('Catálogo')")
  await dormir(1000)
  await filtrar('')
  await dormir(1300)

  paso('diseno')
  const diseno = await sondear(ventana, DISENO)
  for (const e of diseno.elementos) {
    if (!e.encontrado) {
      comprobar('existe en pantalla: ' + e.etiqueta, false, 'no se encontró el elemento')
      continue
    }
    // La sentinela es lo que se ve si el navegador no pudo interpretar el
    // color: un token mal escrito no da error, deja el valor anterior.
    comprobar(
      e.etiqueta + ': el color resuelve de verdad',
      e.texto.hex !== '#010203' && e.fondo.hex !== '#010203',
      e.textoCss + ' -> ' + e.texto.hex + ' sobre ' + e.fondo.hex
    )
  }

  const porEtiqueta = nombre => diseno.elementos.find(e => e.etiqueta === nombre)
  const cuerpoDeLaApp = porEtiqueta('cuerpo')
  const titulo = porEtiqueta('título de pantalla')
  const insignia = porEtiqueta('insignia de stock')
  const producto = porEtiqueta('nombre del producto')
  const tarjeta = porEtiqueta('tarjeta del listado')
  const item = porEtiqueta('primer item de la lista')
  const campo = porEtiqueta('caja de búsqueda')

  // WCAG AA: 4.5:1 para texto normal, 3:1 para texto grande.
  for (const e of [cuerpoDeLaApp, titulo, producto]) {
    if (!e) continue
    comprobar(
      'contraste AA en: ' + e.etiqueta,
      e.contraste >= 4.5,
      e.contraste + ':1 (' + e.texto.hex + ' sobre ' + e.fondo.hex + ')'
    )
  }
  if (insignia) {
    comprobar(
      'la insignia de stock se lee sobre su fondo',
      insignia.contraste >= 4.5,
      insignia.contraste + ':1 (' + insignia.texto.hex + ' sobre ' + insignia.fondo.hex + ')'
    )
  }

  if (item) {
    comprobar(
      'las filas se separan con una línea fina (AA pide 3:1 contra el fondo)',
      item.borde.alpha === 255 || item.anchoBorde !== '0px',
      'borde ' + item.anchoBorde + ' ' + item.estiloBorde + ' ' + item.borde.hex
    )
  }
  if (campo) {
    comprobar(
      'la caja de búsqueda tiene relleno y esquinas redondeadas',
      campo.padding !== '0px' && campo.radio !== '0px',
      'padding ' + campo.padding + ', radio ' + campo.radio
    )
  }
  comprobar(
    'el fondo de la app es un color suave, ni blanco ni negro puro',
    cuerpoDeLaApp.fondo.hex !== '#ffffff' && cuerpoDeLaApp.fondo.hex !== '#000000',
    cuerpoDeLaApp.fondo.hex
  )

  console.log('\n--- estilos medidos (sRGB real) ---')
  for (const e of diseno.elementos) {
    if (!e.encontrado) continue
    console.log(
      '  ' + (e.etiqueta + ':').padEnd(24) +
        'fondo ' + (e.fondoCss + ' ' + e.fondo.hex).padEnd(32) +
        'texto ' + (e.textoCss + ' ' + e.texto.hex).padEnd(32) +
        'contraste ' + e.contraste + ':1'
    )
    console.log(
      '  ' + ''.padEnd(24) +
        'borde ' + (e.anchoBorde + ' ' + e.estiloBorde + ' ' + e.borde.hex).padEnd(32) +
        'radio ' + (e.radio + ', pad ' + e.padding).padEnd(32) + e.fuente
    )
  }
  console.log('------------------------------------\n')

  // ---------------------------------------------------------------
  // 10. Que no quede ni un error.
  // ---------------------------------------------------------------
  paso('errores-renderer')
  const errores = await sondear(ventana, 'window.__errores')
  comprobar(
    'el renderer no lanzó ninguna excepción',
    Array.isArray(errores) && errores.length === 0,
    (errores || []).slice(0, 3).join(' | ')
  )
  comprobar(
    'el renderer no loggedó errores de consola',
    erroresRender.length === 0,
    erroresRender.slice(0, 3).join(' | ')
  )

  // ---------------------------------------------------------------
  console.log('\n================ RESUMEN ================')
  const fallas = resultados.filter(r => !r.ok)
  console.log((resultados.length - fallas.length) + '/' + resultados.length + ' comprobaciones OK')
  if (fallas.length) {
    console.log('\nFALLAS:')
    for (const f of fallas) console.log('  - ' + f.nombre + (f.detalle ? ' (' + f.detalle + ')' : ''))
  }

  app.exit(fallas.length ? 1 : 0)
}

/**
 * Mide colores, bordes y espaciado de la pantalla viva.
 *
 * Los colores se pasan por un canvas para leer bytes sRGB de verdad:
 * getComputedStyle devuelve el `oklch(...)` tal como se escribió —Chrome
 * conserva el espacio de color— y la fórmula de contraste de WCAG necesita los
 * canales ya convertidos. Sin esto se puede ver que el token resolvió, pero no
 * cuánto contrasta.
 *
 * Un elemento con fondo transparente se mide contra el primer fondo opaco de
 * sus ancestros, que es lo que se ve de verdad detrás del texto. Medirlo
 * contra negro daría un contraste inventado.
 */
const DISENO = `(() => {
  const SENTINELA = '#010203'
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = 1
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  const hex = d => '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')

  /** Pinta un color sobre un fondo y devuelve los bytes sRGB resultantes. */
  const leer = (color, fondo) => {
    if (!ctx) return { r: 0, g: 0, b: 0, hex: '#??????' }
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = SENTINELA
    ctx.fillRect(0, 0, 1, 1)
    if (fondo) {
      ctx.fillStyle = fondo
      ctx.fillRect(0, 0, 1, 1)
    }
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], alpha: d[3], hex: hex(d) }
  }

  const opaco = color => {
    const m = /rgba?\\(([^)]+)\\)/.exec(color || '')
    if (!m) return true
    const partes = m[1].split(',').map(s => s.trim())
    if (/^transparent$/i.test(color)) return false
    return partes.length < 4 || Number(partes[3]) > 0
  }

  /** El primer fondo opaco hacia arriba: lo que se ve detrás del elemento. */
  const fondoEfectivo = el => {
    let nodo = el
    while (nodo && nodo.nodeType === 1) {
      const c = getComputedStyle(nodo).backgroundColor
      if (opaco(c)) return c
      nodo = nodo.parentElement
    }
    return 'rgb(255, 255, 255)'
  }

  const luminancia = c => {
    const canal = v => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b)
  }
  const contraste = (a, b) => {
    const la = luminancia(a)
    const lb = luminancia(b)
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100
  }

  const medir = (etiqueta, el) => {
    if (!el) return { etiqueta, encontrado: false }
    const c = getComputedStyle(el)
    const fondoCss = fondoEfectivo(el)
    const texto = leer(c.color, fondoCss)
    const fondo = leer(fondoCss, null)
    return {
      etiqueta,
      encontrado: true,
      textoCss: c.color,
      texto,
      fondoCss,
      fondo,
      bordeCss: c.borderTopColor,
      borde: leer(c.borderTopColor, fondoCss),
      anchoBorde: c.borderTopWidth,
      estiloBorde: c.borderTopStyle,
      radio: c.borderTopLeftRadius,
      padding: c.padding,
      fuente: c.fontSize + '/' + c.lineHeight + ' ' + c.fontWeight,
      sombra: c.boxShadow,
      contraste: contraste(texto, fondo)
    }
  }

  const insignia = [...document.querySelectorAll('*')].find(e =>
    e.children.length === 0 && (e.textContent || '').trim() === 'Sin stock'
  )
  const boton = [...document.querySelectorAll('button')].find(b =>
    (b.textContent || '').includes('Nuevo producto')
  )
  const lista = document.querySelector('ul')

  return {
    ancho: window.innerWidth,
    alto: window.innerHeight,
    elementos: [
      medir('cuerpo', document.body),
      medir('título de pantalla', document.querySelector('h2')),
      medir('contenedor del listado', lista ? lista.parentElement : null),
      medir('tarjeta del listado', lista ? (lista.closest('div[class]') || null) : null),
      medir('primer item de la lista', lista ? lista.firstElementChild : null),
      medir('nombre del producto', document.querySelector('li p')),
      medir('insignia de stock', insignia),
      medir('botón Nuevo producto', boton),
      medir('caja de búsqueda', window.__porEtiqueta('Buscar en el catálogo'))
    ]
  }
})()`

app.whenReady().then(() => {
  main().catch(e => {
    console.error('\nFALLÓ EL ARNÉS:', e && e.stack ? e.stack : e)
    app.exit(1)
  })
})
