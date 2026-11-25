import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { z } from "zod";
import * as game from "./game.js";
import { cleanHandle, tokenMatches } from "./security.js";
import type { Player, Room } from "./types.js";

const app=express();
const allowedOrigins=(process.env.CLIENT_ORIGIN??"http://localhost:5173").split(",").map(v=>v.trim()).filter(Boolean);
app.use(cors({origin:allowedOrigins,credentials:true}));
app.get("/health",(_req,res)=>res.json({ok:true,service:"rlgl-game-server"}));
const httpServer=createServer(app);
const io=new Server(httpServer,{cors:{origin:allowedOrigins,methods:["GET","POST"],credentials:true},transports:["websocket","polling"]});
const pub=new Redis(process.env.REDIS_URL??"redis://localhost:6379");
const sub=pub.duplicate();
io.adapter(createAdapter(pub,sub));
(globalThis as any).__rlglEmit=(code:string,event:string,payload?:unknown)=>io.to(code).emit(event,payload);
declare global { var __rlglEmit: ((code:string,event:string,payload?:unknown)=>void) | undefined; }\ntype Session={room:Room;player:Player};
const sessions=new Map<string,Session>();
const limits=new Map<string,{n:number;at:number}>();
function ack(cb:any,fn:()=>unknown){try{const result=fn();cb?.({ok:true,...(result as object??{})});}catch(e){cb?.({ok:false,error:e instanceof Error?e.message:"Request failed"});}}
function rate(socketId:string,limit=12){const now=Date.now(),v=limits.get(socketId)??{n:0,at:now};if(now-v.at>1000){v.n=0;v.at=now;}v.n++;limits.set(socketId,v);if(v.n>limit)throw new Error("Too many requests");}
function session(socketId:string){const s=sessions.get(socketId);if(!s || s.room.players.get(s.player.id)!==s.player)throw new Error("Join a room first");return s;}
function host(s:Session){if(!game.isHost(s.room,s.player))throw new Error("Host permission required");}
function attach(socket:any,room:Room,player:Player,token:string){socket.join(room.code);sessions.set(socket.id,{room,player});return {roomCode:room.code,playerId:player.id,playerToken:token,state:game.snapshot(room)}}
const handleSchema=z.string().trim().min(1).max(18).transform(cleanHandle);
io.on("connection",socket=>{
  socket.on("room:create",(data,cb)=>ack(cb,()=>{
    rate(socket.id,5);const handle=handleSchema.parse(data?.handle);
    const {room,player,token}=game.createRoom(handle);
    return attach(socket,room,player,token);
  }));
  socket.on("room:join",(data,cb)=>ack(cb,()=>{
    rate(socket.id,5);const code=z.string().regex(/^[A-Z2-9]{6}$/).parse(String(data?.roomCode??"").toUpperCase());
    const handle=handleSchema.parse(data?.handle);const room=game.getRoomByCode(code);if(!room)throw new Error("Room not found");
    const {player,token}=game.joinRoom(room,handle);return attach(socket,room,player,token);
  }));
  socket.on("room:reconnect",(data,cb)=>ack(cb,()=>{
    rate(socket.id,5);const room=game.getRoomByCode(String(data?.roomCode??"").toUpperCase());if(!room)throw new Error("Room not found");
    const token=z.string().min(20).parse(data?.playerToken);
    const player=[...room.players.values()].find(p=>tokenMatches(token,p.tokenHash));if(!player)throw new Error("Invalid reconnect token");
    game.reconnectPlayer(room,player);return attach(socket,room,player,token);
  }));
  socket.on("player:update-handle",(data,cb)=>ack(cb,()=>{
    rate(socket.id);const s=session(socket.id);const handle=handleSchema.parse(data?.handle);game.updateHandle(s.room,s.player,handle);return {};
  }));
  socket.on("player:move",(data,cb)=>ack(cb,()=>{
    rate(socket.id,8);const s=session(socket.id);const steps=z.number().int().min(1).max(2).parse(data?.steps??1);return game.move(s.room,s.player,steps);
  }));
  socket.on("player:stop",(_data,cb)=>ack(cb,()=>{rate(socket.id);session(socket.id);return {stopped:true};}));
  socket.on("host:start",(_data,cb)=>ack(cb,()=>{rate(socket.id);const s=session(socket.id);host(s);game.startGame(s.room);return {};}));
  socket.on("host:pause",(_data,cb)=>ack(cb,()=>{rate(socket.id);const s=session(socket.id);host(s);game.pauseGame(s.room);return {};}));
  socket.on("host:resume",(_data,cb)=>ack(cb,()=>{rate(socket.id);const s=session(socket.id);host(s);game.resumeGame(s.room);return {};}));
  socket.on("host:reset",(_data,cb)=>ack(cb,()=>{rate(socket.id);const s=session(socket.id);host(s);game.resetGame(s.room);return {};}));
  socket.on("host:update-settings",(data,cb)=>ack(cb,()=>{
    rate(socket.id);const s=session(socket.id);host(s);
    const v=z.object({greenSeconds:z.number().int().min(3).max(30),redSeconds:z.number().int().min(2).max(20),autoElimination:z.boolean()}).parse(data);
    game.updateSettings(s.room,v.greenSeconds,v.redSeconds,v.autoElimination);return {};
  }));
  socket.on("host:kick",(data,cb)=>ack(cb,()=>{
    rate(socket.id);const s=session(socket.id);host(s);const id=z.string().min(1).max(64).parse(data?.playerId);
    game.kickPlayer(s.room,id);
    for(const [sid,other] of sessions.entries()){
      if(other.room===s.room && other.player.id===id){
        sessions.delete(sid);
        io.sockets.sockets.get(sid)?.leave(s.room.code);
      }
    }
    return {};
  }));
  socket.on("room:leave",(_data,cb)=>ack(cb,()=>{const s=session(socket.id);game.leaveRoom(s.room,s.player);sessions.delete(socket.id);socket.leave(s.room.code);return {};}));
  socket.on("disconnect",()=>{const s=sessions.get(socket.id);if(s)game.disconnectPlayer(s.room,s.player);sessions.delete(socket.id);limits.delete(socket.id);});
});
const port=Number(process.env.PORT??3001);
httpServer.listen(port,()=>console.log(`RLGL server listening on :${port}`));
async function shutdown(){io.close();await Promise.all([pub.quit(),sub.quit()]);httpServer.close(()=>process.exit(0));}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
