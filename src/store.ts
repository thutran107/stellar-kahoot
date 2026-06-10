import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export type GameState = 'LOBBY' | 'TOPIC_REVEAL' | 'QUESTION_ACTIVE' | 'QUESTION_RESULTS' | 'FINAL_LEADERBOARD';

// Persisted host identity so a host can reconnect (wifi blip or reload) and
// reclaim their live game instead of the room being killed. localStorage access
// is guarded because iOS private browsing throws on write.
const HOST_KEY = 'stellar-host';

interface HostSession {
  pin: string;
  hostId: string;
}

function readHostSession(): HostSession | null {
  try {
    const raw = localStorage.getItem(HOST_KEY);
    return raw ? (JSON.parse(raw) as HostSession) : null;
  } catch {
    return null;
  }
}

function writeHostSession(value: HostSession): void {
  try {
    localStorage.setItem(HOST_KEY, JSON.stringify(value));
  } catch {
    /* private mode / storage disabled — resume just won't be available */
  }
}

function clearHostSession(): void {
  try {
    localStorage.removeItem(HOST_KEY);
  } catch {
    /* ignore */
  }
}

// The pin we last tried to resume, so an error only clears that stale entry —
// never a fresh game's entry written in the meantime.
let attemptedResumePin: string | null = null;

export interface Player {
  id: string;
  name: string;
  score: number;
  hasAnswered: boolean;
  lastAnswerTime: number;
  color: string;
  avatar: string;
  lastPointsEarned: number;
  scoreHistory: number[];
}

export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  pointMultiplier?: number;
  imageUrl?: string;
  topic?: string | null;
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
  // True while a host-reconnect attempt is in flight, so HostView holds off
  // auto-hosting a fresh game until we know whether the old one was reclaimed.
  isResuming: boolean;

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
  isResuming: false,

  connect: () => {
    if (get().socket) return;
    
    // In preview environment we just connect to the origin
    const socketUrl = window.location.origin;
    const socket = io(socketUrl);

    socket.on('connect', () => {
      console.log('Connected to socket', socket.id);
      // If this client was hosting a game, try to reclaim it. Fires on the
      // initial connect and on every reconnect (covers wifi blips and reloads).
      const hostSession = readHostSession();
      if (hostSession?.pin && hostSession?.hostId) {
        attemptedResumePin = hostSession.pin;
        set({ isResuming: true });
        socket.emit('resume-host', { pin: hostSession.pin, hostId: hostSession.hostId });
      }
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
      set({ isHost: true, gamePin: data.gamePin, error: null, isResuming: false });
      // Persist the live pin alongside the host token so a later reconnect can resume.
      const hostSession = readHostSession();
      if (hostSession?.hostId) {
        writeHostSession({ pin: data.gamePin, hostId: hostSession.hostId });
      }
    });

    socket.on('resume-host-error', () => {
      set({ isResuming: false });
      // Only drop the stale entry we actually tried to resume, never a fresh one.
      const hostSession = readHostSession();
      if (hostSession && hostSession.pin === attemptedResumePin) clearHostSession();
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
      clearHostSession();
      set({ error: msg, gamePin: null, gameState: 'LOBBY', isHost: false, isResuming: false });
    });

    // Mark resuming synchronously (before the async 'connect' fires) when a host
    // session is already stored, so HostView never auto-hosts during a reload race.
    const initialHostSession = readHostSession();
    set({ socket, isResuming: !!(initialHostSession?.pin && initialHostSession?.hostId) });
  },

  hostGame: (questions: Question[], quizId?: string) => {
    // Mint a stable host token now so even a reconnect before host-joined can resume.
    const hostId =
      globalThis.crypto?.randomUUID?.() ?? `host-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    writeHostSession({ pin: '', hostId });
    get().socket?.emit('host-game', { customQuestions: questions, quizId, hostId });
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
