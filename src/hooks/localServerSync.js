export const createLocalFirstSync = (storageKey, initialData = null, remotePush) => {
  let data = initialData;

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        data = JSON.parse(raw);
      }
    } catch {
      // ignore parse errors
    }
  };

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // ignore write errors
    }
  };

  const push = async () => {
    if (typeof remotePush !== 'function' || !data) return;
    try {
      const res = await remotePush({ data });
      if (res) {
        data = res;
        save();
      }
    } catch {
      // ignore network errors, keep data for retry
    }
  };

  return {
    init: () => {
      load();
    },
    getData: () => data,
    update: newData => {
      data = newData;
      save();
      push();
    },
    pollServer: () => {
      push();
    },
  };
};

