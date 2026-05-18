import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGameStore } from '../store';
import { Rocket, CheckCircle2, XCircle, Clock, Trophy } from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';
import { PlayerProgressBar } from './PlayerProgressBar';

function PlayerThemeEffects() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Drifting Nebula Clouds */}
      <motion.div
        className="absolute -top-[20%] -left-[20%] w-[120%] md:w-[60%] h-[60%] rounded-full opacity-40 mix-blend-screen"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(50px)' }}
        animate={{
          x: [0, 50, 0],
          y: [0, 30, 0],
          scale: [1, 1.2, 1]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[30%] -right-[20%] w-[100%] md:w-[50%] h-[50%] rounded-full opacity-30 mix-blend-screen"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(40px)' }}
        animate={{
          x: [0, -40, 0],
          y: [0, -50, 0],
          scale: [1, 1.1, 1]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        className="absolute -bottom-[20%] left-[10%] w-[120%] md:w-[70%] h-[70%] rounded-full opacity-40 mix-blend-screen"
        style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.3) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)' }}
        animate={{
          x: [0, 30, 0],
          y: [0, -40, 0],
          scale: [1, 1.3, 1]
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      {/* Occasional Shooting Stars */}
      <motion.div
        className="absolute h-0.5 w-32 bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_10px_#fff]"
        style={{ top: '15%', left: '-20%', rotate: '20deg' }}
        animate={{
          left: ['-20%', '120%'],
          top: ['15%', '45%'],
          opacity: [0, 1, 0]
        }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 14, ease: "linear" }}
      />
      <motion.div
        className="absolute h-0.5 w-48 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_10px_#67e8f9]"
        style={{ top: '70%', right: '-20%', rotate: '-25deg' }}
        animate={{
          right: ['-20%', '120%'],
          top: ['70%', '20%'],
          opacity: [0, 1, 0]
        }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 20, ease: "linear", delay: 8 }}
      />
    </div>
  );
}

function TimerBar({ startTime, timeLimit }: { startTime: number, timeLimit: number }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!startTime || !timeLimit) return;
    
    let animationFrameId: number;
    const updateTimer = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, timeLimit - elapsed);
      const percentage = (remaining / timeLimit) * 100;
      setProgress(percentage);
      
      if (percentage > 0) {
        animationFrameId = requestAnimationFrame(updateTimer);
      }
    };
    
    animationFrameId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(animationFrameId);
  }, [startTime, timeLimit]);

  return (
    <div className="w-full bg-white/5 h-2 absolute top-0 left-0 z-50">
      <div 
        className="h-full"
        style={{ 
          width: `${progress}%`,
          backgroundColor: progress > 30 ? '#22d3ee' : '#f43f5e',
          boxShadow: progress > 30 ? '0 0 10px rgba(34, 211, 238, 0.5)' : '0 0 10px rgba(244, 63, 94, 0.5)',
          transition: 'width 0.1s linear, background-color 0.3s ease'
        }} 
      />
    </div>
  );
}

export function PlayerView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pinParam = searchParams.get('pin');
  
  const [pinInput, setPinInput] = useState(pinParam || '');
  const [nameInput, setNameInput] = useState('');
  
  const COSMIC_AVATARS = ['🪐', '🌍', '🌎', '🌏', '🌕', '🌑', '☄️', '💫', '🌟', '🌌'];
  const [selectedAvatar, setSelectedAvatar] = useState(COSMIC_AVATARS[0]);
  
  const {
    gamePin, gameState, joinGame, playerName, error, connect,
    question, currentQuestionIndex, submitAnswer, answerFeedback,
    players, questionStartTime
  } = useGameStore();

  useEffect(() => { connect(); }, [connect]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput && nameInput && selectedAvatar) {
      joinGame(pinInput, nameInput, selectedAvatar);
    }
  };

  const currentPlayer = players.find(p => p.name === playerName);
  const myScore = currentPlayer?.score || 0;
  const myColor = currentPlayer?.color || '#fff';
  const rank = [...players].sort((a,b) => b.score - a.score).findIndex(p => p.name === playerName) + 1;

  if (!gamePin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <PlayerThemeEffects />
        <div className="glass p-8 rounded-[2rem] max-w-md w-full relative overflow-hidden border-dashed border-2 border-indigo-400/30 shadow-2xl">
          <div className="text-center mb-8 relative z-10">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-xl">
               <span className="text-3xl">🛸</span>
            </div>
            <h2 className="text-3xl font-black italic tracking-tighter text-white">COSMO</h2>
            <p className="text-sm uppercase tracking-[0.3em] font-bold opacity-50 mt-1">Quiz Station</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-6 relative z-10">
            <div>
              <input 
                type="text" 
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={4}
                className="w-full glass rounded-xl px-4 py-4 text-center text-3xl font-black text-white focus:outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all tracking-widest placeholder-gray-500"
                placeholder="PIN"
                required
              />
            </div>
            
            <div>
              <input 
                type="text" 
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value.toUpperCase())}
                maxLength={12}
                className="w-full glass rounded-xl px-4 py-4 text-center text-2xl font-bold text-white focus:outline-none focus:border-neon-pink focus:ring-1 focus:ring-neon-pink outline-none transition-all uppercase placeholder-gray-500"
                placeholder="CALL SIGN"
                required
              />
            </div>

            <div className="pt-2">
              <label className="block text-indigo-300 font-mono mb-3 uppercase tracking-widest text-xs text-center">Select Your Planet</label>
              <div className="flex flex-wrap justify-center gap-2">
                {COSMIC_AVATARS.map(avatar => (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full text-xl sm:text-2xl flex items-center justify-center transition-all ${selectedAvatar === avatar ? 'bg-white/20 border-2 border-neon-pink scale-110 shadow-[0_0_15px_rgba(244,114,182,0.5)] z-10' : 'bg-white/5 border border-white/10 hover:bg-white/15 opacity-70 hover:opacity-100 hover:scale-105'}`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="text-red-400 text-center text-sm bg-red-900/20 py-2 rounded">{error}</div>}

            <button 
              type="submit"
              disabled={!pinInput || !nameInput}
              className="w-full py-4 text-white font-black text-2xl rounded-3xl btn-funky disabled:opacity-50 mt-4 uppercase tracking-tighter"
            >
              ENTER
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Player is in the game
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <PlayerThemeEffects />
      
      {gameState === 'QUESTION_ACTIVE' && question && (
        <TimerBar startTime={questionStartTime} timeLimit={question.timeLimit} />
      )}
      
      {/* HUD for player */}
      <div className="glass border-b-0 border-t-0 p-4 shrink-0 px-6 flex justify-between items-center z-10 sticky top-0 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-white/20 text-xl"
            style={{ backgroundColor: myColor, boxShadow: `0 0 10px ${myColor}50` }}
          >
            {currentPlayer?.avatar}
          </div>
          <div className="font-mono bg-white/10 px-3 py-1 rounded-full text-sm font-bold truncate max-w-[120px]">
            {playerName}
          </div>
        </div>
        <div className="font-mono text-neon-green font-bold bg-neon-green/10 px-4 py-1 rounded-full flex items-center gap-2 border border-neon-green/30 text-lg">
          {myScore} <span className="text-xs text-gray-400">PTS</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center p-4">
        {gameState === 'LOBBY' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <h2 className="text-4xl font-light italic mb-4 font-mono">You're in!</h2>
            <p className="text-xl text-gray-400 mb-8 font-light">See your name on the main screen</p>
            <div className="inline-block px-12 py-6 glass rounded-full relative overflow-hidden">
              <span className="relative font-bold text-lg tracking-widest text-indigo-300">AWAITING HOST...</span>
            </div>
          </motion.div>
        )}

        {gameState === 'QUESTION_ACTIVE' && question && answerFeedback === null && (
          <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full h-full">
            <div className="flex justify-center mb-4">
              <CountdownTimer startTime={questionStartTime} timeLimit={question.timeLimit} />
            </div>
            <h3 className="text-center text-gray-400 font-bold mb-8 tracking-widest">SELECT YOUR ANSWER</h3>
            <div className="grid grid-cols-2 gap-4 h-[60vh]">
              {question.options.map((_, i) => (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  key={i}
                  onClick={() => submitAnswer(i)}
                  className={`rounded-[2rem] glass flex items-center justify-center border-b-4 hover:brightness-110 active:border-b-0 active:translate-y-1 transition-all
                    ${i === 0 ? 'bg-red-500/20 border-red-500 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''}
                    ${i === 1 ? 'bg-blue-500/20 border-blue-500 hover:bg-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}
                    ${i === 2 ? 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : ''}
                    ${i === 3 ? 'bg-green-500/20 border-green-500 hover:bg-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : ''}
                  `}
                >
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2
                    ${i === 0 ? 'border-red-500 bg-red-900/50 text-white' : ''}
                    ${i === 1 ? 'border-blue-500 bg-blue-900/50 text-white' : ''}
                    ${i === 2 ? 'border-yellow-500 bg-yellow-900/50 text-white' : ''}
                    ${i === 3 ? 'border-green-500 bg-green-900/50 text-white' : ''}
                  `}>
                     <span className="font-black text-xl">{i + 1}</span>
                  </div>
                </motion.button>
              ))}
            </div>
            <PlayerProgressBar startTime={questionStartTime} timeLimit={question.timeLimit} />
          </div>
        )}

        {gameState === 'QUESTION_ACTIVE' && answerFeedback !== null && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto"
          >
             <Clock className="w-24 h-24 text-gray-500 mb-6 mx-auto animate-pulse" />
             <h2 className="text-3xl font-bold font-mono">ANSWER LOCKED IN</h2>
             <p className="text-gray-400 mt-4">Waiting for others...</p>
          </motion.div>
        )}

        {gameState === 'QUESTION_RESULTS' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex-1 flex flex-col items-center justify-center text-center p-8 rounded-[2rem] glass ${answerFeedback ? 'border-2 border-neon-green/50 shadow-[0_0_30px_rgba(52,211,153,0.2)]' : (answerFeedback === false ? 'border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.2)]')}`}
          >
            {answerFeedback ? (
              <>
                <CheckCircle2 className="w-32 h-32 text-neon-green mb-6 mx-auto" />
                <h2 className="text-5xl font-bold text-neon-green font-mono mb-2 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]">CORRECT!</h2>
                <div className="text-4xl font-black mt-4 mb-4 text-white">
                  +{currentPlayer?.lastPointsEarned} POINTS
                </div>
                <p className="text-xl">Awesome flying, captain.</p>
              </>
            ) : answerFeedback === false ? (
              <>
                <XCircle className="w-32 h-32 text-red-500 mb-6 mx-auto" />
                <h2 className="text-5xl font-bold text-red-500 font-mono mb-2 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">WRONG ORBIT</h2>
                <div className="text-3xl font-bold mt-4 mb-4 text-gray-500">
                  +0 POINTS
                </div>
                <p className="text-xl text-gray-300">Space is hard.</p>
              </>
            ) : (
              <>
                <Clock className="w-32 h-32 text-yellow-500 mb-6 mx-auto" />
                <h2 className="text-5xl font-bold text-yellow-500 font-mono mb-2 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]">OUT OF TIME</h2>
                <div className="text-3xl font-bold mt-4 mb-4 text-gray-500">
                  +0 POINTS
                </div>
                <p className="text-xl text-gray-300">You didn't answer in time!</p>
              </>
            )}
            
            <div className="mt-12 glass px-8 py-4 rounded-2xl flex flex-col items-center relative overflow-hidden">
               <span className="text-indigo-300 font-mono block mb-1 uppercase tracking-widest text-sm relative z-10">CURRENT RANK</span>
               <div className="relative z-10 font-bold">
                 <span className="text-5xl font-black text-white">{rank}</span> 
                 <span className="text-xl text-gray-400 ml-1">of {players.length}</span>
               </div>
            </div>
          </motion.div>
        )}

        {gameState === 'FINAL_LEADERBOARD' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center text-center"
          >
             <Trophy className={`w-32 h-32 mb-6 mx-auto ${rank === 1 ? 'text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]' : 'text-gray-500'}`} />
             <h2 className="text-5xl font-black font-mono mb-2 flex flex-col gap-2">
               <span className="text-xl text-gray-400 tracking-widest font-normal">FINAL RANKING</span>
               {rank === 1 ? '1ST PLACE!' : `YOU PLACED ${rank}`}
             </h2>
             
             <div className="mt-8 glass p-6 rounded-2xl inline-block min-w-[200px]">
               <span className="text-sm text-gray-400 font-mono block mb-2 uppercase tracking-widest">Final Score</span>
               <span className="text-5xl font-black text-neon-blue">{myScore}</span>
             </div>

             <button 
                onClick={() => window.location.href = '/'}
                className="mt-12 px-8 py-4 glass rounded-xl font-bold text-gray-400 hover:bg-white/10 transition-colors uppercase tracking-widest text-sm"
              >
                Leave Game
              </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
