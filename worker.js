// workerd entry point. `gc()` is exposed through `v8Flags = ["--expose-gc"]` in config.capnp.
//
//   GET /run    creates the payloads, keeps only WeakRefs to them
//   GET /check  forces a full GC and reports how many payloads are still alive
import { countAlive, run } from "./leak.js";

let refs = [];

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/run") {
      refs = run();
      return new Response("ok");
    }
    if (pathname === "/check") {
      gc();
      await new Promise((r) => setTimeout(r, 10));
      gc();
      return Response.json({ alive: countAlive(refs), total: refs.length });
    }
    return new Response("not found", { status: 404 });
  },
};
