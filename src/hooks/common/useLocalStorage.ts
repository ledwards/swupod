// @ts-nocheck
/**
 * useLocalStorage Hook
 *
 * Provides a useState-like interface for localStorage with:
 * - SSR safety (returns initial value on server)
 * - Automatic JSON serialization/deserialization
 * - Storage event sync across tabs
 * - Error handling for quota exceeded
 */

import { useState, useEffect, useCallback } from 'react';

// === TYPES ===

/** Options for useLocalStorage hook */
interface UseLocalStorageOptions {
  /** Sync across browser tabs (default: false) */
  syncTabs?: boolean;
}

/** Setter function type (like useState) */
type SetValue<T> = (value: T | ((prev: T) => T)) => void;

/** Return type for useLocalStorage hook */
type UseLocalStorageReturn<T> = [T, SetValue<T>, () => void];

// === HELPERS ===

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Safely get an item from localStorage
 * @param key - Storage key
 * @param fallback - Default value if key doesn't exist or parsing fails
 * @returns Stored value or fallback
 */
function getStorageItem<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;

  try {
    const item = localStorage.getItem(key);
    if (item === null) return fallback;
    return JSON.parse(item) as T;
  } catch (e) {
    console.warn(`Error reading localStorage key "${key}":`, e);
    return fallback;
  }
}

/**
 * Safely set an item in localStorage
 * @param key - Storage key
 * @param value - Value to store (will be JSON stringified)
 * @returns True if successful
 */
function setStorageItem<T>(key: string, value: T): boolean {
  if (!isBrowser()) return false;

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Error setting localStorage key "${key}":`, e);
    return false;
  }
}

/**
 * Safely remove an item from localStorage
 * @param key - Storage key
 */
function removeStorageItem(key: string): void {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`Error removing localStorage key "${key}":`, e);
  }
}

// === HOOK ===

/**
 * Hook for localStorage with React state sync
 *
 * @param key - localStorage key
 * @param initialValue - Default value if key doesn't exist
 * @param options - Options
 * @returns [value, setValue, removeValue]
 *
 * @example
 * function MyComponent() {
 *   const [name, setName, removeName] = useLocalStorage('user-name', 'Guest')
 *
 *   return (
 *     <input
 *       value={name}
 *       onChange={(e) => setName(e.target.value)}
 *     />
 *   )
 * }
 *
 * @example
 * // With object value
 * const [settings, setSettings] = useLocalStorage('settings', { theme: 'dark' })
 * setSettings({ ...settings, theme: 'light' })
 *
 * @example
 * // Functional update
 * const [count, setCount] = useLocalStorage('count', 0)
 * setCount(prev => prev + 1)
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions = {}
): UseLocalStorageReturn<T> {
  const { syncTabs = false } = options;

  // State to store our value
  // Initialize from localStorage or use initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    return getStorageItem(key, initialValue);
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage
  const setValue: SetValue<T> = useCallback((value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      setStorageItem(key, valueToStore);
    } catch (error) {
      console.error(`Error in useLocalStorage setValue for "${key}":`, error);
    }
  }, [key, storedValue]);

  // Remove value from storage
  const removeValue = useCallback(() => {
    setStoredValue(initialValue);
    removeStorageItem(key);
  }, [key, initialValue]);

  // Sync with storage changes (from other tabs)
  useEffect(() => {
    if (!syncTabs || !isBrowser()) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch {
          // Invalid JSON, ignore
        }
      } else if (e.key === key && e.newValue === null) {
        // Key was removed
        setStoredValue(initialValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue, syncTabs]);

  return [storedValue, setValue, removeValue];
}

/**
 * Read-only version - just get the current value
 * Useful when you only need to read, not write
 *
 * @param key - localStorage key
 * @param fallback - Default value if key doesn't exist
 * @returns Stored value or fallback
 */
export function useLocalStorageValue<T>(key: string, fallback: T | null = null): T | null {
  const [value, setValue] = useState<T | null>(fallback);

  useEffect(() => {
    setValue(getStorageItem(key, fallback));
  }, [key, fallback]);

  return value;
}

/**
 * Non-hook utilities for use outside of React components
 */
export const storage = {
  get: getStorageItem,
  set: setStorageItem,
  remove: removeStorageItem,
};

export default useLocalStorage;
