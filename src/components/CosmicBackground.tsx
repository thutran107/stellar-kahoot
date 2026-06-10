import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedEffects } from '../hooks/useReducedEffects';

const PLANETS = [
  {
    size: 350,
    bg: 'radial-gradient(circle at 30% 30%, rgba(34, 211, 238, 0.2), rgba(2, 6, 23, 0.9))', // Cyan
    top: '5%',
    left: '70%',
    duration: 35,
    blur: 'blur(8px)',
  },
  {
    size: 200,
    bg: 'radial-gradient(circle at 40% 30%, rgba(244, 114, 182, 0.25), rgba(30, 27, 75, 0.8))', // Pink
    top: '60%',
    left: '10%',
    duration: 25,
    blur: 'blur(5px)',
  },
  {
    size: 120,
    bg: 'radial-gradient(circle at 20% 20%, rgba(52, 211, 153, 0.3), rgba(2, 6, 23, 0.9))', // Greenish
    top: '80%',
    left: '80%',
    duration: 20,
    blur: 'blur(3px)',
  },
  {
    size: 160,
    bg: 'radial-gradient(circle at 60% 40%, rgba(79, 70, 229, 0.4), rgba(2, 6, 23, 0.8))', // Indigo
    top: '20%',
    left: '15%',
    duration: 30,
    blur: 'blur(6px)',
  }
];

export function CosmicBackground() {
  const lite = useReducedEffects();
  const [stars, setStars] = useState<{ id: number; top: string; left: string; size: number; delay: number; duration: number }[]>([]);

  useEffect(() => {
    // Generate stars only on the client side to avoid hydration mismatches if we had SSR,
    // and to keep generating consistent arrays. Fewer on phones to ease GPU/memory load.
    const starCount = lite ? 20 : 60;
    const generatedStars = Array.from({ length: starCount }).map((_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5,
      duration: Math.random() * 3 + 2,
    }));
    setStars(generatedStars);
  }, [lite]);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Deep space twinkling stars */}
      {stars.map((star) => (
        <motion.div
          key={`star-${star.id}`}
          className="absolute bg-white rounded-full"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: lite ? 0.5 : 0.1,
          }}
          animate={lite ? undefined : {
            opacity: [0.1, 0.6, 0.1],
            scale: [1, 1.2, 1],
          }}
          transition={lite ? undefined : {
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Floating Planets / Gas Giants */}
      {PLANETS.map((planet, i) => (
        <motion.div
          key={`planet-${i}`}
          className="absolute rounded-full"
          style={{
            width: planet.size,
            height: planet.size,
            background: planet.bg,
            top: planet.top,
            left: planet.left,
            filter: lite ? 'none' : planet.blur,
            boxShadow: 'inset -20px -20px 50px rgba(0,0,0,0.8)',
          }}
          animate={lite ? undefined : {
            y: [0, -30, 0],
            x: [0, 20, 0],
            rotate: [0, 30, 0],
          }}
          transition={lite ? undefined : {
            duration: planet.duration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
