# Collabo — agent notes

Realtime collaborative design app: Next.js 13 (pages dir) + React 18 + socket.io + custom node server (`server/index.ts`).

## Room kinds

`whiteboard` (canvas moves) | `architect` (shared `DesignElement` doc) | `app` (streamed Docker desktop via linuxserver images + KasmVNC).

## Key architecture

- `common/types/elements.ts` — `DesignElement` union + `ElementOp` (add/update/delete). Client assigns ids; server stamps `createdBy`/`timestamp`.
- `server/index.ts` — in-memory `rooms` map; element ops validated + broadcast; JSON-file persistence in `data/rooms` (or `DATA_DIR`), restored on boot; container spawn via `server/app-containers.ts` (docker CLI).
- `common/recoil/elements/` — element store + inverse-op undo/redo history.
- `common/recoil/arch/` — tool/selection/grid/snap/view3d state.
- `modules/room/components/arch/` — Konva overlay (bound to board x/y motion values; `pointer-events: none` when tool is `none`).
- `modules/room/components/arch3d/` — react-three-fiber live 3D preview.
- `modules/room/helpers/` — `arch.helpers` (polyline math, snapping), `arch3d.helpers` (wall→segment→box decomposition), `dxf.helpers`, `ifc.helpers` (IFC-2x3 writer), `minimapElements.helpers`.

## Commands

- Dev: `npm run dev` (nodemon) or `npm run dev:client` (ts-node, no watch). App on :3000.
- Typecheck: `npx tsc --noEmit`
- Unit-ish tests: `npm test` (DXF + IFC exporters, standalone)
- Socket protocol smoke (needs dev server running): `npm run test:smoke`, `node scripts/smoke-persistence.mjs create|verify <roomId>`
- Lint: `npm run lint` (next/core-web-vitals)

## Gotchas

- `npm run dev` needs `nodemon` (installed, devDep).
- Render deploy: disk at `/var/data` + `DATA_DIR=/var/data/rooms` in `render.yaml`; container FS is otherwise ephemeral.
- App rooms need Docker running on the host; first launch pulls multi-GB images.
- Undo is per-user: element history drains before whiteboard moves on ctrl+z/ctrl+y and toolbar buttons.
- IFC export is validated structurally only (scripts/test-ifc.ts) — not yet in a BIM viewer.
