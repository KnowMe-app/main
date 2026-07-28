const { enqueueUserWrite } = require('./userWriteQueue');

describe('enqueueUserWrite', () => {
  it('runs same-key tasks strictly one after another, in call order', async () => {
    const order = [];
    const deferred = () => {
      let resolve;
      const promise = new Promise(r => { resolve = r; });
      return { promise, resolve };
    };
    const first = deferred();

    const p1 = enqueueUserWrite('user1', async () => {
      order.push('start1');
      await first.promise;
      order.push('end1');
    });
    const p2 = enqueueUserWrite('user1', async () => {
      order.push('start2');
      order.push('end2');
    });

    // p2's task must not have started yet — it is queued behind p1.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['start1']);

    first.resolve();
    await Promise.all([p1, p2]);

    expect(order).toEqual(['start1', 'end1', 'start2', 'end2']);
  });

  it('runs different-key tasks independently, without waiting on each other', async () => {
    const order = [];
    const deferred = () => {
      let resolve;
      const promise = new Promise(r => { resolve = r; });
      return { promise, resolve };
    };
    const blockerA = deferred();

    const pA = enqueueUserWrite('userA', async () => {
      order.push('startA');
      await blockerA.promise;
      order.push('endA');
    });
    const pB = enqueueUserWrite('userB', async () => {
      order.push('startB');
      order.push('endB');
    });

    await pB;
    // userB's task completed even though userA's task is still pending.
    expect(order).toEqual(['startA', 'startB', 'endB']);

    blockerA.resolve();
    await pA;
    expect(order).toEqual(['startA', 'startB', 'endB', 'endA']);
  });

  it('a rejected task does not block the next queued task for the same key', async () => {
    const order = [];

    const p1 = enqueueUserWrite('user1', async () => {
      order.push('fail1');
      throw new Error('boom');
    });
    const p2 = enqueueUserWrite('user1', async () => {
      order.push('ok2');
      return 'done';
    });

    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe('done');
    expect(order).toEqual(['fail1', 'ok2']);
  });

  it('reflects each task result/rejection back to its own caller', async () => {
    const pOk = enqueueUserWrite('user2', async () => 'value');
    await expect(pOk).resolves.toBe('value');

    const pFail = enqueueUserWrite('user2', async () => {
      throw new Error('nope');
    });
    await expect(pFail).rejects.toThrow('nope');
  });
});
