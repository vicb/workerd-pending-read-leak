// Starts workerd with config.capnp and runs the repro against it.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = "http://127.0.0.1:8787";

const workerd = spawn("node_modules/.bin/workerd", ["serve", "config.capnp"], { stdio: ["ignore", "inherit", "inherit"] });
process.on("exit", () => workerd.kill());

for (let i = 0; ; i++) {
  try {
    await fetch(`${BASE}/`);
    break;
  } catch {
    if (i > 100) throw new Error("workerd did not start");
    await sleep(100);
  }
}

await (await fetch(`${BASE}/run`)).text();
const { alive, total } = await (await fetch(`${BASE}/check`)).json();
console.log(`workerd  alive after GC: ${alive}/${total}`);
process.exit(0);
