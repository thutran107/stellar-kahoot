import { useEffect, useRef } from 'react';
import { useGameStore, GameState } from '../store';
import { fadeIn, crossfade, play, stopAll } from '../lib/audioManager';

export function useAudioManager() {
  const gameState = useGameStore(s => s.gameState);
  const questionStartTime = useGameStore(s => s.questionStartTime);
  const question = useGameStore(s => s.question);

  const prevStateRef = useRef<GameState>('LOBBY');
  const urgentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = gameState;

    if (gameState === 'LOBBY') {
      stopAll();
      fadeIn('lobby');
      return;
    }

    if (gameState === 'TOPIC_REVEAL') {
      crossfade('lobby', 'ambient');
      return;
    }

    if (gameState === 'QUESTION_ACTIVE') {
      if (urgentTimerRef.current) {
        clearTimeout(urgentTimerRef.current);
        urgentTimerRef.current = null;
      }
      if (correctTimerRef.current) {
        clearTimeout(correctTimerRef.current);
        correctTimerRef.current = null;
      }
      if (prev === 'TOPIC_REVEAL') {
        crossfade('ambient', 'countdown');
      } else {
        stopAll();
        fadeIn('countdown');
      }

      if (question?.timeLimit && questionStartTime) {
        const delay = questionStartTime + question.timeLimit - 5000 - Date.now();
        if (delay > 0) {
          urgentTimerRef.current = setTimeout(() => {
            crossfade('countdown', 'urgent');
          }, delay);
        }
      }
      return;
    }

    if (prev === 'QUESTION_ACTIVE' && gameState === 'QUESTION_RESULTS') {
      if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current);
      stopAll();
      play('timesup');
      correctTimerRef.current = setTimeout(() => play('correct'), 1000);
      return;
    }

    if (gameState === 'FINAL_LEADERBOARD') {
      stopAll();
      play('fanfare', () => fadeIn('podium'));
      return;
    }
  }, [gameState, questionStartTime, question?.timeLimit]);

  useEffect(() => {
    return () => {
      if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current);
      if (correctTimerRef.current) clearTimeout(correctTimerRef.current);
    };
  }, []);
}
