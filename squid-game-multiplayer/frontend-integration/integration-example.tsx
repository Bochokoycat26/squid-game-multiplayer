// Example integration for an existing React/Vite frontend.
// Install: npm install socket.io-client
// .env.local: VITE_GAME_SERVER_URL=http://localhost:3001
// Railway production: VITE_GAME_SERVER_URL=https://YOUR-RAILWAY-DOMAIN

import { useEffect, useMemo, useState } from "react";
import { RLGLClient, type RoomState } from "./rlglClient";

const SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL as string;

export function useRLGLMultiplayer() {
  const client = useMemo(() => new RLGLClient(SERVER_URL), []);
  const [state,setState] = useState<RoomState>();
  const [error,setError] = useState("");

  useEffect(() => {
    const offState=client.onState(setState);
    const offEliminated=client.onEliminated(({playerId,reason}) => {
      console.info("Eliminated",playerId,reason);
    });
    const offWinner=client.onWinner(({playerId}) => console.info("Winner",playerId));
    const offClosed=client.onClosed(() => setError("The host closed this room."));
    return () => { offState();offEliminated();offWinner();offClosed();client.disconnect(); };
  },[client]);

  async function run(action:()=>Promise<unknown>) {
    setError("");
    try { return await action(); }
    catch(e) { const message=e instanceof Error?e.message:"Unexpected error";setError(message);throw e; }
  }
  return {
    client,state,error,
    create:(handle:string)=>run(()=>client.create(handle)),
    join:(code:string,handle:string)=>run(()=>client.join(code,handle)),
    reconnect:(code:string,token:string)=>run(()=>client.reconnect(code,token)),
    move:()=>run(()=>client.move(1)),
    start:()=>run(()=>client.start()),
    pause:()=>run(()=>client.pause()),
    resume:()=>run(()=>client.resume()),
    reset:()=>run(()=>client.reset()),
    updateHandle:(handle:string)=>run(()=>client.updateHandle(handle)),
    updateSettings:(v:{greenSeconds:number;redSeconds:number;autoElimination:boolean})=>run(()=>client.updateSettings(v)),
    kick:(id:string)=>run(()=>client.kick(id)),
  };
}
