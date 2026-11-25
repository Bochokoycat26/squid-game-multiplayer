# Frontend integration reference

The integrated React app is now in `frontend/`. It imports `frontend/src/rlglClient.ts` and renders the server's authoritative `room:state` snapshots. The earlier `integration-example.tsx` is retained as a minimal reference.

Do not add client-side timers or simulate other players. Send discrete `player:move` commands; server-side rules decide progress, wins, and elimination.
