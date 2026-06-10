# Lessons Learned: Building a Real-Time Multiplayer Quiz Game

Notes from hardening a Kahoot-style game (Socket.io + React, in-memory server
state) for real use. Written for anyone building live multiplayer games. Most of
this is not about features. It is about failure modes, identity, testing, and
knowing your actual scale before you optimize.

---

## 1. The crash that taught the most: the client is the constraint, not the server

A player on iOS Safari got *"A problem repeatedly occurred"* mid-game and was
dropped. That message is not a JavaScript error. It is the browser killing the
tab's render process for using too much memory/GPU, then crash-looping on reload.

The cause was the UI, not the network: the player screen ran ~70 continuously
animating, GPU-composited layers (large `blur()` filters with `mix-blend-screen`,
plus several `requestAnimationFrame` loops) for the whole game. Fine on a laptop,
fatal on a loaded phone.

**Lessons:**
- In a live game, every player is running your heaviest UI on the weakest device
  in the room. Design for the worst phone, not your dev machine.
- `blur()` + `mix-blend-screen` animated every frame is the most expensive thing
  you can ask a mobile GPU to do. Gate heavy effects behind a mobile /
  `prefers-reduced-motion` check and ship a static fallback. Keep the rich
  version for desktop.
- Distinguish a render-process crash ("a problem repeatedly occurred", white
  tab, OOM) from a JS exception (error overlay, stack trace). They have totally
  different causes.

---

## 2. Three kinds of testing, and they do not substitute for each other

It is tempting to run a load test, see green, and call the game "ready." That is
a trap, because each test layer answers a different question:

| Layer | Answers | Blind to |
|------|---------|----------|
| **Load test** (headless socket clients) | Can the *server* hold N connections and deliver answers? | Anything the browser renders. It never draws a pixel. |
| **Unit/integration test** (in-process) | Is the *game logic* correct (scoring, state machine)? | Real network, real devices. |
| **Device test** (real phone / throttled browser) | Does it actually *work and survive* on a real player's hardware? | Nothing else catches the client OOM. |

The mobile crash above could never be caught by a load test, because load tests
use headless clients with no DOM. We almost reached for "run more load tests" to
validate a client crash. Wrong layer. Name what each test proves, and do not let
a green run in one layer imply safety in another.

---

## 3. Make real-time code testable, or you will never change it safely

The game logic started sealed inside one big `startServer()` function that also
booted the web server and listened on a port. You could not reach the scoring or
the socket handlers without starting the whole thing. So there were no tests for
the part most likely to break.

The fix was a behaviour-preserving extraction: move the session state and all
socket handlers into an exported `registerGameHandlers(io, options)`. The web
server just wires it on. Now a test can:

- start a throwaway Socket.io server on an ephemeral port in-process,
- connect real `socket.io-client` sockets,
- drive a real game (host → join → answer → results),
- and assert on the broadcast payloads.

**Lessons:**
- Test real-time logic *through the protocol* (emit events, assert on broadcasts),
  not by poking internal state. That keeps tests honest about what clients see.
- Mock only the truly external dependency (the database). Run the real socket
  server in-process.
- Make timeouts/grace windows injectable (`registerGameHandlers(io, { hostGraceMs })`)
  so a test can use 150ms instead of 30s. Untestable timing is untested timing.
- This extraction is the single highest-leverage move. Every later fix
  (reconnection, broadcast changes) became verifiable the moment the logic was
  importable. Do it before, not after.

---

## 4. The "answer storm": quadratic broadcasts, and why we did *not* fix it

The server broadcast the full game state to every socket on *every* submitted
answer. With N players answering at once, that is ~N broadcasts per question,
each an O(N) payload sent to N clients: O(N²) messages, O(N³) bytes per question.

We measured it instead of guessing (in-process, all players answering at once):

| players | broadcasts / question | payload pushed | event-loop stall |
|--------:|----------------------:|---------------:|-----------------:|
| 50 | 2,652 | 22.8 MB | 90 ms |
| 100 | 10,302 | 173.7 MB | 480 ms |

Doubling players (50 → 100) gave **3.9× the broadcasts** and **7.6× the bytes**.
Textbook quadratic/cubic growth.

The scary metric is not the megabytes, it is the **event-loop stall**: at 100
players the server froze for ~half a second processing one question's storm.
During that freeze it cannot accept joins, serve other rooms, or answer health
checks. That is what makes a big game feel broken right when everyone answers.

**The fix** (if you need it): stop broadcasting full state on every answer.
During an active question, emit a tiny "tally" (answered count + answer
distribution). Send the heavy full state only on real transitions (results, next
question). That drops per-question cost from cubic toward linear.

**The decision: we did not fix it.** The real target was ~40 players, where the
stall is ~50ms (imperceptible), confirmed by a prior 40-player production run
(99% answers, 0 disconnects). The problem only bites past ~70 players. Fixing it
would have been engineering for a scale that did not exist.

**Lessons:**
- Measure before you optimize. We almost shipped a fix for a non-problem.
- Event-loop stall, not bandwidth, is the metric that predicts a bad live game.
- "Broadcast full state on every mutation" is a fine default that quietly becomes
  quadratic. Know where the cliff is for *your* player count.
- Knowing your real scale is a feature. It told us to skip a whole project.

---

## 5. Identity and reconnection: the genuinely hard part

Phones drop. Wifi blinks. Tabs crash. In a live game this is constant, and the
default setup makes it catastrophic, because players and the host were keyed by
the **ephemeral `socket.id`**. A reconnect is a new socket = a new identity, so:

- a player who dropped was deleted and could not rejoin a started game,
- and the **host dropping ended the game for everyone** (the host socket id was
  the session's owner).

### Stable identity beats socket id

The fix for both: a **client-minted token** (a UUID in `localStorage`) sent on
join/host and re-sent on reconnect. The server keys players/host by that token,
not the socket. A reload or blip reattaches to the same identity with the same
score.

### Disconnect does not mean "gone" — use a grace window

For the host we added a 30s grace timer: a disconnect no longer ends the room, it
starts a countdown. Reconnect within the window cancels it; only a real, lasting
disconnect ends the game. The same idea covers player reconnection (keep the
player listed as "reconnecting" instead of deleting them).

### The edge cases are where the real work is

A reconnect feature is 20% happy path and 80% edge cases:

- **Recycled identifiers.** Short game PINs get reused across games. A stale
  `localStorage` entry must not silently walk a returning user into a *different*
  game that happens to share the PIN. Match on the unguessable token, and only
  clear the stored entry for the exact session you tried to resume.
- **Reload vs. blip.** A transient reconnect keeps in-memory state (safe). A full
  reload wipes it and re-runs mount logic, which can race with reconnection. We
  added an `isResuming` flag so a reloading host reclaims its game instead of
  auto-hosting a duplicate.
- **`localStorage` can throw.** iOS private mode throws on write. Guard every
  access in try/catch and degrade to "no resume" rather than crashing the join.
- **Re-emit on every connect.** Handle a reload and a transient reconnect with
  one path: on every `connect`, if a stored session exists, attempt to resume.

### Trust model

The token is client-generated and trusted: possession of the token *is* the
identity. A 122-bit random UUID is unguessable, so this is fine for a party game.
Name that assumption so nobody later mistakes it for authentication.

---

## 6. In-memory state is fast and fragile — decide what you will not cover

All game state lived in plain server-side Maps. Great for latency, but:

- A **server restart wipes every live game.** Our reconnection work survives a
  client crash but not a server restart, and we chose to accept that and write it
  down rather than build database-backed live-state recovery (a much larger
  project for a party game).
- On a free hosting tier the instance **sleeps when idle**, so the first players
  at game start can hit a 30-60s cold boot. A self-ping does not help (the process
  is stopped); only an *external* warmer does.

**Lesson:** for in-memory real-time servers, explicitly decide and document what
you do *not* recover from. "Survives client crashes, not server restarts" is a
fine, honest boundary. Silent gaps are the dangerous ones.

---

## 7. Production is a pile of small decisions, not features

The interesting work was rarely "build X." It was choosing well:

- How long should a host be gone before the room gives up? (30s: survives a blip,
  does not strand players on a dead game.)
- What do other players see while someone is disconnected? (Stay listed as
  "reconnecting," not vanish, so the host knows who to wait for.)
- Should reconnection be silent or manual? (Silent: the phone remembers and slips
  back in with no typing.)
- How much do we cover for server restart? (Nothing, documented.)

A few principles that held up:

- **Do the complete thing when it is cheap, flag the thing that is not.** A clean
  reconnect across blips and reloads was worth finishing. Database-backed
  live-state recovery was correctly flagged as out of scope.
- **YAGNI against your real scale.** The answer-storm fix was the textbook "right"
  optimization and the wrong thing to build for 40 players.
- **Be honest about what is verified.** Server logic was covered by tests; the
  client reconnection path type-checked and built but was not auto-tested, so it
  was called out as needing a real-device check, not quietly marked "done."

---

## 8. Process notes that paid off

- **Tag a known-good commit before risky work.** A named anchor makes "undo all
  of this" a one-line command instead of archaeology.
- **Refactor behind tests, then change behavior.** Extract → baseline test → then
  modify. The baseline catches the refactor breaking scoring instantly.
- **Test-first shines on state machines.** Reconnection and scoring are exactly
  the silent-corruption-prone logic where a failing-then-passing test earns its
  keep.
- **Small, independent PRs** keep each change revertable on its own.

---

## TL;DR

1. The client (mobile GPU/memory) is your real constraint; load tests are blind to it.
2. Extract your real-time logic so it is importable and testable through the protocol.
3. Measure scaling before optimizing; event-loop stall predicts a bad live game; know where your cliff is and ignore it if you are below it.
4. Key players/host by a stable token, not the socket id; treat disconnect as "maybe coming back" with a grace window; the edge cases (recycled IDs, reload races, private-mode storage) are the actual work.
5. In-memory is fast and fragile; decide and document what you do not recover from.
6. Most of production is small, well-reasoned decisions about failure modes.
