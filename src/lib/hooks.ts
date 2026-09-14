import { useEffect, useRef, type RefObject } from 'react';

/** Calls `handler` when a pointer/touch event occurs outside the referenced element. */
export function useOnClickOutside<T extends HTMLElement>(handler: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler]);
  return ref;
}
