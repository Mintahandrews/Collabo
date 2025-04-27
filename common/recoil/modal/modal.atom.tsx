import { atom } from "recoil";

export const modalAtom = atom<{
  modal: JSX.Element | JSX.Element[];
  opened: boolean;
}>({
  key: "modalState",
  default: {
    modal: <></>,
    opened: false,
  },
});
