import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
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

  function broadcastState() {
    const playersList = Object.values(players).sort((a, b) => b.score - a.score);
    io.emit("game-state-update", {
      gamePin,
      gameState,
      players: playersList,
      currentQuestionIndex,
      question: questions[currentQuestionIndex],
      totalQuestions: questions.length,
      questionStartTime
    });
  }

  io.on("connection", (socket) => {
    console.log("Client connected", socket.id);

    // Host actions
    socket.on("host-game", ({ customQuestions }) => {
      gameHostSocketId = socket.id;
      gamePin = generatePin();
      gameState = "LOBBY";
      players = {};
      currentQuestionIndex = 0;
      questions = customQuestions || [];
      questionStartTime = 0;
      broadcastState();
      socket.emit("host-joined", { gamePin });
    });

    socket.on("start-game", () => {
      if (socket.id !== gameHostSocketId) return;
      if (questions.length === 0) return;
      
      gameState = "QUESTION_ACTIVE";
      questionStartTime = Date.now();
      
      // Reset answered status
      Object.keys(players).forEach(pId => {
        players[pId].hasAnswered = false;
        players[pId].lastAnswerTime = 0;
        players[pId].lastPointsEarned = 0;
      });
      
      broadcastState();
    });

    socket.on("show-results", () => {
      if (socket.id !== gameHostSocketId) return;
      
      // Anyone who didn't answer gets 0 points shown
      Object.keys(players).forEach(pId => {
        if (!players[pId].hasAnswered) {
          players[pId].lastPointsEarned = 0;
        }
      });
      
      gameState = "QUESTION_RESULTS";
      broadcastState();
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
        
        broadcastState();
      } else {
        gameState = "FINAL_LEADERBOARD";
        broadcastState();
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
    });

    socket.on("submit-answer", ({ answerIndex }) => {
      if (gameState !== "QUESTION_ACTIVE") return;
      
      const player = players[socket.id];
      if (!player || player.hasAnswered) return;
      
      const currentQuestion = questions[currentQuestionIndex];
      const isCorrect = answerIndex === currentQuestion.correctIndex;
      
      const timeTaken = Date.now() - questionStartTime;
      const maxTime = currentQuestion.timeLimit || 10000; // 10 seconds default
      
      if (isCorrect) {
        // Fast answer gives more points. Score range: 500 to 1000
        const timeRatio = Math.max(0, maxTime - timeTaken) / maxTime;
        const points = Math.round(500 + (500 * timeRatio));
        player.score += points;
        player.lastPointsEarned = points;
      } else {
        player.lastPointsEarned = 0;
      }
      
      player.hasAnswered = true;
      player.lastAnswerTime = timeTaken;
      
      socket.emit("answer-feedback", { isCorrect });
      
      // Update host with player answered status
      broadcastState();
    });

    socket.on("disconnect", () => {
      if (socket.id === gameHostSocketId) {
        // Host left, end game
        io.emit("game-ended", "Host disconnected.");
        gameHostSocketId = null;
        gamePin = null;
        players = {};
      } else if (players[socket.id]) {
        delete players[socket.id];
        broadcastState();
      }
    });
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
