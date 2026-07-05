import { useState, type Dispatch, type SetStateAction } from "react";

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (!stored) return initialValue;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return initialValue;
    }
  });
  return [
    value,
    (next) => {
      setValue((current) => {
        const nextValue =
          typeof next === "function" ? (next as (currentValue: T) => T)(current) : next;

        localStorage.setItem(key, JSON.stringify(nextValue));
        return nextValue;
      });
    },
  ];
}
