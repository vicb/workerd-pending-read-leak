# workerd: a pending `read()` on an unreachable ReadableStream is never garbage collected

If a `ReadableStream` becomes unreachable while a `reader.read()` is still pending, workerd
never collects the read promise. Everything its continuation captures stays alive for the
lifetime of the isolate. Node.js collects the same code.

```js
const payload = { data: "x".repeat(1024 * 1024) };
const reader = new ReadableStream().getReader();
reader.read().then(() => payload.data.length); // never settles
// No reference to the stream, the reader, the promise or the payload is kept.
// workerd: `payload` is never collected.  Node.js: collected.
```

## Run

```sh
npm install
npm test
```

`npm test` runs the same code ([leak.js](leak.js)) twice: in Node.js (`node --expose-gc`),
then in workerd (`workerd serve config.capnp`, with `v8Flags = ["--expose-gc"]`). It
allocates 20 payloads of ~1 MB that are only reachable from a pending `read()`
continuation, drops every reference, and keeps only `WeakRef`s. A later task (a separate
request in workerd) runs `gc()` and counts the payloads still alive.

## Result

workerd 1.20261015.1 (`workerd 2026-10-15`), Node.js 24.20.0, macOS arm64:

```
node     alive after GC: 0/20
workerd  alive after GC: 20/20
```

The payloads are freed on workerd too if the read resolves (a chunk is enqueued) or is
rejected (`reader.releaseLock()`), so the leak needs a read request that stays pending.

## Heap snapshot

Taken through the inspector after a few leaking requests. The retainer path of a leaked
payload string is:

```
(GC roots)
  -> (Global handles)
    -> Promise                          <- the read() promise, held by a strong global handle
      -> PromiseReaction
        -> Promise
          -> PromiseReaction
            -> closure                  <- the read() continuation
              -> Context -> payload -> string
```

The `ReadableStream`, `ReadableStreamDefaultReader` and `ReadableStreamDefaultController`
wrappers do not show up in the snapshot (they are collected). Only the read promise is
rooted, through a strong global handle.

## Likely cause

`src/workerd/api/streams/queue.h`, `ConsumerImpl::visitForGc` intentionally does not GC-visit
the pending read requests:

```cpp
  void visitForGc(jsg::GcVisitor& visitor) {
    // Technically we shouldn't really have to GC visit the stored error here but there
    // should not be any harm in doing so.
    KJ_IF_SOME(errored, state.tryGetErrorUnsafe()) {
      visitor.visit(errored.reason);
    }
    // There's no reason to GC visit the promise resolver or buffer in Ready state and it is
    // potentially problematic if we do. Since the read requests are queued, if we
    // GC visit it once, remove it from the queue, and GC happens to kick in before
    // we access the resolver, then v8 could determine that the resolver or buffered
    // entries are no longer reachable via tracing and free them before we can
    // actually try to access the held resolver.
  }
```

A `jsg` handle that is not traced is a strong V8 global, so the `ReadRequest` resolver (and
its promise and reactions) stays a GC root. Since the stream wrappers are collected but the
handle survives, something else must also keep the consumer / its read requests alive after
the JS objects are gone. I did not track that down.

## Real-world impact

Next.js deliberately leaves some RSC streams open when it prerenders a page (it relies on GC
to reclaim them). On Cloudflare Workers, every page prerendered at runtime (ISR) retains its
RSC payload (~1.4 MB per render for a 600 KB page) until the isolate hits its memory limit:
https://github.com/opennextjs/opennextjs-cloudflare/issues/1455
