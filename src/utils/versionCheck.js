// Long-lived mobile tabs (switched away to another app, then back, rather
// than reloaded) keep running whatever JS was loaded whenever the tab was
// first opened - a deploy landing on the server changes nothing for them
// until an actual navigation/reload happens. That silently invalidates any
// amount of testing against a fixed bug: the tab is still running the old,
// broken code, with no indication anything is stale. This watches
// version.json (written fresh on every deploy, see deploy.yml) and prompts
// a reload the next time the tab becomes visible after a new version ships.
const VERSION_URL = `${process.env.PUBLIC_URL || ''}/version.json`;

const fetchBuildId = async () => {
  const response = await fetch(VERSION_URL, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.buildId || null;
};

export const startVersionWatcher = onNewVersion => {
  let baselineBuildId = null;
  let notified = false;

  const checkForNewVersion = async () => {
    if (notified) return;
    try {
      const currentBuildId = await fetchBuildId();
      if (!currentBuildId) return;
      if (baselineBuildId === null) {
        baselineBuildId = currentBuildId;
        return;
      }
      if (currentBuildId !== baselineBuildId) {
        notified = true;
        onNewVersion();
      }
    } catch {
      // No network / version.json unavailable - nothing to report.
    }
  };

  checkForNewVersion();

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkForNewVersion();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', checkForNewVersion);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', checkForNewVersion);
  };
};
