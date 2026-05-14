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

interface Player {
  id: string;
  name: string;
  score: number;
  hasAnswered: boolean;
  lastAnswerTime: number;
  color: string;
  avatar: string;
  lastPointsEarned: number;
}

interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  pointMultiplier?: number;
  imageUrl?: string;
}

interface GameSession {
  pin: string;
  hostSocketId: string;
  state: "LOBBY" | "QUESTION_ACTIVE" | "QUESTION_RESULTS" | "FINAL_LEADERBOARD";
  players: Record<string, Player>;
  questions: Question[];
  currentQuestionIndex: number;
  questionStartTime: number;
  questionTimer: ReturnType<typeof setTimeout> | null;
  answerCounts: number[];
  correctAnswerCount: number;
  dbSessionId: string | null;
  dbParticipantIds: Record<string, string>;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? "*",
      methods: ["GET", "POST"],
    },
  });

  const sessions = new Map<string, GameSession>();

  const COSMIC_COLORS = [
    "#f472b6", "#22d3ee", "#4f46e5", "#34d399",
    "#fbbf24", "#e879f9", "#fb7185", "#818cf8",
  ];
  const COSMIC_AVATARS = ["🪐", "🌍", "🌎", "🌏", "🌕", "🌑", "☄️", "💫", "🌟", "🌌"];

  function generatePin(): string {
    let pin: string;
    do {
      pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (sessions.has(pin));
    return pin;
  }

  function broadcastState(session: GameSession) {
    const playersList = Object.values(session.players).sort((a, b) => b.score - a.score);
    io.to(session.pin).emit("game-state-update", {
      gamePin: session.pin,
      gameState: session.state,
      players: playersList,
      currentQuestionIndex: session.currentQuestionIndex,
      question: session.questions[session.currentQuestionIndex],
      totalQuestions: session.questions.length,
      questionStartTime: session.questionStartTime,
      answerCounts: session.answerCounts,
    });
  }

  function triggerShowResults(session: GameSession) {
    if (session.state !== "QUESTION_ACTIVE") return;
    if (session.questionTimer) { clearTimeout(session.questionTimer); session.questionTimer = null; }

    Object.keys(session.players).forEach((pId) => {
      if (!session.players[pId].hasAnswered) session.players[pId].lastPointsEarned = 0;
    });

    session.state = "QUESTION_RESULTS";
    broadcastState(session);

    if (session.dbSessionId) {
      (async () => {
        const { error } = await supabaseAdmin
          .from("game_sessions")
          .update({ state: "question_reveal" })
          .eq("id", session.dbSessionId!);
        if (error) console.error("show-results update:", error);
      })();
    }
  }

  function sessionForSocket(socket: { id: string; rooms: Set<string> }): GameSession | undefined {
    const pin = [...socket.rooms].find((r) => r !== socket.id && sessions.has(r));
    return pin ? sessions.get(pin) : undefined;
  }

  io.on("connection", (socket) => {
    console.log("Client connected", socket.id);

    socket.on("host-game", ({ customQuestions, quizId }) => {
      // Clean up any prior session this host had open
      for (const [pin, s] of sessions.entries()) {
        if (s.hostSocketId === socket.id) {
          if (s.questionTimer) clearTimeout(s.questionTimer);
          sessions.delete(pin);
        }
      }

      const pin = generatePin();
      const session: GameSession = {
        pin,
        hostSocketId: socket.id,
        state: "LOBBY",
        players: {},
        questions: customQuestions || [],
        currentQuestionIndex: 0,
        questionStartTime: 0,
        questionTimer: null,
        answerCounts: [],
        correctAnswerCount: 0,
        dbSessionId: null,
        dbParticipantIds: {},
      };
      sessions.set(pin, session);
      socket.join(pin);
      broadcastState(session);
      socket.emit("host-joined", { gamePin: pin });

      if (quizId) {
        (async () => {
          const { data, error } = await supabaseAdmin
            .from("game_sessions")
            .insert({ quiz_id: quizId, pin, state: "lobby", current_question_index: 0 })
            .select("id")
            .single();
          if (error) { console.error("game_sessions insert:", error); return; }
          if (data) session.dbSessionId = data.id;
        })();
      }
    });

    socket.on("start-game", () => {
      const session = sessionForSocket(socket);
      if (!session || session.hostSocketId !== socket.id || session.questions.length === 0) return;

      session.state = "QUESTION_ACTIVE";
      session.questionStartTime = Date.now();
      Object.keys(session.players).forEach((pId) => {
        session.players[pId].hasAnswered = false;
        session.players[pId].lastAnswerTime = 0;
        session.players[pId].lastPointsEarned = 0;
      });
      session.answerCounts = new Array(session.questions[session.currentQuestionIndex].options.length).fill(0);
      session.correctAnswerCount = 0;
      broadcastState(session);

      if (session.questionTimer) clearTimeout(session.questionTimer);
      session.questionTimer = setTimeout(
        () => triggerShowResults(session),
        session.questions[session.currentQuestionIndex].timeLimit ?? 20_000
      );

      if (session.dbSessionId) {
        (async () => {
          const { error } = await supabaseAdmin
            .from("game_sessions")
            .update({ state: "question_active", started_at: new Date().toISOString() })
            .eq("id", session.dbSessionId!);
          if (error) console.error("start-game update:", error);
        })();
      }
    });

    socket.on("show-results", () => {
      const session = sessionForSocket(socket);
      if (!session || session.hostSocketId !== socket.id) return;
      triggerShowResults(session);
    });

    socket.on("next-question", () => {
      const session = sessionForSocket(socket);
      if (!session || session.hostSocketId !== socket.id) return;

      if (session.currentQuestionIndex < session.questions.length - 1) {
        session.currentQuestionIndex++;
        session.state = "QUESTION_ACTIVE";
        session.questionStartTime = Date.now();
        Object.keys(session.players).forEach((pId) => {
          session.players[pId].hasAnswered = false;
          session.players[pId].lastAnswerTime = 0;
          session.players[pId].lastPointsEarned = 0;
        });
        session.answerCounts = new Array(session.questions[session.currentQuestionIndex].options.length).fill(0);
        session.correctAnswerCount = 0;
        broadcastState(session);

        if (session.questionTimer) clearTimeout(session.questionTimer);
        session.questionTimer = setTimeout(
          () => triggerShowResults(session),
          session.questions[session.currentQuestionIndex].timeLimit ?? 20_000
        );

        if (session.dbSessionId) {
          (async () => {
            const { error } = await supabaseAdmin
              .from("game_sessions")
              .update({ state: "question_active", current_question_index: session.currentQuestionIndex })
              .eq("id", session.dbSessionId!);
            if (error) console.error("next-question update:", error);
          })();
        }
      } else {
        if (session.questionTimer) { clearTimeout(session.questionTimer); session.questionTimer = null; }
        session.state = "FINAL_LEADERBOARD";
        broadcastState(session);

        // Delete session after 5-minute grace period
        setTimeout(() => sessions.delete(session.pin), 5 * 60 * 1000);

        if (session.dbSessionId) {
          (async () => {
            const { error } = await supabaseAdmin
              .from("game_sessions")
              .update({ state: "ended", ended_at: new Date().toISOString() })
              .eq("id", session.dbSessionId!);
            if (error) console.error("game-end session update:", error);

            await Promise.all(
              Object.entries(session.dbParticipantIds).map(async ([socketId, participantId]) => {
                const player = session.players[socketId];
                if (!player) return;
                const { error: pErr } = await supabaseAdmin
                  .from("participants")
                  .update({ total_score: player.score, avg_response_ms: player.lastAnswerTime || null })
                  .eq("id", participantId);
                if (pErr) console.error("participant score update:", pErr);
              })
            );
          })();
        }
      }
    });

    socket.on("join-game", ({ pin, name, avatar }) => {
      const session = sessions.get(pin);
      if (!session || session.state !== "LOBBY") {
        socket.emit("join-error", "Invalid PIN or game already started.");
        return;
      }

      const randomColor = COSMIC_COLORS[Math.floor(Math.random() * COSMIC_COLORS.length)];
      const finalAvatar = avatar || COSMIC_AVATARS[Math.floor(Math.random() * COSMIC_AVATARS.length)];

      session.players[socket.id] = {
        id: socket.id,
        name,
        score: 0,
        hasAnswered: false,
        lastAnswerTime: 0,
        color: randomColor,
        avatar: finalAvatar,
        lastPointsEarned: 0,
      };

      socket.join(pin);
      socket.emit("join-success", { gamePin: pin, name });
      broadcastState(session);

      if (session.dbSessionId) {
        (async () => {
          const { data, error } = await supabaseAdmin
            .from("participants")
            .insert({
              session_id: session.dbSessionId!,
              display_name: name,
              avatar_color: randomColor,
              avatar_emoji: finalAvatar,
            })
            .select("id")
            .single();
          if (error) { console.error("participants insert:", error); return; }
          if (data) session.dbParticipantIds[socket.id] = data.id;
        })();
      }
    });

    socket.on("submit-answer", ({ answerIndex }) => {
      const session = sessionForSocket(socket);
      if (!session || session.state !== "QUESTION_ACTIVE") return;

      const player = session.players[socket.id];
      if (!player || player.hasAnswered) return;

      const currentQuestion = session.questions[session.currentQuestionIndex];
      const isCorrect = answerIndex === currentQuestion.correctIndex;
      const timeTaken = Date.now() - session.questionStartTime;

      if (isCorrect) {
        const points = session.correctAnswerCount === 0 ? 1000 : session.correctAnswerCount === 1 ? 800 : 500;
        session.correctAnswerCount++;
        player.score += points;
        player.lastPointsEarned = points;
      } else {
        player.lastPointsEarned = 0;
      }

      player.hasAnswered = true;
      if (answerIndex >= 0 && answerIndex < session.answerCounts.length) {
        session.answerCounts[answerIndex]++;
      }
      player.lastAnswerTime = timeTaken;

      socket.emit("answer-feedback", { isCorrect });
      broadcastState(session);

      const participantId = session.dbParticipantIds[socket.id];
      const questionId = currentQuestion.id;
      if (session.dbSessionId && participantId && questionId) {
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
      // Host disconnecting — end the session
      for (const [pin, session] of sessions.entries()) {
        if (session.hostSocketId === socket.id) {
          io.to(pin).emit("game-ended", "Host disconnected.");
          if (session.questionTimer) clearTimeout(session.questionTimer);
          if (session.dbSessionId) {
            (async () => {
              const { error } = await supabaseAdmin
                .from("game_sessions")
                .update({ state: "ended", ended_at: new Date().toISOString() })
                .eq("id", session.dbSessionId!);
              if (error) console.error("host-disconnect session update:", error);
            })();
          }
          sessions.delete(pin);
          return;
        }
      }

      // Player disconnecting — remove from their session
      const session = sessionForSocket(socket);
      if (session?.players[socket.id]) {
        delete session.players[socket.id];
        broadcastState(session);
      }
    });
  });

  // API routes
  app.use(express.json());
  app.use("/api/quizzes", quizRouter);
  app.use("/api/games", gamesRouter);
  app.use("/api/upload", uploadRouter);

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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
