import { STORAGE_PREFIX } from './config';

/** localStorage com prefixo da v2; nunca lança (modo privado, bloqueio, cota). */
export const prefs = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(STORAGE_PREFIX + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch {
      /* conveniência apenas; a aplicação funciona sem isso */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* idem */
    }
  },
};
