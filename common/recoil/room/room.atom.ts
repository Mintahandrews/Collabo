import { atom } from "recoil";

export const DEFAULT_ROOM = {
  id: "",
  userId: "",
  users: new Map(),
  usersMoves: new Map(),
  movesWithoutUser: [],
  myMoves: [],
  kind: "whiteboard" as RoomKind,
};

export const roomAtom = atom<ClientRoom>({
  key: "roomState",
  default: DEFAULT_ROOM,
});
