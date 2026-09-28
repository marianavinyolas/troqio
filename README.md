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
pnpm install          # instalar dependencias
pnpm dev              # modo desarrollo (ventana + HMR)
pnpm build            # compilar main / preload / renderer
pnpm start            # previsualizar la compilación
pnpm smoke            # verifica la base de datos e imprime JSON, sin ventana
pnpm test             # tests unitarios
pnpm typecheck        # TypeScript estricto
pnpm lint             # Biome
```

## Arquitectura

```
src/main/      proceso principal: ÚNICO que toca la base de datos y el disco
src/preload/   puente contextBridge, sin acceso a Node (sandbox: true)
src/renderer/  interfaz React, sin SQL y sin acceso al sistema de archivos
src/shared/    contrato IPC, esquemas Zod y tipos (lo usan main y renderer)
```

El renderer **nunca** es de confianza: cada comando IPC revalida sus
argumentos con Zod antes de tocar la base. No existe un `query(sql)` genérico.

## Notas de la pila

- **better-sqlite3 13** usa binarios precompilados N-API: el mismo `.node`
  sirve para Node y para Electron. No hace falta recompilar contra el ABI de
  Electron ni tener MSVC en la máquina de compilación.
- **electron 44** quitó su `postinstall` (medida de seguridad). El binario se
  descarga de forma perezosa; en CI se baja de forma explícita con
  `pnpm exec install-electron`.
- **pnpm 11** ya no lee el campo `pnpm` de `package.json` y eliminó
  `onlyBuiltDependencies`. La configuración vive en `pnpm-workspace.yaml`
  usando `allowBuilds`.

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
