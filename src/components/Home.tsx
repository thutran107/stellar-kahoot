import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Rocket, Play, Plus } from 'lucide-react';
import { useGameStore } from '../store';

export function Home() {
  const navigate = useNavigate();
  const connect = useGameStore((state) => state.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 glass p-12 rounded-[3rem] border-dashed border-2 border-indigo-400/30"
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center mx-auto mb-8 shadow-xl">
           <span className="text-5xl">🛸</span>
        </div>
        <h1 className="text-6xl font-black mb-4 italic tracking-tighter text-white">
          COSMO
        </h1>
        <p className="text-sm uppercase tracking-[0.3em] font-bold opacity-50 mb-4">Quiz Station</p>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-md">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/join')}
          className="flex-1 py-4 px-6 glass rounded-xl flex items-center justify-center gap-2 group hover:bg-white/5 transition-colors"
        >
          <Play className="w-6 h-6 text-neon-blue group-hover:text-neon-pink transition-colors" />
          <span className="text-xl font-bold uppercase tracking-wider">Join Game</span>
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/quizzes')}
          className="flex-1 py-4 px-6 text-white rounded-xl flex items-center justify-center gap-2 btn-funky"
        >
          <Plus className="w-6 h-6" />
          <span className="text-xl font-bold uppercase tracking-wider">Host Game</span>
        </motion.button>
      </div>

      <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/demo')}
          className="mt-8 w-full max-w-md py-4 glass rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-colors uppercase tracking-widest text-sm border-dashed border-2 border-indigo-400/30"
        >
          Auto-Play UI Demo 
      </motion.button>
    </div>
  );
}
