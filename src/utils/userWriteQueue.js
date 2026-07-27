// Serializes async tasks per key so that, for example, two rapid writes to
// the same userId never run concurrently. Without this, two in-flight writes
// for the same card can each read a stale snapshot of the other's not-yet-
// committed change, letting one silently undo what the other just did.
const queues = new Map();

// A task that never settles (a stuck network call, a backgrounded mobile
// tab throttling a pending Firebase request...) would otherwise wedge this
// key's queue forever - every later write for the same card would queue up
// behind it and silently never run, with no error surfacing anywhere. A
// timeout guarantees the queue always keeps moving: a task that times out
// rejects (so callers can still detect and report the failure) without
// blocking whatever comes after it.
const DEFAULT_TIMEOUT_MS = 20000;

const runWithTimeout = (task, timeoutMs) => {
  if (!timeoutMs) {
    return Promise.resolve().then(task);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`enqueueUserWrite: task timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Call task() synchronously (same tick the queue would have run it in
    // without a timeout) rather than deferring through another microtask -
    // that keeps this wrapper transparent to callers relying on exactly
    // when a queued task starts.
    Promise.resolve(task()).then(
      result => {
        clearTimeout(timer);
        resolve(result);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
};

export const enqueueUserWrite = (key, task, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => runWithTimeout(task, timeoutMs));
  queues.set(key, next);
  next.catch(() => {}).finally(() => {
    if (queues.get(key) === next) {
      queues.delete(key);
    }
  });
  return next;
};
