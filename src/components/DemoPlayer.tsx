import { useEffect, useState } from 'react';
import { PlayerView } from './PlayerView';
import { useGameStore } from '../store';

export function DemoPlayer() {
  const [phase, setPhase] = useState('LOGIN_SCREEN');

  useEffect(() => {
    // We create a sequence of timeouts to rotate through the different states of the Player View.
    const mockPlayer = { id: 'test-1', name: 'COSMO', score: 1450, hasAnswered: false, lastAnswerTime: 0, color: '#f472b6', avatar: '🪐', lastPointsEarned: 0, scoreHistory: [] };
    const otherPlayers = [
        { id: 'test-4', name: 'NOVA', score: 1800, hasAnswered: true, lastAnswerTime: 0, color: '#fbbf24', avatar: '🌟', lastPointsEarned: 0, scoreHistory: [] },
        { id: 'test-2', name: 'RIVAL', score: 1200, hasAnswered: true, lastAnswerTime: 0, color: '#22d3ee', avatar: '☄️', lastPointsEarned: 0, scoreHistory: [] },
        { id: 'test-5', name: 'ASTRO', score: 850, hasAnswered: true, lastAnswerTime: 0, color: '#fb7185', avatar: '🌑', lastPointsEarned: 0, scoreHistory: [] },
        { id: 'test-3', name: 'ROOKIE', score: 400, hasAnswered: true, lastAnswerTime: 0, color: '#34d399', avatar: '🌍', lastPointsEarned: 0, scoreHistory: [] }
    ];

    let timer: NodeJS.Timeout;

    const runDemo = () => {
      // 1. Join Form / Login Screen
      setPhase('JOINING_GAME');
      useGameStore.setState({ gamePin: null, playerName: '' });
      
      timer = setTimeout(() => {
        // 2. Waiting Room in Lobby
        setPhase('IN_LOBBY');
        useGameStore.setState({
          gamePin: '8888',
          playerName: 'COSMO',
          gameState: 'LOBBY',
          players: [mockPlayer, ...otherPlayers]
        });
        
        timer = setTimeout(() => {
          // 3. Question Active (Question countdown)
          setPhase('QUESTION_ACTIVE');
          useGameStore.setState({
            gameState: 'QUESTION_ACTIVE',
            questionStartTime: Date.now(),
            question: { text: "What is the hottest planet in our solar system?", options: ["Mercury", "Venus", "Mars", "Jupiter"], correctIndex: 1, timeLimit: 10000 },
            answerFeedback: null
          });
          
          timer = setTimeout(() => {
            // 4. Results Screen (Correct Answer!)
            setPhase('ANSWER_RESULTS');
            useGameStore.setState({
              gameState: 'QUESTION_RESULTS',
              answerFeedback: true,
              players: [{ ...mockPlayer, score: 2450, lastPointsEarned: 1000 }, ...otherPlayers]
            });
            
            timer = setTimeout(() => {
              // 5. Final Leaderboard display
              setPhase('FINAL_PODIUM');
              useGameStore.setState({
                gameState: 'FINAL_LEADERBOARD',
              });
              
              // Loop the demo infinitely
              timer = setTimeout(runDemo, 5000);
            }, 5000);
          }, 3500); // Shorter duration for the active question for demo speed
        }, 3000);
      }, 3000);
    };

    runDemo();

    return () => {
      clearTimeout(timer);
      useGameStore.setState({ gamePin: null, gameState: 'LOBBY', players: [] });
    };
  }, []);

  return (
    <div className="relative">
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 glass text-white px-6 py-3 rounded-full border border-neon-pink font-mono text-sm flex items-center gap-3 backdrop-blur-xl shadow-[0_0_20px_rgba(244,114,182,0.3)]">
        <span className="w-3 h-3 rounded-full bg-neon-pink animate-pulse"></span>
        <span className="opacity-70">AUTO-DEMO:</span>
        <span className="font-bold tracking-widest">{phase}</span>
      </div>
      
      {/* We use pointer-events-none so the user can just watch it cycle on its own */}
      <div className="pointer-events-none">
        <PlayerView />
      </div>
    </div>
  );
}
