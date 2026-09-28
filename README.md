# Troqio

Inventario local de troqueles (blísteres de dosis individual) para farmacia.
Aplicación de escritorio, funciona sin conexión a internet.

## Dónde están los datos

La base de datos SQLite vive **fuera** de la carpeta de la aplicación, en la
carpeta de datos de usuario:

| Sistema | Ruta |
| --- | --- |
| **Windows** | `%APPDATA%\troqio\troqio.db` |
| macOS | `~/Library/Application Support/troqio/troqio.db` |

En Windows se abre con: `%APPDATA%` en la barra de direcciones del Explorador.

> **Respaldo: cerrá Troqio antes de copiar.** La base usa WAL
> (`journal_mode = WAL`), así que con la aplicación abierta los cambios
> recientes están en `troqio.db-wal`, no en `troqio.db`. Copiar solo
> `troqio.db` con la app corriendo produce un archivo **sin ninguna tabla**
> (verificado: `no such table`). Al cerrar bien, SQLite vuelca el WAL dentro de
> `troqio.db` y borra los archivos `-wal`/`-shm`: copiando solo `troqio.db`
> con la app cerrada el respaldo queda completo.
>
> Si no podés cerrar la app, copiá los tres archivos juntos: `troqio.db`,
> `troqio.db-wal` y `troqio.db-shm`.

Los respaldos locales en la misma máquina **no** protegen contra una falla de
disco. Copiá a un pendrive.

Desinstalar la aplicación **no** borra la base de datos
(`deleteAppDataOnUninstall: false` en `electron-builder.yml`).

## Comandos

```bash
pnpm install            # instalar dependencias
pnpm dev                # modo desarrollo (ventana + HMR)
pnpm build              # compilar main / preload / renderer
pnpm start              # previsualizar la compilación
pnpm smoke              # verifica la base de datos e imprime JSON, sin ventana
pnpm test               # tests unitarios
pnpm typecheck          # TypeScript estricto
pnpm lint               # Biome
pnpm verificar:clases   # clases de Tailwind ausentes del CSS compilado
pnpm db:generate        # generar una migración a partir de schema.ts
pnpm db:check           # verificar que las migraciones no se contradicen
```

## Arquitectura

```
src/main/      proceso principal: ÚNICO que toca la base de datos y el disco
src/preload/   puente contextBridge, sin acceso a Node (sandbox: true)
src/renderer/  interfaz React, sin SQL y sin acceso al sistema de archivos
src/shared/    contrato IPC, esquemas Zod y tipos (lo usan main y renderer)
drizzle/       migraciones SQL generadas, se empaquetan dentro del asar
```

El renderer **nunca** es de confianza: cada comando IPC revalida sus
argumentos con Zod antes de tocar la base. No existe un `query(sql)` genérico.

Dentro del renderer:

```
src/renderer/src/
  rutas.ts        registro de destinos (datos puros, sin React)
  iconos.ts       set de iconos SVG, tambien datos puros
  cx.ts           une clases descartando pedazos vacios
  componentes/    shell (riel, cabecera) y primitivas en componentes/ui/
  pantallas/      una por destino
  ganchos/        hooks con estado
```

`rutas.ts` e `iconos.ts` no importan React a propósito: eso permite
verificarlos con `tests/rutas.test.ts` en entorno node, sin jsdom.

## Notas de la pila

- **Tailwind v4** no falla cuando se usa una clase que no existe: simplemente
  no genera CSS y la regla se aplica en silencio. Un `rounded-pill` con el
  token eliminado, o un `w-18` mal calculado, se detectan recién mirando el
  maquete. Por eso está `pnpm verificar:clases`, que extrae las clases usadas en
  el renderer y falla si alguna no aparece en el CSS compilado.
- **better-sqlite3 13** usa binarios precompilados N-API: el mismo `.node`
  sirve para Node y para Electron. No hace falta recompilar contra el ABI de
  Electron ni tener MSVC en la máquina de compilación.
- **electron 44** quitó su `postinstall` (medida de seguridad). El binario se
  descarga de forma perezosa; en CI se baja de forma explícita con
  `pnpm exec install-electron`.
- **pnpm 11** ya no lee el campo `pnpm` de `package.json` y eliminó
  `onlyBuiltDependencies`. La configuración vive en `pnpm-workspace.yaml`
  usando `allowBuilds`.
- **SQLite tiene afinidades, no tipos.** Una columna `INTEGER` acepta el texto
  `'muchos'` y lo guarda tal cual, sin convertirlo. Peor: en las comparaciones
  SQLite ordena por tipo (NULL < INTEGER/REAL < TEXT < BLOB), así que
  `'muchos' > 0` es **verdadero** y un `CHECK (cantidad > 0)` no frena nada.
  Por eso todo CHECK de cantidad compara también `typeof(cantidad) =
  'integer'`. Sin eso, un texto colado en `stock.cantidad` pasa el filtro de
  "nunca stock negativo".

## La base de datos

Tres tablas, en `src/main/db/schema.ts`. Las migraciones se generan con
`pnpm db:generate` y las aplica `src/main/db/migrar.ts` al abrir la base.

```
producto           el medicamento: nombre, principio activo, troquel, código
stock              cantidad actual de cajas, una fila por producto
movimiento_stock   libro de movimientos, solo se agrega, nunca se edita
```

Reglas que están en el esquema y no conviene volver a discutir:

- `codigo_barras` es **texto**, nunca número. Hay códigos con ceros iniciales
  (`0070942507240`) que como número dejan de existir.
- Ni `codigo_barras` ni `numero_troquel` son `UNIQUE`, y `numero_troquel`
  admite `NULL`. Un error de tipeo al cargar datos se reporta como advertencia,
  nunca bloquea el alta.
- `stock.cantidad` no puede ser negativa: hay un `CHECK`, y encima el descuento
  usa `WHERE cantidad >= ?` para que un pedido imposible no escriba nada.
- Un `ajuste` guarda la diferencia **con signo** (contar 3 donde había 8 es un
  `-5`), por eso es el único tipo que acepta un número negativo. `ingreso` y
  `egreso` siempre positivos.
- La baja de un producto es lógica (`activo`), porque el historial lo referencia
  y las claves foráneas son `ON DELETE RESTRICT`.

Sobre `$defaultFn`: en Drizzle completa el valor solo en el `insert`. En un
`update` sin ese campo en el `set` **no** lo toca, así que `actualizadoEn` hay
que pasarlo explícitamente. Está verificado en `tests/migraciones.test.ts`.

### Las migraciones viajan dentro del asar

`migrar.ts` resuelve la carpeta con `join(__dirname, '..', '..', 'drizzle')`.
Esa misma ruta sirve en los dos casos:

```
desarrollo:   <repo>/out/main/index.js  ->  <repo>/drizzle
empaquetada:  app.asar/out/main/index.js -> app.asar/drizzle
```

Electron deja leer el asar como si fuera una carpeta común, así que no hace
falta desenpaquetar nada, y `electron-builder.yml` incluye `drizzle/**` en
`files`. Ojo: si ese patrón se pierde del `files`, la app instalada no
encuentra el esquema y falla en el primer query con `no such table`. Por eso
`--smoke-test` ahora informa `tablas` y `migraciones`: es la única forma de
distinguir "arrancó" de "arrancó con la base migrada".

## Distribución

Instalador NSIS para Windows x64, sin firmar. Se compila en GitHub Actions y
se descarga como artefacto del workflow.

La guía para quien lo instala es **[INSTALACION.md](INSTALACION.md)**.

### Un detalle de NSIS que costó tiempo

`nsis.language` **no** es el idioma de la interfaz del asistente. Se usa en
un solo lugar, `computeVersionKey()` de electron-builder, como LANG de
recursos de Windows para el plugin `VIAddVersionKey`, y espera un LANGID
numérico. Con `language: es` makensis aborta con:

```
VIAddVersionKey: "/LANG=es" is not a valid language code!
```

Lo que hace falta son dos opciones distintas:

| Opción | Qué controla | Valor |
| --- | --- | --- |
| `nsis.language` | LANG de recursos Windows (`VIAddVersionKey`) | `2058` (0x080A, es-AR) |
| `nsis.installerLanguages` | idioma de la UI del asistente | `es_ES` → `SpanishInternational` |

Ojo con `multiLanguageInstaller: false`: hace que `LangConfigurator` ponga
`langs = ["en_US"]` e **ignore** `installerLanguages` por completo, así que
el asistente salía en inglés.
