using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [(name = "main", worker = .worker)],
  sockets = [(name = "http", address = "127.0.0.1:8787", http = (), service = "main")],
  v8Flags = ["--expose-gc"],
);

const worker :Workerd.Worker = (
  modules = [
    (name = "worker.js", esModule = embed "worker.js"),
    (name = "leak.js", esModule = embed "leak.js"),
  ],
  compatibilityDate = "2026-10-01",
);
