import { useEffect, useState } from 'react';

// Returns true when we should run a lighter visual mode.
//
// Mobile Safari kills the tab's render process ("A problem repeatedly occurred")
// when too many continuously-animating, GPU-composited layers (large blurs +
// mix-blend-screen) build up memory pressure over a game session. We detect
// phones (and anyone who asked for reduced motion) and downgrade the heaviest
// background effects for them while leaving desktop untouched.
function detect(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
  return reducedMotion || isPhone;
}

export function useReducedEffects(): boolean {
  const [lite, setLite] = useState<boolean>(detect);

  useEffect(() => {
    const onChange = () => setLite(detect());
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionQuery.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      motionQuery.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return lite;
}
