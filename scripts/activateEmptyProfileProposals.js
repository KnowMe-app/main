const { readFile } = require('node:fs/promises');
const { setTimeout: wait } = require('node:timers/promises');
const { database, getFirebaseAccessToken, inspectEmptyCutover, readCutoverSnapshot } =
  require('./checkEmptyProfileProposalCutover');

const controlUrl = `${database}/profileProposalControl.json`;
const publicSite = 'https://knowme.pp.ua';

function planControlWrite(control, phase, release) {
  const { activeWriter, cleanupLease, cutoverRelease } = control ?? {};
  if (activeWriter === 'unified' && cutoverRelease === release) return null;
  if (cleanupLease != null) throw new Error('Account cleanup is in progress');
  if (phase === 'freeze') {
    if (activeWriter === 'frozen' && cutoverRelease === release) return null;
    if (activeWriter != null && activeWriter !== 'legacy') throw new Error('Expected legacy writer');
    return { ...control, activeWriter: 'frozen', cutoverRelease: release };
  }
  if (phase !== 'activate' || activeWriter !== 'frozen' || cutoverRelease !== release) {
    throw new Error('This release does not own the freeze');
  }
  return {
    ...control,
    activeWriter: 'unified',
    activatedAt: { '.sv': 'timestamp' },
  };
}

function checkQuiescent(snapshot) {
  const report = inspectEmptyCutover(snapshot);
  if (!report.liveEmpty || report.cleanupInProgress || report.pendingPublications || report.pendingReviews) {
    throw new Error('Unexpected live proposal data or a proposal operation is still in progress');
  }
  return report;
}

async function readControl(token) {
  const response = await fetch(controlUrl, {
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' },
    signal: AbortSignal.timeout(15_000),
  });
  const etag = response.headers.get('etag');
  if (!response.ok || !etag) throw new Error(`Cannot read Firebase control with ETag (HTTP ${response.status})`);
  return { etag, control: await response.json() };
}

async function writeControl(token, etag, control) {
  const response = await fetch(controlUrl, {
    redirect: 'error',
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'If-Match': etag,
    },
    body: JSON.stringify(control),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Firebase refused the conditional control write (HTTP ${response.status})`);
  return await response.json();
}

async function waitForPublishedBuild(release) {
  const { files } = JSON.parse(await readFile('build/asset-manifest.json', 'utf8'));
  const asset = files?.['main.js'];
  if (!/^\/static\/js\/main\.[a-f0-9]+\.js$/.test(asset ?? '')) {
    throw new Error('Cannot identify the local production JavaScript bundle');
  }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      const response = await fetch(`${publicSite}/?release=${release}`, {
        headers: { 'Cache-Control': 'no-cache' },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok && (await response.text()).includes(`src="${asset}"`)) {
        const bundle = await fetch(`${publicSite}${asset}`, {
          method: 'HEAD',
          redirect: 'error',
          signal: AbortSignal.timeout(8_000),
        });
        if (bundle.ok) return;
      }
    } catch {
      // Pages can briefly serve the previous deployment or be unavailable.
    }
    await wait(5_000);
  }
  throw new Error('The exact release bundle is not yet served at knowme.pp.ua');
}

async function switchWriter(token, phase, release) {
  if (phase === 'activate') await waitForPublishedBuild(release);
  const { etag, control } = await readControl(token);
  const next = planControlWrite(control, phase, release);
  if (!next && control.activeWriter === 'unified') {
    console.log('This release has already activated unified');
    return;
  }

  checkQuiescent(await readCutoverSnapshot(token));
  if (next) {
    const result = await writeControl(token, etag, next);
    if (result.activeWriter !== next.activeWriter || result.cutoverRelease !== release
      || (phase === 'activate' && !Number.isSafeInteger(result.activatedAt))) {
      throw new Error('Unexpected Firebase control response after write');
    }
  }
  if (phase === 'freeze') {
    try {
      const report = checkQuiescent(await readCutoverSnapshot(token));
      console.log(JSON.stringify(report, null, 2));
    } catch (error) {
      // If this execution froze the writer and has not published Pages, it can
      // still restore the exact prior control state for the public legacy build.
      if (next) {
        const current = await readControl(token);
        if (current.control?.activeWriter === 'frozen' && current.control?.cutoverRelease === release) {
          await writeControl(token, current.etag, control);
        }
      }
      throw error;
    }
  }
  console.log(`Proposal writer: ${phase === 'freeze' ? 'frozen' : 'unified'}`);
}

module.exports = { planControlWrite, checkQuiescent };

if (require.main === module) {
  const phase = process.argv[2];
  const release = process.env.GITHUB_SHA;
  if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_REPOSITORY !== 'KnowMe-app/main'
    || !/^[a-f0-9]{40}$/.test(release ?? '') || !['freeze', 'activate'].includes(phase)) {
    throw new Error('Run this cutover from an approved KnowMe-app/main release workflow');
  }
  getFirebaseAccessToken().then(token => switchWriter(token, phase, release)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
