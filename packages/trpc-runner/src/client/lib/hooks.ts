import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { RunnerBootData } from "../../types";

/**
 * Local storage keys for auth headers and input history. They are scoped to this runner
 * (page path, endpoint, and title), so different projects served from the same origin
 * (for example, whichever app is on localhost:3000 today) never share auth headers or
 * inputs. Theme and panel layout are UI preferences and stay origin-wide.
 */
export function getRunnerStorageKeys(pathname: string, boot: RunnerBootData) {
  const scope = [
    pathname.replace(/\/+$/, "") || "/",
    boot.options.endpoint,
    boot.manifest.title,
  ].join("|");
  return {
    headers: `trpc-runner.headers:${scope}`,
    history: `trpc-runner.history:${scope}`,
  };
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));
  const skipNextWriteRef = useRef(true);

  // Persist after state changes instead of inside the state updater, which React may
  // call more than once. The initial read is not written back.
  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or unavailable (for example, in private browsing).
    }
  }, [key, value]);

  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue((current) =>
      typeof next === "function" ? (next as (currentValue: T) => T)(current) : next,
    );
  }, []);

  return [value, update];
}

function readStoredValue<T>(key: string, initialValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? initialValue : (JSON.parse(stored) as T);
  } catch {
    return initialValue;
  }
}
