/**
 * Une clases descartando los pedazos vacios.
 *
 * Evita repetir `[a, b].filter(Boolean).join(' ')` en cada componente.
 */
export function cx(...partes: Array<string | false | null | undefined>): string {
  return partes.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ')
}
