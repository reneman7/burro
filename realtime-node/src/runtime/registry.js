import { GameRoom } from './gameRoom.js';

const rooms = new Map(); // tableId -> GameRoom

export function getOrCreateGameRoom(io, tableId) {
  if (!rooms.has(tableId)) {
    rooms.set(tableId, new GameRoom(io, tableId));
  }
  return rooms.get(tableId);
}

export function getGameRoom(tableId) {
  return rooms.get(tableId) ?? null;
}
