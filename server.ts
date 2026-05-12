import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { quizRouter } from "./server/routes/quiz.js";
import { gamesRouter } from "./server/routes/games.js";
import { uploadRouter } from "./server/routes/upload.js";
import { supabaseAdmin } from "./server/lib/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? "*",
      methods: ["GET", "POST"]
    }
  });

  // Game State variables
  let gameHostSocketId: string | null = null;
  let gamePin: string | null = null;
  let gameState: "LOBBY" | "QUESTION_ACTIVE" | "QUESTION_RESULTS" | "FINAL_LEADERBOARD" = "LOBBY";
  let players: Record<string, { id: string, name: string, score: number, hasAnswered: boolean, lastAnswerTime: number, color: string, avatar: string, lastPointsEarned: number }> = {};
  let currentQuestionIndex = 0;
  let questions: any[] = [];
  let questionStartTime = 0;

  // DB logging state
  let dbSessionId: string | null = null;
  let dbParticipantIds: Record<string, string> = {}; // socketId → participants.id
  let questionTimer: ReturnType<typeof setTimeout> | null = null;
  let answerCounts: number[] = [];
  let correctAnswerCount = 0;

  const COSMIC_COLORS = [
    '#f472b6', // pink
    '#22d3ee', // cyan
    '#4f46e5', // indigo
    '#34d399', // green
    '#fbbf24', // amber
    '#e879f9', // fuchsia
    '#fb7185', // rose
    '#818cf8', // violet
  ];

  const COSMIC_AVATARS = ['🪐', '🌍', '🌎', '🌏', '🌕', '🌑', '☄️', '💫', '🌟', '🌌'];

  function generatePin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  function triggerShowResults() {
    if (gameState !== 'QUESTION_ACTIVE') return;
    if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }

    Object.keys(players).forEach(pId => {
      if (!players[pId].hasAnswered) players[pId].lastPointsEarned = 0;
    });

    gameState = 'QUESTION_RESULTS';
    broadcastState();

    if (dbSessionId) {
      (async () => {
        const { error } = await supabaseAdmin.from('game_sessions')
          .update({ state: 'question_reveal' }).eq('id', dbSessionId!);
        if (error) console.error('show-results update:', error);
      })();
    }
  }

  function broadcastState() {
    const playersList = Object.values(players).sort((a, b) => b.score - a.score);
    io.emit("game-state-update", {
      gamePin,
      gameState,
      players: playersList,
      currentQuestionIndex,
      question: questions[currentQuestionIndex],
      totalQuestions: questions.length,
      questionStartTime,
      answerCounts,
    });
  }

  io.on("connection", (socket) => {
    console.log("Client connected", socket.id);

    // Host actions
    socket.on("host-game", ({ customQuestions, quizId }) => {
      if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
      gameHostSocketId = socket.id;
      gamePin = generatePin();
      gameState = "LOBBY";
      players = {};
      currentQuestionIndex = 0;
      questions = customQuestions || [];
      questionStartTime = 0;
      dbSessionId = null;
      dbParticipantIds = {};
      answerCounts = [];
      correctAnswerCount = 0;
      broadcastState();
      socket.emit("host-joined", { gamePin });

      if (quizId) {
        (async () => {
          const { data, error } = await supabaseAdmin.from("game_sessions").insert({
            quiz_id: quizId,
            pin: gamePin,
            state: "lobby",
            current_question_index: 0,
          }).select("id").single();
          if (error) { console.error("game_sessions insert:", error); return; }
          if (data) dbSessionId = data.id;
        })();
      }
    });

    socket.on("start-game", () => {
      if (socket.id !== gameHostSocketId) return;
      if (questions.length === 0) return;

      gameState = "QUESTION_ACTIVE";
      questionStartTime = Date.now();

      Object.keys(players).forEach(pId => {
        players[pId].hasAnswered = false;
        players[pId].lastAnswerTime = 0;
        players[pId].lastPointsEarned = 0;
      });

      answerCounts = new Array(questions[currentQuestionIndex].options.length).fill(0);
      correctAnswerCount = 0;

      broadcastState();

      if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
      questionTimer = setTimeout(triggerShowResults, questions[currentQuestionIndex].timeLimit ?? 20_000);

      if (dbSessionId) {
        (async () => {
          const { error } = await supabaseAdmin.from("game_sessions").update({
            state: "question_active",
            started_at: new Date().toISOString(),
          }).eq("id", dbSessionId!);
          if (error) console.error("start-game update:", error);
        })();
      }
    });

    socket.on("show-results", () => {
      if (socket.id !== gameHostSocketId) return;
      triggerShowResults();
    });

    socket.on("next-question", () => {
      if (socket.id !== gameHostSocketId) return;

      if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        gameState = "QUESTION_ACTIVE";
        questionStartTime = Date.now();

        Object.keys(players).forEach(pId => {
          players[pId].hasAnswered = false;
          players[pId].lastAnswerTime = 0;
          players[pId].lastPointsEarned = 0;
        });

        answerCounts = new Array(questions[currentQuestionIndex].options.length).fill(0);
        correctAnswerCount = 0;

        broadcastState();

        if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
        questionTimer = setTimeout(triggerShowResults, questions[currentQuestionIndex].timeLimit ?? 20_000);

        if (dbSessionId) {
          (async () => {
            const { error } = await supabaseAdmin.from("game_sessions").update({
              state: "question_active",
              current_question_index: currentQuestionIndex,
            }).eq("id", dbSessionId!);
            if (error) console.error("next-question update:", error);
          })();
        }
      } else {
        if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
        gameState = "FINAL_LEADERBOARD";
        broadcastState();

        if (dbSessionId) {
          (async () => {
            const { error } = await supabaseAdmin.from("game_sessions").update({
              state: "ended",
              ended_at: new Date().toISOString(),
            }).eq("id", dbSessionId!);
            if (error) console.error("game-end session update:", error);

            await Promise.all(
              Object.entries(dbParticipantIds).map(async ([socketId, participantId]) => {
                const player = players[socketId];
                if (!player) return;
                const { error: pErr } = await supabaseAdmin.from("participants").update({
                  total_score: player.score,
                  avg_response_ms: player.lastAnswerTime || null,
                }).eq("id", participantId);
                if (pErr) console.error("participant score update:", pErr);
              })
            );
          })();
        }
      }
    });

    // Player actions
    socket.on("join-game", ({ pin, name, avatar }) => {
      if (pin !== gamePin || gameState !== "LOBBY") {
        socket.emit("join-error", "Invalid PIN or game already started.");
        return;
      }
      
      const randomColor = COSMIC_COLORS[Math.floor(Math.random() * COSMIC_COLORS.length)];
      const randomAvatar = COSMIC_AVATARS[Math.floor(Math.random() * COSMIC_AVATARS.length)];
      const finalAvatar = avatar || randomAvatar;
      
      players[socket.id] = {
        id: socket.id,
        name,
        score: 0,
        hasAnswered: false,
        lastAnswerTime: 0,
        color: randomColor,
        avatar: finalAvatar,
        lastPointsEarned: 0
      };

      socket.emit("join-success", { gamePin, name });
      broadcastState();

      if (dbSessionId) {
        (async () => {
          const { data, error } = await supabaseAdmin.from("participants").insert({
            session_id: dbSessionId!,
            display_name: name,
            avatar_color: randomColor,
            avatar_emoji: finalAvatar,
          }).select("id").single();
          if (error) { console.error("participants insert:", error); return; }
          if (data) dbParticipantIds[socket.id] = data.id;
        })();
      }
    });

    socket.on("submit-answer", ({ answerIndex }) => {
      if (gameState !== "QUESTION_ACTIVE") return;
      
      const player = players[socket.id];
      if (!player || player.hasAnswered) return;
      
      const currentQuestion = questions[currentQuestionIndex];
      const isCorrect = answerIndex === currentQuestion.correctIndex;
      
      const timeTaken = Date.now() - questionStartTime;

      if (isCorrect) {
        const points = correctAnswerCount === 0 ? 1000 : correctAnswerCount === 1 ? 800 : 500;
        correctAnswerCount++;
        player.score += points;
        player.lastPointsEarned = points;
      } else {
        player.lastPointsEarned = 0;
      }
      
      player.hasAnswered = true;
      if (answerIndex >= 0 && answerIndex < answerCounts.length) {
        answerCounts[answerIndex]++;
      }
      player.lastAnswerTime = timeTaken;
      
      socket.emit("answer-feedback", { isCorrect });
      broadcastState();

      const participantId = dbParticipantIds[socket.id];
      const questionId = currentQuestion.id;
      if (dbSessionId && participantId && questionId) {
        (async () => {
          const { error } = await supabaseAdmin.from("answers").insert({
            participant_id: participantId,
            question_id: questionId,
            selected_index: answerIndex,
            is_correct: isCorrect,
            points_earned: player.lastPointsEarned,
            response_ms: timeTaken,
          });
          if (error) console.error("answers insert:", error);
        })();
      }
    });

    socket.on("disconnect", () => {
      if (socket.id === gameHostSocketId) {
        io.emit("game-ended", "Host disconnected.");
        if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
        if (dbSessionId) {
          (async () => {
            const { error } = await supabaseAdmin.from("game_sessions").update({
              state: "ended",
              ended_at: new Date().toISOString(),
            }).eq("id", dbSessionId!);
            if (error) console.error("host-disconnect session update:", error);
          })();
        }
        gameHostSocketId = null;
        gamePin = null;
        players = {};
        dbSessionId = null;
        dbParticipantIds = {};
      } else if (players[socket.id]) {
        delete players[socket.id];
        broadcastState();
      }
    });
  });

  // API routes FIRST
  app.use(express.json());
  app.use('/api/quizzes', quizRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/upload', uploadRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
