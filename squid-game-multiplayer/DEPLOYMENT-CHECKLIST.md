# Upload and deployment checklist

## GitHub upload
1. Open your empty `squid-game-multiplayer` repository.
2. Choose **Add file → Upload files**.
3. Extract this ZIP on your computer, then drag the contents of the extracted `squid-game-multiplayer` folder into GitHub's upload area (upload the contents, not the enclosing folder).
4. Commit to the `main` branch.

## Railway
1. In Railway, create a project and deploy from the GitHub repository.
2. Backend service: repository root directory. Add Redis. Set `REDIS_URL` to the Redis service's Railway reference and `CLIENT_ORIGIN` to the frontend's eventual public URL. Generate a backend domain and check `/health`.
3. Frontend service: add a second service from the same repository and set Root Directory to `/frontend`. Set `GAME_SERVER_URL` to the backend's public HTTPS URL. Generate a frontend domain.
4. Copy the frontend's exact public HTTPS origin into backend `CLIENT_ORIGIN`, then redeploy the backend.
5. Test with two separate browsers/devices: create a room in one, join by code in the other, start the game as host, verify both see the same light state, and test red-light elimination.

## Do not skip
- Keep the backend at one replica.
- Do not share player reconnect tokens.
- Rooms are ephemeral and disappear after a backend restart/redeploy.
- The first version does not persist room/player/game records to PostgreSQL.
