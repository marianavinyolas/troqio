# Instalación de Troqio

> ## Estado de esta versión
>
> Esta es la versión **0.1.0**. **Ya se puede cargar el catálogo y buscar**:
> importás el archivo de productos, se editan a mano, y el filtro encuentra
> por nombre, principio activo o código de barras.
>
> **Todavía no se cuenta el stock.** Todos los productos entran con stock 0 y
> no hay forma de cargarlo todavía: el conteo llega en el próximo hito. Se
> puede usar para cargar y revisar el catálogo, no para trabajar con las cajas
> del estante.
>
> No borres la carpeta de datos: importás el catálogo una vez y ahí queda.

## Requisitos

- Windows 10 u 11, versión **64 bits** (x64).
- Unos **500 MB** libres: el instalador ocupa 110 MB y la aplicación
  instalada unos 390 MB.
- **No hace falta ser administrador** de la computadora.

## 1. Conseguir el instalador

El instalador no se publica todavía en una página de descargas. Sale de la
compilación automática en GitHub:

1. Entrá a <https://github.com/marianavinyolas/troqio/actions>
2. Iniciá sesión con tu cuenta de GitHub (hace falta: los artefactos no se
   descargan sin iniciar sesión).
3. Abrí la ejecución más reciente que diga **"Build Windows"** y terminó en
   verde.
4. Abajo, en **Artifacts**, descargá `troqio-windows-x64`.
5. Descomprimí el zip. Adentro está **`Troqio-Setup-0.1.0.exe`**.

> Los artefactos se borran a los 30 días. Si no está ninguno, pedile a
> quien compile que ejecute el workflow de nuevo.

## 2. Instalar

Hacé doble clic en `Troqio-Setup-0.1.0.exe`.

### Si aparece la ventana azul de Windows

El instalador **no está firmado** (no se compró un certificado de firma), así
que Windows lo marca como no reconocido. Es esperado:

1. Clic en **"Más información"**.
2. Clic en **"Ejecutar de todas formas"**.

Ningún otro software legítimo de una farmacia se llama "Troqio", así que
podés hacerlo sin riesgo. Windows te va a mostrar esta advertencia en cada
actualización.

### Si Windows pide permiso de administrador

Dejalo instalado **para el usuario actual**. En la pantalla
*"¿Instalar para todos los usuarios de esta computadora?"* elegí la opción
de abajo, la que dice **"Instalar solo para [tu usuario]"**.

Esa es la opción marcada por defecto y es la correcta: instala en tu carpeta
de usuario y no pide contraseña de administrador.

Elegir "para todos los usuarios" solo tiene sentido si querés que el ícono y
el acceso directo aparezcan para el resto de los usuarios de la misma
computadora.

### Carpeta de destino

Por defecto queda en:

```
C:\Users\<tu usuario>\AppData\Local\Programs\Troqio
```

Podés cambiarla en el asistente si preferís otro lugar. Si la movés, los
datos de la farmacia **no** la siguen: viven en otra carpeta (ver abajo).

## 3. Dónde están los datos

La base de datos **no** está dentro de la carpeta de la aplicación. Vive en
la carpeta de datos del usuario de Windows:

```
%APPDATA%\troqio\troqio.db
```

Para abrirla: abrí el Explorador de archivos, pegá `%APPDATA%` en la barra de
direcciones y entrá a la carpeta `troqio`.

Que esté aparte es a propósito: podés desinstalar y reinstalar la aplicación
sin tocar los datos.

## 4. Respaldar

**Cerrá Troqio antes de copiar.** No es un detalle menor.

La base funciona en modo WAL: con la aplicación abierta, lo último que
cargaste está en un archivo auxiliar (`troqio.db-wal`) y **no** en
`troqio.db`. Copiar solo `troqio.db` con el programa abierto te da un archivo
**sin ninguna tabla**: el respaldo no sirve para nada.

Hacé así:

1. Cerrá Troqio.
2. Copiá `%APPDATA%\troqio\troqio.db` a un pendrive.

Al cerrar bien, el archivo auxiliar se vuelca dentro de `troqio.db` y se
borra, así que con la app cerrada el archivo único está completo.

Si no podés cerrar la app, copiá **los tres** archivos juntos:
`troqio.db`, `troqio.db-wal` y `troqio.db-shm`.

Un respaldo guardado en la misma computadora **no** protege de una falla de
disco. Si el inventario es real, el respaldo tiene que estar en otro
dispositivo.

## 5. Actualizar

1. Bajá el instalador nuevo como en el paso 1.
2. Instalalo encima de la versión anterior.
3. Tus datos quedan intactos: viven en `%APPDATA%`, no en la carpeta de la
   aplicación.

## 6. Desinstalar

**Configuración → Aplicaciones → Troqio → Desinstalar.**

La desinstalación **no borra la base de datos** (está configurado
`deleteAppDataOnUninstall: false`). Si querés borrarla también, tenés que
eliminar la carpeta `%APPDATA%\troqio` a mano.

Sacá una copia antes, si el inventario te importa.

## Problemas frecuentes

**"Windows protected your PC" / "Windows protégé su PC"**
Esperado, la build no está firmada. "Más información" → "Ejecutar de todas
formas".

**El antivirus bloquea el instalador**
También es la falta de firma. Agregá una excepción para
`Troqio-Setup-0.1.0.exe`.

**"Esta aplicación no se puede ejecutar en esta PC"**
Falta Windows 64 bits. En Windows de 32 bits no corre.

**No me aparece la opción "solo para mí"**
Estás abriendo el instalador como administrador. Cerralo y abrilo con doble
clic normal.

**Instalé de nuevo y perdí los datos**
No se pierden: quedan en `%APPDATA%\troqio`, fuera de la carpeta de
programas, que es lo que hace que reinstalar no borre el catálogo. Si la app no
muestra lo que esperás, revisá que estés entrando a la misma carpeta (con
`%APPDATA%` apuntando al usuario con el que cargaste). Si sigue sin verse,
probá importar el archivo otra vez: no duplica nada.
