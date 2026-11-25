import type { Player, Room, RoomSnapshot } from "./types.js";
import { makeRoomCode, newId, newToken, hashToken } from "./security.js";

const rooms = new Map<string, Room>();
const byCode = new Map<string, string>();
const MAX_PLAYERS = 30;
const TICK_MS = 200;
const BROADCAST_MS = 200;

export function getRoomByCode(code: string) {
  const id = byCode.get(code.toUpperCase());
  return id ? rooms.get(id) : undefined;
}
export function snapshot(room: Room): RoomSnapshot {
  return {
    roomCode: room.code, phase: room.phase, round: room.round,
    remainingMs: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : room.remainingMs,
    greenSeconds: room.greenSeconds, redSeconds: room.redSeconds,
    autoElimination: room.autoElimination, hostPlayerId: room.hostPlayerId,
    players: [...room.players.values()].map(({tokenHash, lastMoveAt, ...p}) => p)
  };
}
function emit(room: Room, event: string, payload?: unknown) {
  // Injected by index.ts after Socket.IO is initialized.
  globalThis.__rlglEmit?.(room.code, event, payload);
}
function broadcast(room: Room) { emit(room, "room:state", snapshot(room)); }
function stopTimers(room: Room) {
  if (room.timer) clearInterval(room.timer);
  if (room.broadcastTimer) clearInterval(room.broadcastTimer);
  room.timer = undefined; room.broadcastTimer = undefined;
}
function finishIfDone(room: Room) {
  const active = [...room.players.values()].filter(p => p.alive && !p.won);
  const living = [...room.players.values()].filter(p => p.alive);
  if (!living.length || (living.length > 0 && active.length === 0)) {
    room.phase = "finished"; room.phaseEndsAt = null; stopTimers(room);
    emit(room, "game:finished", { winners: [...room.players.values()].filter(p=>p.won).map(p=>p.id) });
    broadcast(room);
  }
}
function eliminate(room: Room, player: Player, reason: string) {
  if (!player.alive) return;
  player.alive = false;
  emit(room, "game:eliminated", { playerId: player.id, reason });
  finishIfDone(room);
}
function transition(room: Room, phase: "green" | "red") {
  room.phase = phase; room.round += phase === "green" ? 1 : 0;
  const seconds = phase === "green" ? room.greenSeconds : room.redSeconds;
  room.phaseEndsAt = Date.now() + seconds * 1000;
  room.remainingMs = seconds * 1000;
  emit(room, "game:phase", { phase, round: room.round, endsAt: room.phaseEndsAt });
}
function startClock(room: Room) {
  stopTimers(room);
  room.timer = setInterval(() => {
    if (room.phase !== "green" && room.phase !== "red") return;
    if (room.phaseEndsAt && Date.now() >= room.phaseEndsAt) {
      transition(room, room.phase === "green" ? "red" : "green");
      finishIfDone(room);
    }
  }, TICK_MS);
  room.broadcastTimer = setInterval(() => broadcast(room), BROADCAST_MS);
}
export function createRoom(handle: string) {
  let code = makeRoomCode();
  while (byCode.has(code)) code = makeRoomCode();
  const id = newId(), playerId = newId(), token = newToken();
  const player: Player = {id: playerId, handle, tokenHash: hashToken(token), connected: true, alive: true, won: false, progress: 0, lastMoveAt: 0};
  const room: Room = {id, code, hostPlayerId: playerId, phase:"waiting", round:0, remainingMs:0, phaseEndsAt:null, greenSeconds:10, redSeconds:6, autoElimination:true, players:new Map([[playerId, player]])};
  rooms.set(id, room); byCode.set(code, id);
  return {room, player, token};
}
export function joinRoom(room: Room, handle: string) {
  if (room.phase !== "waiting") throw new Error("Game already started");
  if (room.players.size >= MAX_PLAYERS) throw new Error("Room is full (30 players maximum)");
  const playerId = newId(), token = newToken();
  const player: Player = {id:playerId, handle, tokenHash:hashToken(token), connected:true, alive:true, won:false, progress:0, lastMoveAt:0};
  room.players.set(playerId, player);
  return {player, token};
}
export function findPlayer(room: Room, id: string) { return room.players.get(id); }
export function updateHandle(room: Room, player: Player, handle: string) { player.handle = handle; broadcast(room); }
export function disconnectPlayer(room: Room, player: Player) { player.connected = false; broadcast(room); }
export function reconnectPlayer(room: Room, player: Player) { player.connected = true; broadcast(room); }
export function leaveRoom(room: Room, player: Player) {
  room.players.delete(player.id);
  if (player.id === room.hostPlayerId) {
    const next = room.players.values().next().value as Player | undefined;
    if (next) room.hostPlayerId = next.id;
    else { stopTimers(room); rooms.delete(room.id); byCode.delete(room.code); emit(room, "room:closed", {}); return; }
  }
  broadcast(room);
}
export function move(room: Room, player: Player, steps: number) {
  if (!player.alive || player.won) throw new Error("You are not an active player");
  if (room.phase === "red") {
    if (room.autoElimination) eliminate(room, player, "Moved during RED LIGHT");
    broadcast(room);
    return { eliminated: player.alive === false };
  }
  if (room.phase !== "green") throw new Error("Movement is not allowed right now");
  const now = Date.now();
  if (now - player.lastMoveAt < 250) throw new Error("Move too fast");
  player.lastMoveAt = now;
  player.progress = Math.min(100, player.progress + Math.min(steps, 2) * 2);
  if (player.progress >= 100) {
    player.won = true;
    emit(room, "game:winner", {playerId:player.id});
    finishIfDone(room);
  }
  broadcast(room);
  return {progress:player.progress, won:player.won};
}
export function startGame(room: Room) {
  if (room.phase !== "waiting") throw new Error("Game is not waiting");
  if (![...room.players.values()].some(p=>p.alive)) throw new Error("No players available");
  transition(room, "green"); startClock(room); broadcast(room);
}
export function pauseGame(room: Room) {
  if (room.phase !== "green" && room.phase !== "red") throw new Error("Game cannot be paused");
  room.pausedRemainingMs = Math.max(0, (room.phaseEndsAt ?? Date.now()) - Date.now());
  room.pausedPhase = room.phase;
  room.phase = "paused"; room.phaseEndsAt = null; stopTimers(room); broadcast(room);
}
export function resumeGame(room: Room) {
  if (room.phase !== "paused") throw new Error("Game is not paused");
  const phase = room.pausedPhase ?? "green";
  room.phase = phase; room.phaseEndsAt = Date.now() + (room.pausedRemainingMs ?? 10000);
  room.pausedRemainingMs = undefined; room.pausedPhase = undefined; startClock(room); broadcast(room);
}
export function resetGame(room: Room) {
  stopTimers(room);
  for (const p of room.players.values()) {p.alive=true;p.won=false;p.progress=0;p.lastMoveAt=0;}
  room.phase="waiting";room.round=0;room.remainingMs=0;room.phaseEndsAt=null;room.pausedRemainingMs=undefined;
  broadcast(room);
}
export function updateSettings(room: Room, greenSeconds: number, redSeconds: number, autoElimination: boolean) {
  if (room.phase !== "waiting") throw new Error("Settings can only change before the game starts");
  room.greenSeconds=greenSeconds;room.redSeconds=redSeconds;room.autoElimination=autoElimination;broadcast(room);
}
export function kickPlayer(room: Room, playerId: string) {
  if (playerId === room.hostPlayerId) throw new Error("Host cannot kick themselves");
  const p=room.players.get(playerId);if(!p)throw new Error("Player not found");
  room.players.delete(playerId);emit(room,"room:kicked",{playerId});broadcast(room);
}
export function isHost(room: Room, player: Player) { return room.hostPlayerId === player.id; }
export function roomPlayerCount(room: Room) { return room.players.size; }
