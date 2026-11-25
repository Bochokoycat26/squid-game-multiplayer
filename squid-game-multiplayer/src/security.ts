import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
export const newId = () => randomBytes(12).toString("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function tokenMatches(token: string, hash: string) {
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeRoomCode() {
  return Array.from({length: 6}, () => alphabet[randomInt(alphabet.length)]).join("");
}
export const cleanHandle = (s: string) => s.trim().replace(/[<>\\u0000-\\u001f]/g, "").slice(0, 18);
