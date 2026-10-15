// Runs the same code in Node.js. Must be started with `--expose-gc`.
import { setTimeout as sleep } from "node:timers/promises";

import { countAlive, run } from "./leak.js";

const refs = run();
await sleep(10);
gc();
await sleep(10);
gc();
console.log(`node     alive after GC: ${countAlive(refs)}/${refs.length}`);
