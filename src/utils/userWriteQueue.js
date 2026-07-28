// Serializes async tasks per key so that, for example, two rapid writes to
// the same userId never run concurrently. Without this, two in-flight writes
// for the same card can each read a stale snapshot of the other's not-yet-
// committed change, letting one silently undo what the other just did.
const queues = new Map();

export const enqueueUserWrite = (key, task) => {
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queues.set(key, next);
  next.catch(() => {}).finally(() => {
    if (queues.get(key) === next) {
      queues.delete(key);
    }
  });
  return next;
};
