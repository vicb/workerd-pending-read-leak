// Shared by workerd (worker.js) and Node.js (node.mjs).
//
// Allocates ~1 MB payloads that are only reachable from the continuation of a
// pending `reader.read()` on a never-closed stream, and drops every reference to
// the stream, the reader and the payload. Returns WeakRefs to the payloads so the
// caller can check, after a full GC, whether they were collected.

const COUNT = 20;

/**
 * Create `COUNT` payloads only reachable from a pending read() continuation.
 *
 * @returns {WeakRef<object>[]} WeakRefs to the payloads.
 */
export function run() {
  return Array.from({ length: COUNT }, () => {
    // A JS string so that it lives on the V8 heap.
    const payload = { data: "x".repeat(1024 * 1024) + Math.random() };
    const reader = new ReadableStream().getReader();
    reader.read().then(() => payload.data.length); // never settles
    return new WeakRef(payload);
  });
}

/**
 * Count how many payloads are still alive.
 *
 * Must be called in a later task than `run()` (WeakRef targets are kept alive
 * until the end of the current job) and after a full GC.
 *
 * @param {WeakRef<object>[]} refs
 * @returns {number}
 */
export function countAlive(refs) {
  return refs.filter((r) => r.deref() !== undefined).length;
}
