import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Play, SkipForward, Trophy, Rocket, AlertTriangle } from 'lucide-react';
import { useGameStore, Question } from '../store';

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

const DEFAULT_QUESTIONS: Question[] = [
  {
    text: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctIndex: 1,
    timeLimit: 15000
  },
  {
    text: "What is the largest galaxy in the Local Group?",
    options: ["Andromeda", "Milky Way", "Triangulum", "Messier 81"],
    correctIndex: 0,
    timeLimit: 15000
  },
  {
    text: "Who was the first person to walk on the moon?",
    options: ["Yuri Gagarin", "Buzz Aldrin", "Neil Armstrong", "Michael Collins"],
    correctIndex: 2,
    timeLimit: 15000
  }
];

export function HostView() {
  const { 
    gamePin, gameState, players, question, currentQuestionIndex, 
    totalQuestions, hostGame, startGame, showResults, nextQuestion, questionStartTime
  } = useGameStore();

  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const [isEditing, setIsEditing] = useState(true); // Always start in editing mode

  const handleHost = () => {
    hostGame(questions);
    setIsEditing(false);
  };

  if (!gamePin && isEditing) {
    return (
      <div className="min-h-screen p-8 max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold mb-8 text-neon-blue font-mono">Mission Control</h2>
        <div className="space-y-6 mb-8">
          {questions.map((q, i) => (
            <div key={i} className="p-6 glass rounded-xl">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="bg-neon-purple text-white px-3 py-1 rounded text-sm">Q{i + 1}</span> 
                {q.text}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {q.options.map((opt, optIndex) => (
                  <div 
                    key={optIndex} 
                    className={`p-3 rounded border ${optIndex === q.correctIndex ? 'border-neon-green bg-neon-green/10 text-neon-green' : 'border-gray-600/50 text-gray-400'}`}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button 
          onClick={handleHost}
          className="w-full py-4 text-white rounded-xl text-xl font-bold btn-funky flex items-center justify-center gap-2"
        >
          <Rocket className="w-6 h-6" /> Initialize Launch Sequence
        </button>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/join?pin=${gamePin}`;

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 relative">
      {gameState === 'QUESTION_ACTIVE' && question && (
        <TimerBar startTime={questionStartTime} timeLimit={question.timeLimit} />
      )}
      
      {gameState === 'LOBBY' && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
          <h2 className="text-5xl font-bold text-center mb-12 text-neon-blue font-mono tracking-widest">JOIN THE CREW</h2>
          
          <div className="flex flex-col md:flex-row items-center gap-16 w-full justify-center glass p-12 rounded-3xl mb-12 border-dashed border-2 border-indigo-400/30">
            <div className="flex items-center flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl">
                <QRCodeSVG value={joinUrl} size={250} level="H" />
              </div>
              <p className="text-gray-400 font-mono text-sm uppercase">Scan to join</p>
            </div>
            
            <div className="flex flex-col items-center glass px-12 py-8 rounded-[2rem]">
              <p className="text-2xl text-gray-400 font-mono mb-2 uppercase tracking-widest text-indigo-300">Game PIN</p>
              <div className="text-8xl font-black text-white tracking-widest">
                {gamePin}
              </div>
            </div>
          </div>

          <div className="mt-8 w-full">
            <div className="flex items-center justify-between mb-6 pb-4">
              <h3 className="text-3xl font-bold flex items-center gap-3">
                <Users className="text-neon-pink" /> 
                Crew Members <span className="text-neon-pink">({players.length})</span>
              </h3>
              
              <button 
                onClick={startGame}
                disabled={players.length === 0}
                className="py-3 px-8 text-white font-bold rounded-xl text-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-funky"
              >
                <Play className="w-5 h-5" /> Launch Mission
              </button>
            </div>
            
            <div className="flex flex-wrap gap-4">
              <AnimatePresence>
                {players.map((p) => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    key={p.id}
                    className="flex items-center gap-2 px-4 py-2 glass rounded-full font-mono text-lg border border-white/10 pr-6"
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-white/20 shadow-inner text-xl"
                      style={{ backgroundColor: p.color, boxShadow: `0 0 10px ${p.color}50` }}
                    >
                      {p.avatar}
                    </div>
                    {p.name}
                  </motion.div>
                ))}
              </AnimatePresence>
              {players.length === 0 && (
                <div className="text-gray-500 font-mono italic w-full text-center py-8">Waiting for crew to board...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {gameState === 'QUESTION_ACTIVE' && question && (
        <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full pt-12">
          <div className="flex justify-between items-center mb-12">
            <div className="text-2xl font-mono text-gray-400">
              Question {currentQuestionIndex + 1} <span className="text-gray-600">/ {totalQuestions}</span>
            </div>
            <div className="text-2xl font-mono flex items-center gap-2 text-neon-blue bg-neon-blue/10 px-4 py-2 rounded-lg border border-neon-blue/30">
              <Users className="w-5 h-5" />
              {players.filter(p => p.hasAnswered).length} / {players.length} Answers
            </div>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-light italic text-center mb-16 leading-tight">
            {question.text}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-auto mb-12">
            {question.options.map((opt, i) => (
              <div key={i} className={`glass p-8 rounded-[2rem] text-2xl text-center font-bold relative overflow-hidden focus:outline-none transition-transform hover:scale-[1.02] 
                ${i === 0 ? 'border-l-4 border-l-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''}
                ${i === 1 ? 'border-l-4 border-l-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}
                ${i === 2 ? 'border-l-4 border-l-yellow-500 hover:shadow-[0_0_15px_rgba(234,179,8,0.2)]' : ''}
                ${i === 3 ? 'border-l-4 border-l-green-500 hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]' : ''}
              `}>
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-xl rounded-lg w-10 h-10 flex items-center justify-center
                   ${i === 0 ? 'bg-red-500 text-white' : ''}
                   ${i === 1 ? 'bg-blue-500 text-white' : ''}
                   ${i === 2 ? 'bg-yellow-500 text-white' : ''}
                   ${i === 3 ? 'bg-green-500 text-white' : ''}
                `}>
                  {i + 1}
                </div>
                {opt}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-4 p-4 glass fixed bottom-8 right-8 z-10 rounded-3xl">
             <button 
              onClick={showResults}
              className="py-4 px-8 text-white font-black rounded-[2rem] text-lg flex items-center gap-2 uppercase tracking-tighter btn-funky"
            >
              <SkipForward className="w-5 h-5" /> End Question & Show Results
            </button>
          </div>
        </div>
      )}

      {gameState === 'QUESTION_RESULTS' && question && (
        <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full pt-12">
          <h2 className="text-4xl text-center mb-8 font-mono tracking-widest text-gray-400">MISSION UPDATE</h2>
          
          <div className="glass p-8 rounded-3xl mb-12">
             <h3 className="text-3xl font-bold mb-8 text-center">{question.text}</h3>
             <div className="grid grid-cols-1 gap-4 max-w-3xl mx-auto">
               {question.options.map((opt, i) => {
                 const isCorrect = i === question.correctIndex;

                 return (
                  <div key={i} className={`p-6 rounded-2xl flex items-center justify-between text-xl font-bold ${isCorrect ? 'bg-neon-green/20 border-2 border-neon-green text-neon-green shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'bg-red-500/20 border border-red-500/50 text-red-500 opacity-60 mix-blend-screen'}`}>
                    <span>{opt}</span>
                    {isCorrect && <span className="bg-neon-green text-black px-3 py-1 rounded text-sm ml-4 shadow-[0_0_15px_rgba(52,211,153,0.6)]">CORRECT ORBIT</span>}
                  </div>
                 );
               })}
             </div>
          </div>

          <div className="flex justify-end gap-4 p-4 glass fixed bottom-8 right-8 z-10 rounded-3xl">
             <button 
              onClick={nextQuestion}
              className="py-4 px-8 text-white font-black rounded-[2rem] text-lg flex items-center gap-2 uppercase tracking-tighter btn-funky"
            >
              <Play className="w-5 h-5" /> Next Phase
            </button>
          </div>
        </div>
      )}

      {gameState === 'FINAL_LEADERBOARD' && (
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full pt-12">
          <TerminalHeader text="MISSION OVER" />
          
          <div className="mt-12 flex items-end justify-center gap-4 h-64 mb-16">
            {players.length >= 2 && (
              <LeaderboardPodium player={players[1]} rank={2} height={160} color="border-gray-400" bgColor="bg-gray-400/20" />
            )}
            {players.length >= 1 && (
              <LeaderboardPodium player={players[0]} rank={1} height={220} color="border-yellow-400" bgColor="bg-yellow-400/20" />
            )}
            {players.length >= 3 && (
              <LeaderboardPodium player={players[2]} rank={3} height={120} color="border-orange-600" bgColor="bg-orange-600/20" />
            )}
          </div>

          <div className="space-y-4">
            {players.slice(3).map((p, i) => (
              <div key={p.id} className="glass p-4 rounded-xl flex items-center justify-between transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <span className="text-gray-500 font-mono w-8 text-right font-bold">{i + 4}</span>
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-white/20 text-xl"
                    style={{ backgroundColor: p.color, boxShadow: `0 0 10px ${p.color}50` }}
                  >
                    {p.avatar}
                  </div>
                  <span className="text-xl font-bold">{p.name}</span>
                </div>
                <span className="font-mono text-neon-blue font-bold">{p.score} pts</span>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <button 
              onClick={() => window.location.href = '/'}
              className="px-8 py-4 glass rounded-xl font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-sm text-gray-300"
            >
              Return to Base
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function TerminalHeader({ text }: { text: string }) {
  return (
    <div className="text-center">
      <Trophy className="w-20 h-20 mx-auto text-pink-400 mb-6 drop-shadow-[0_0_15px_rgba(244,114,182,0.5)]" />
      <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 tracking-widest font-mono">
        {text}
      </h2>
    </div>
  );
}

function LeaderboardPodium({ player, rank, height, color, bgColor }: { player: any, rank: number, height: number, color: string, bgColor: string }) {
  return (
    <motion.div 
      initial={{ height: 0, opacity: 0 }}
      animate={{ height, opacity: 1 }}
      transition={{ duration: 1, delay: rank * 0.2 }}
      className={`w-32 flex flex-col items-center justify-end glass ${bgColor} border-t border-l border-r ${color} rounded-t-lg relative pb-4 backdrop-blur-md`}
    >
      <div className="absolute -top-16 flex flex-col items-center w-full">
        <div 
          className="w-12 h-12 rounded-full mb-1 flex items-center justify-center shrink-0 border border-white/20 z-10 text-2xl"
          style={{ backgroundColor: player.color, boxShadow: `0 0 15px ${player.color}80` }}
        >
          {player.avatar}
        </div>
        <span className="text-xl font-bold text-white truncate w-full text-center px-2 drop-shadow-md z-10">{player.name}</span>
        <span className="font-mono text-sm mt-1 bg-black/50 px-2 py-0.5 rounded text-gray-300 z-10">{player.score}</span>
      </div>
      <span className="text-4xl font-black opacity-30">{rank}</span>
    </motion.div>
  );
}
