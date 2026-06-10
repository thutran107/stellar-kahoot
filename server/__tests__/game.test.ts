import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'net';

// The game logic never calls Supabase unless a session has a dbSessionId
// (i.e. it was hosted with a quizId). These tests host without one, so the
// mock just keeps the module import from needing real credentials.
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { registerGameHandlers } from '../game.js';

function waitFor<T = any>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// Wait until a game-state-update arrives with the expected game state,
// skipping any intermediate broadcasts (e.g. per-answer updates).
async function waitForState(socket: ClientSocket, gameState: string): Promise<any> {
  for (let i = 0; i < 20; i++) {
    const update = await waitFor<any>(socket, 'game-state-update');
    if (update.gameState === gameState) return update;
  }
  throw new Error(`never reached game state "${gameState}"`);
}

// Short host-reconnect grace so the expiry test doesn't wait 30s. Long enough
// that the in-process reconnect comfortably lands inside the window.
const HOST_GRACE_MS = 500;

describe('game socket flow', () => {
  let httpServer: http.Server;
  let io: Server;
  let port: number;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    httpServer = http.createServer();
    io = new Server(httpServer);
    registerGameHandlers(io, { hostGraceMs: HOST_GRACE_MS });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const c of clients) c.disconnect();
    clients.length = 0;
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(): ClientSocket {
    const c = ioc(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
    clients.push(c);
    return c;
  }

  async function joinPlayer(pin: string, name: string, avatar: string): Promise<ClientSocket> {
    const p = connect();
    await waitFor(p, 'connect');
    p.emit('join-game', { pin, name, avatar });
    await waitFor(p, 'join-success');
    return p;
  }

  it('awards 1000/800 to the first two correct answers, 0 for wrong, and ranks the leaderboard', async () => {
    const host = connect();
    await waitFor(host, 'connect');
    host.emit('host-game', {
      customQuestions: [
        { text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, timeLimit: 20000, topic: null },
      ],
    });
    const { gamePin } = await waitFor<{ gamePin: string }>(host, 'host-joined');
    expect(gamePin).toMatch(/^\d{6}$/);

    const alice = await joinPlayer(gamePin, 'ALICE', '🪐');
    const bob = await joinPlayer(gamePin, 'BOB', '🌍');
    const cara = await joinPlayer(gamePin, 'CARA', '🌕');

    // Start the (topic-less) question — it activates immediately.
    host.emit('start-game');
    await waitForState(host, 'QUESTION_ACTIVE');

    // Submit serially so scoring order is deterministic: ALICE first, then BOB.
    alice.emit('submit-answer', { answerIndex: 0 });
    expect((await waitFor<{ isCorrect: boolean }>(alice, 'answer-feedback')).isCorrect).toBe(true);

    bob.emit('submit-answer', { answerIndex: 0 });
    expect((await waitFor<{ isCorrect: boolean }>(bob, 'answer-feedback')).isCorrect).toBe(true);

    cara.emit('submit-answer', { answerIndex: 1 });
    expect((await waitFor<{ isCorrect: boolean }>(cara, 'answer-feedback')).isCorrect).toBe(false);

    host.emit('show-results');
    const results = await waitForState(host, 'QUESTION_RESULTS');

    const scoreByName = Object.fromEntries(results.players.map((p: any) => [p.name, p.score]));
    expect(scoreByName).toEqual({ ALICE: 1000, BOB: 800, CARA: 0 });

    // Leaderboard is sorted by score descending.
    expect(results.players.map((p: any) => p.name)).toEqual(['ALICE', 'BOB', 'CARA']);

    // Per-question history is recorded for every player at results time.
    const historyByName = Object.fromEntries(results.players.map((p: any) => [p.name, p.scoreHistory]));
    expect(historyByName).toEqual({ ALICE: [1000], BOB: [800], CARA: [0] });
  });

  it('rejects joining once the game has started', async () => {
    const host = connect();
    await waitFor(host, 'connect');
    host.emit('host-game', {
      customQuestions: [
        { text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, timeLimit: 20000, topic: null },
      ],
    });
    const { gamePin } = await waitFor<{ gamePin: string }>(host, 'host-joined');

    await joinPlayer(gamePin, 'ALICE', '🪐');
    host.emit('start-game');
    await waitForState(host, 'QUESTION_ACTIVE');

    const latecomer = connect();
    await waitFor(latecomer, 'connect');
    latecomer.emit('join-game', { pin: gamePin, name: 'LATE', avatar: '🌑' });
    const err = await waitFor<string>(latecomer, 'join-error');
    expect(err).toMatch(/already started/i);
  });

  it('keeps the room alive when the host drops and lets it reconnect within the grace window', async () => {
    const host = connect();
    await waitFor(host, 'connect');
    host.emit('host-game', {
      hostId: 'host-token-1',
      customQuestions: [
        { text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, timeLimit: 20000, topic: null },
      ],
    });
    const { gamePin } = await waitFor<{ gamePin: string }>(host, 'host-joined');

    const player = await joinPlayer(gamePin, 'ALICE', '🪐');

    // The room must NOT be told the game ended when the host merely drops.
    let gameEnded = false;
    player.on('game-ended', () => { gameEnded = true; });

    host.disconnect();

    // Reconnect on a fresh socket within the grace window.
    const host2 = connect();
    await waitFor(host2, 'connect');
    host2.emit('resume-host', { pin: gamePin, hostId: 'host-token-1' });
    await waitFor(host2, 'host-joined');

    // The reconnected host is back in control: it can drive the game.
    host2.emit('start-game');
    const active = await waitForState(player, 'QUESTION_ACTIVE');
    expect(active.gameState).toBe('QUESTION_ACTIVE');
    expect(gameEnded).toBe(false);
  });

  it('ends the game if the host never returns within the grace window', async () => {
    const host = connect();
    await waitFor(host, 'connect');
    host.emit('host-game', {
      hostId: 'host-token-2',
      customQuestions: [
        { text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, timeLimit: 20000, topic: null },
      ],
    });
    const { gamePin } = await waitFor<{ gamePin: string }>(host, 'host-joined');

    const player = await joinPlayer(gamePin, 'ALICE', '🪐');

    const ended = waitFor<string>(player, 'game-ended', HOST_GRACE_MS + 2000);
    host.disconnect();
    expect(await ended).toMatch(/host disconnected/i);
  });

  it('rejects a resume-host with the wrong token', async () => {
    const host = connect();
    await waitFor(host, 'connect');
    host.emit('host-game', {
      hostId: 'host-token-3',
      customQuestions: [
        { text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, timeLimit: 20000, topic: null },
      ],
    });
    const { gamePin } = await waitFor<{ gamePin: string }>(host, 'host-joined');

    const impostor = connect();
    await waitFor(impostor, 'connect');
    impostor.emit('resume-host', { pin: gamePin, hostId: 'wrong-token' });
    const err = await waitFor<string>(impostor, 'resume-host-error');
    expect(err).toMatch(/not found/i);
  });
});
