import type { TroqioApi } from './index'

declare global {
  interface Window {
    troqio: TroqioApi
  }
}
