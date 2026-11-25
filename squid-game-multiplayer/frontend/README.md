# Squid Game frontend

React + Vite frontend for the multiplayer Red Light / Green Light server.

## Local development

1. Start Redis (from the repository root): `docker compose up -d redis`
2. In the repository root, install and start the server: `npm install && npm run dev`
3. In a second terminal: `cd frontend && npm install && cp .env.example .env && npm run dev`
4. Open http://localhost:5173

Set `VITE_GAME_SERVER_URL` to the public HTTPS URL of your Railway game-server service before building/deploying the frontend.

The browser stores a per-player reconnect token in localStorage. Do not share it. Room state, phase changes, progress, wins, and elimination are authoritative on the server.
