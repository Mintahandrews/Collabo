import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const run = promisify(execFile);

// Per-room shared folder mounted into the container at /shared —
// the streamed app can open the room's exported design files from there.
export const APPS_DIR =
  process.env.APPS_DIR || path.join(process.cwd(), "data", "apps");

export const writeAppFiles = (
  roomId: string,
  files: { name: string; content: string }[]
) => {
  const dir = path.join(APPS_DIR, roomId);
  fs.mkdirSync(dir, { recursive: true });
  files.forEach(({ name, content }) => {
    const safe = path.basename(name);
    fs.writeFileSync(path.join(dir, safe), content);
  });
  return dir;
};

// Streamable desktop apps: LinuxServer.io images ship app + KasmVNC
// web UI on container port 3000.
const APPS: Record<string, { image: string; port: number; label: string }> = {
  freecad: {
    image: "lscr.io/linuxserver/freecad:latest",
    port: 3000,
    label: "FreeCAD",
  },
  blender: {
    image: "lscr.io/linuxserver/blender:latest",
    port: 3000,
    label: "Blender",
  },
};

export const appKeys = Object.keys(APPS);
export const appLabel = (key: string) => APPS[key]?.label || key;

export const dockerAvailable = async (): Promise<boolean> => {
  try {
    await run("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
};

const containerName = (roomId: string, appKey: string) =>
  `collabo-${roomId}-${appKey}`;

// Maps a container's web port to a random host port; returns the host port.
export const startAppContainer = async (
  roomId: string,
  appKey: string
): Promise<{ containerId: string; port: number; password: string }> => {
  const app = APPS[appKey];
  if (!app) throw new Error(`Unknown app: ${appKey}`);

  const name = containerName(roomId, appKey);
  const password = Math.random().toString(36).slice(2, 10);
  await run("docker", ["rm", "-f", name]).catch(() => {});

  const { stdout } = await run(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "--label",
      `collabo-room=${roomId}`,
      "--label",
      "collabo-managed=1",
      "-e",
      "PUID=1000",
      "-e",
      "PGID=1000",
      "-e",
      `PASSWORD=${password}`,
      "-v",
      `${path.join(APPS_DIR, roomId)}:/shared`,
      "-p",
      `0:${app.port}`,
      "--shm-size=1g",
      app.image,
    ],
    { timeout: 600000 } // first pull of a multi-GB image can take minutes
  );
  const containerId = stdout.trim();

  const { stdout: portOut } = await run("docker", [
    "port",
    containerId,
    `${app.port}/tcp`,
  ]);
  const port = parseInt(portOut.trim().split(":").pop() || "0", 10);
  if (!port) throw new Error("No host port mapped");

  return { containerId, port, password };
};

// Poll until the KasmVNC web UI answers (first boot takes ~10-40s).
export const waitForApp = async (
  port: number,
  timeoutMs = 120000
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
};

export const stopAppContainer = async (containerId: string) => {
  await run("docker", ["rm", "-f", containerId]).catch(() => {});
};

// Reap any collabo-managed containers left behind by a crash/restart.
export const reapOrphanedContainers = async () => {
  try {
    const { stdout } = await run("docker", [
      "ps",
      "-aq",
      "--filter",
      "label=collabo-managed=1",
    ]);
    const ids = stdout.trim().split("\n").filter(Boolean);
    if (ids.length) {
      console.log(`[apps] reaping ${ids.length} orphaned container(s)`);
      await run("docker", ["rm", "-f", ...ids]).catch(() => {});
    }
  } catch {
    /* docker not available */
  }
};
