/**
 * Normalización para buscar.
 *
 * Existe porque SQLite no pliega acentos. `LIKE` y `lower()` de SQLite solo
 *.foldean ASCII: en esta base, `ACETILSALICÍLICO` no aparece ni con
 * `LIKE '%acetilsalicilico%'` ni con `lower()`. Con 104 de 681 productos
 * acentuados (15%), buscar "atorvastatina" daría cero resultados, y el
 * nombre canónico de varios medicamentos lleva tilde.
 *
 * La solución es una función SQL registrada desde JS: la lógica queda en
 * TypeScript, testeable, y SQLite la llama como si fuera nativa. No hace
 * falta guardar una columna normalizada: ni el esquema ni los datos cambian.
 */

/**
 * Marcas de acentuación combinantes. Se quitan después de `normalize('NFD')`,
 * que es lo que separa la letra de su tilde. `ñ` se pliega a `n`: no hay
 * ningún medicamento donde esa diferencia sirva, y así "nylon" encuentra
 * "ñilón".
 */
const COMBINANTES = /\p{Diacritic}/gu

/*
 * La puntuación se respeta tal cual: `SODIO,CLORURO` se busca como
 * `SODIO,CLORURO`. Se evaluó y se descartó plegarla a espacio, que haría que
 * "sodio cloruro" encontrara a `SODIO,CLORURO` (83 registros del archivo
 * traen la coma donde debería ir un espacio, y 90 traen `ASOC.`).
 *
 * El motivo: si el dato viene mal puesto, lo que corresponde es corregirlo, no
 * acomodar la búsqueda para que el error no se note. El arreglo de fondo es que
 * M5 busque por palabras sueltas en vez de por frase, que además resuelve el
 * caso del orden ("cloruro de sodio" contra "sodio cloruro"). Esa búsqueda por
 * tokens va a ignorar la puntuación por su cuenta; no hace falta hacerlo acá.
 */

/**
 * Reduce un texto a la forma en la que se busca: sin tildes, en minúsculas y
 * con espacios simples. La puntuación no se toca.
 *
 * Solo se usa para COMPARAR. Lo que se guarda y lo que se muestra quedan
 * exactamente como lo escribió el usuario o como vino del archivo de origen.
 */
export function fold(texto: string): string {
  return texto.normalize('NFD').replace(COMBINANTES, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Escapa los comodines de LIKE.
 *
 * Sin esto, un filtro de "%" traería todo el catálogo y un "_" traería
 * cualquier carácter. Se hace sobre el texto YA plegado, porque plegar no
 * genera comodines pero sí puede cambiar la longitud.
 */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, c => `\\${c}`)
}

/**
 * Registra las funciones que usa la búsqueda. Se llama una sola vez, al abrir
 * la base.
 *
 * `deterministic` le dice a SQLite que la función siempre da lo mismo para la
 * misma entrada, así que la puede usar dentro de índices y cachear el plan.
 */
export function registrarFuncionesDeBusqueda(db: import('better-sqlite3').Database): void {
  db.function('fold', { deterministic: true }, (texto: unknown) =>
    typeof texto === 'string' ? fold(texto) : ''
  )
}
