export type Phase = "waiting" | "green" | "red" | "paused" | "finished";
export type Player = {
  id: string; handle: string; tokenHash: string; connected: boolean;
  alive: boolean; won: boolean; progress: number; lastMoveAt: number;
};
export type Room = {
  id: string; code: string; hostPlayerId: string; phase: Phase;
  round: number; remainingMs: number; phaseEndsAt: number | null;
  greenSeconds: number; redSeconds: number; autoElimination: boolean;
  players: Map<string, Player>; timer?: NodeJS.Timeout;
  broadcastTimer?: NodeJS.Timeout; pausedRemainingMs?: number;
};
export type PublicPlayer = Omit<Player, "tokenHash" | "lastMoveAt">;
export type RoomSnapshot = {
  roomCode: string; phase: Phase; round: number; remainingMs: number;
  greenSeconds: number; redSeconds: number; autoElimination: boolean;
  hostPlayerId: string; players: PublicPlayer[];
};
