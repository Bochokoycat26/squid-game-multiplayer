# Squid Game: Red Light / Green Light — multiplayer web app

This repository contains a React/Vite browser frontend and a Node.js/TypeScript + Socket.IO game server for rooms of up to 30 players.

## Features
- Create a room with a six-character code, or join by code.
- Editable player handles and reconnect token support.
- Host controls: start, pause, resume, reset, round timing, automatic elimination, and kicking players from the waiting room.
- Server-authoritative light phases, movement, progress, winners, and red-light elimination.
- Live room roster and progress display.

## Project layout
- `frontend/` — React + Vite UI, also includes a Dockerfile for a separate Railway frontend service.
- `src/` — authoritative game server.
- `prisma/schema.prisma` — initial PostgreSQL schema (not yet wired into game-state persistence).
- `docker-compose.yml` — local Redis service.
- `railway.toml` — Railway config for the backend service.

## Local development
Requirements: Node.js 20+ and Docker.

Terminal 1 (from repo root):
```bash
docker compose up -d redis
npm install
npm run dev
```

Terminal 2:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. The game server listens on `http://localhost:3001` and health is `GET /health`.

## Deploy to Railway
Deploy **two services from this same GitHub repository**:

### 1. Backend service
- Create a Railway service from this repository with the repository root as its root directory. The root `railway.toml` and root `Dockerfile` configure the game server.
- Add a Railway Redis service.
- Set backend variables:
  - `CLIENT_ORIGIN=https://<your-frontend-service-domain>`
  - `REDIS_URL=${{Redis.REDIS_URL}}` (select the Redis service reference from Railway's variable picker; service naming can differ)
  - `NODE_ENV=production`
  - `PORT=3001`
- Generate a public domain for the backend and verify `https://<backend-domain>/health` returns `{"ok":true,...}`.
- Keep this service at **one replica**.

### 2. Frontend service
- Add another service from the same GitHub repository.
- Set its **Root Directory** to `/frontend`; it will use `frontend/Dockerfile` and `frontend/railway.toml`.
- Set `GAME_SERVER_URL=https://<backend-domain>` in the frontend service variables.
- Generate a public domain for the frontend and open it in a browser.
- After creating the frontend domain, update the backend's `CLIENT_ORIGIN` to that exact `https://` origin and redeploy the backend.

### Important limitations before public launch
- Room/player/game state is currently held in the backend process memory. Active rooms are lost if the backend restarts or redeploys.
- Redis currently distributes Socket.IO packets; it does not make the authoritative game state shared between server replicas. Do not scale the backend above one replica.
- The included Prisma schema is a starting point only; PostgreSQL persistence is not yet implemented or required for this initial ephemeral-room deployment.
- Player reconnect tokens are stored in browser localStorage. Anyone with access to a player's browser profile can potentially act as that player.
- The game eliminates a player when the server receives a move command during RED. This is an input-based game mechanic, not camera/motion detection.
- Before a large public event, add durable room ownership/state, persistent storage, authentication/abuse protections, monitoring, backups, and load testing.

## Game protocol
The frontend listens to authoritative `room:state` snapshots and sends only discrete player movement commands. It never decides the phase, progress, winner, or elimination result. See `frontend/src/rlglClient.ts` and `frontend-integration/README.md` for protocol details.
