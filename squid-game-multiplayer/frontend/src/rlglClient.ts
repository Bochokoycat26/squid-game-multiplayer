import { io, type Socket } from "socket.io-client";

export type PlayerState = {
  id: string; handle: string; connected: boolean;
  alive: boolean; won: boolean; progress: number;
};
export type RoomState = {
  roomCode: string; phase: "waiting"|"green"|"red"|"paused"|"finished";
  round: number; remainingMs: number; greenSeconds: number; redSeconds: number;
  autoElimination: boolean; hostPlayerId: string; players: PlayerState[];
};
type Ack<T = Record<string, never>> = { ok: true } & T | { ok: false; error: string };
type Credentials = { roomCode: string; playerId: string; playerToken: string; state: RoomState };

export class RLGLClient {
  private socket: Socket;
  private credentials?: Credentials;
  constructor(serverUrl: string) {
    this.socket = io(serverUrl, { transports: ["websocket"], reconnection: true, timeout: 10000 });
    // A transport reconnect creates a new server-side socket session. Reattach
    // the saved player identity so commands continue to work after brief drops.
    this.socket.on("connect", () => {
      const saved = this.credentials;
      if (saved) {
        this.request<Credentials>("room:reconnect", {
          roomCode: saved.roomCode,
          playerToken: saved.playerToken
        }).then(c => this.save(c)).catch(() => undefined);
      }
    });
  }
  get connected() { return this.socket.connected; }
  get identity() { return this.credentials ? { roomCode:this.credentials.roomCode, playerId:this.credentials.playerId } : undefined; }
  onState(fn:(state:RoomState)=>void) { this.socket.on("room:state",fn); return ()=>this.socket.off("room:state",fn); }
  onEliminated(fn:(v:{playerId:string;reason:string})=>void) { this.socket.on("game:eliminated",fn); return ()=>this.socket.off("game:eliminated",fn); }
  onWinner(fn:(v:{playerId:string})=>void) { this.socket.on("game:winner",fn); return ()=>this.socket.off("game:winner",fn); }
  onFinished(fn:(v:{winners:string[]})=>void) { this.socket.on("game:finished",fn); return ()=>this.socket.off("game:finished",fn); }
  onKicked(fn:(v:{playerId:string})=>void) { this.socket.on("room:kicked",fn); return ()=>this.socket.off("room:kicked",fn); }
  onClosed(fn:()=>void) { this.socket.on("room:closed",fn); return ()=>this.socket.off("room:closed",fn); }
  private request<T>(event:string,data:unknown={}):Promise<T> {
    return new Promise((resolve,reject)=>{
      this.socket.emit(event,data,(result:Ack<T>)=>{
        if(!result?.ok) reject(new Error(result?.error ?? "Request failed"));
        else resolve(result as T);
      });
    });
  }
  async create(handle:string) {
    const c=await this.request<Credentials>("room:create",{handle});
    this.save(c); return c;
  }
  async join(roomCode:string,handle:string) {
    const c=await this.request<Credentials>("room:join",{roomCode,handle});
    this.save(c); return c;
  }
  async reconnect(roomCode:string,playerToken:string) {
    const c=await this.request<Credentials>("room:reconnect",{roomCode,playerToken});
    this.save(c); return c;
  }
  private save(c:Credentials) { this.credentials=c; }
  updateHandle(handle:string) { return this.request("player:update-handle",{handle}); }
  move(steps:1|2=1) { return this.request("player:move",{steps}); }
  stop() { return this.request("player:stop"); }
  start() { return this.request("host:start"); }
  pause() { return this.request("host:pause"); }
  resume() { return this.request("host:resume"); }
  reset() { return this.request("host:reset"); }
  updateSettings(settings:{greenSeconds:number;redSeconds:number;autoElimination:boolean}) {
    return this.request("host:update-settings",settings);
  }
  kick(playerId:string) { return this.request("host:kick",{playerId}); }
  leave() { return this.request("room:leave"); }
  disconnect() { this.socket.disconnect(); }
  connect() { this.socket.connect(); }
}
