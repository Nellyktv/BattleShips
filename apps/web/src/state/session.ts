const fallbackStorage = new Map<string, string>();

export const getSessionStorage = () => {
  if (globalThis.sessionStorage) return globalThis.sessionStorage;
  return {
    getItem: (key: string) => fallbackStorage.get(key) ?? null,
    setItem: (key: string, value: string) =>
      void fallbackStorage.set(key, value),
    removeItem: (key: string) => void fallbackStorage.delete(key),
  };
};
