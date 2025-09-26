import { useEffect } from 'react';

export const MOTION_TOKEN = {
  durations: {
    xs: 0.18,
    sm: 0.28,
    md: 0.48,
  },
  eases: {
    standard: 'power2.out',
    entrance: 'power3.out',
    pop: 'back.out(1.7)',
  },
};

export const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const usePrefersReducedMotion = () => {
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => {
      /* noop: hook triggers re-render when media query changes */
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion();
};
