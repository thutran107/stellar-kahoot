import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export type GameState = 'LOBBY' | 'QUESTION_ACTIVE' | 'QUESTION_RESULTS' | 'FINAL_LEADERBOARD';

export interface Player {
  id: string;
  name: string;
  score: number;
  hasAnswered: boolean;
  lastAnswerTime: number;
  color: string;
  avatar: string;
  lastPointsEarned: number;
}

export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  pointMultiplier?: number;
}

interface GameStore {
  socket: Socket | null;
  connect: () => void;
  // State
  gamePin: string | null;
  gameState: GameState;
  players: Player[];
  currentQuestionIndex: number;
  question: Question | null;
  totalQuestions: number;
  questionStartTime: number;
  playerName: string;
  isHost: boolean;
  answerFeedback: boolean | null;
  error: string | null;
  answerCounts: number[];

  // Actions
  hostGame: (questions: Question[], quizId?: string) => void;
  joinGame: (pin: string, name: string, avatar: string) => void;
  startGame: () => void;
  submitAnswer: (index: number) => void;
  showResults: () => void;
  nextQuestion: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  socket: null,
  gamePin: null,
  gameState: 'LOBBY',
  players: [],
  currentQuestionIndex: 0,
  question: null,
  totalQuestions: 0,
  questionStartTime: 0,
  playerName: '',
  isHost: false,
  answerFeedback: null,
  error: null,
  answerCounts: [],

  connect: () => {
    if (get().socket) return;
    
    // In preview environment we just connect to the origin
    const socketUrl = window.location.origin;
    const socket = io(socketUrl);

    socket.on('connect', () => {
      console.log('Connected to socket', socket.id);
    });

    socket.on('game-state-update', (data) => {
      set({
        gamePin: data.gamePin,
        gameState: data.gameState,
        players: data.players,
        currentQuestionIndex: data.currentQuestionIndex,
        question: data.question,
        totalQuestions: data.totalQuestions,
        questionStartTime: data.questionStartTime,
        answerCounts: data.answerCounts ?? [],
        ...(data.gameState === 'QUESTION_ACTIVE' && get().gameState !== 'QUESTION_ACTIVE' ? { answerFeedback: null } : {})
      });
    });

    socket.on('host-joined', (data) => {
      set({ isHost: true, gamePin: data.gamePin, error: null });
    });

    socket.on('join-success', (data) => {
      set({ isHost: false, gamePin: data.gamePin, playerName: data.name, error: null });
    });

    socket.on('join-error', (msg) => {
      set({ error: msg });
    });

    socket.on('answer-feedback', (data) => {
      set({ answerFeedback: data.isCorrect });
    });

    socket.on('game-ended', (msg) => {
      set({ error: msg, gamePin: null, gameState: 'LOBBY', isHost: false });
    });

    set({ socket });
  },

  hostGame: (questions: Question[], quizId?: string) => {
    get().socket?.emit('host-game', { customQuestions: questions, quizId });
  },

  joinGame: (pin: string, name: string, avatar: string) => {
    get().socket?.emit('join-game', { pin, name, avatar });
  },

  startGame: () => {
    get().socket?.emit('start-game');
  },

  showResults: () => {
    get().socket?.emit('show-results');
  },

  submitAnswer: (index: number) => {
    get().socket?.emit('submit-answer', { answerIndex: index });
  },

  nextQuestion: () => {
    get().socket?.emit('next-question');
  }
}));
