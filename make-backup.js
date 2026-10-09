/*
 * Builds apps-backup.json: a snapshot of what the page would show, using the
 * exact same code the page uses. The page falls back to this file whenever
 * GitHub's API can't be reached.
 *
 * Run it yourself with:  node scripts/make-backup.js
 * (Node 18 or newer.) The GitHub Action in .github/workflows runs it for you.
 */
const fs = require('fs');
const path = require('path');
const { normalizeConfig, fetchApps } = require('../app.js');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'apps-backup.json');

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'apps.json'), 'utf8'));
  const config = normalizeConfig(raw);

  // fetchApps throws if anything fails, so a bad run never overwrites a good snapshot.
  const data = await fetchApps(config);
  if (!data.apps.length) throw new Error('No apps were found, so the old snapshot was kept.');

  // Leave the file alone when nothing changed, so the repository history stays quiet.
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (err) { /* first run */ }
  const same = previous &&
    JSON.stringify(previous.apps) === JSON.stringify(data.apps) &&
    JSON.stringify(previous.config) === JSON.stringify(raw);
  if (same) {
    console.log('Snapshot already up to date.');
    return;
  }

  const out = { generated: new Date().toISOString(), config: raw, apps: data.apps };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote apps-backup.json with ${data.apps.length} app(s).`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
