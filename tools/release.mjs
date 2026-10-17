// Publishes a signed build (run `npm run sign` first):
//   1. adds the version to updates.json (the self-hosted update manifest Firefox polls),
//   2. commits and pushes that to main,
//   3. creates the GitHub release vX.Y.Z with the signed .xpi attached.
// Usage: npm run release [-- --dry-run]
import { readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REPO = 'spaceunlimited/firefox-image-collector';
const DRY = process.argv.includes('--dry-run');
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const run = (cmd, args) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  if (!DRY) execFileSync(cmd, args, { stdio: 'inherit' });
};

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const { version } = manifest;
const { id, strict_min_version: minVersion } = manifest.browser_specific_settings.gecko;
const tag = `v${version}`;

const signed = (await readdir('web-ext-artifacts').catch(() => [])).filter((f) => f.endsWith('.xpi') && f.includes(version));
if (signed.length !== 1) fail(`expected one signed web-ext-artifacts/*${version}*.xpi, found ${signed.length}. Run npm run sign first.`);
if (!DRY && out('git', ['status', '--porcelain'])) fail('the working tree has uncommitted changes; commit them first.');
if (out('git', ['tag', '--list', tag])) fail(`tag ${tag} already exists. Bump the version in manifest.json and package.json.`);

const asset = `image-collector-${version}.xpi`;
const assetPath = `web-ext-artifacts/${asset}`;
await copyFile(`web-ext-artifacts/${signed[0]}`, assetPath);
const hash = createHash('sha256').update(await readFile(assetPath)).digest('hex');

const updates = JSON.parse(await readFile('updates.json', 'utf8'));
const list = (updates.addons[id] ??= { updates: [] }).updates;
const entry = {
  version,
  update_link: `https://github.com/${REPO}/releases/download/${tag}/${asset}`,
  update_hash: `sha256:${hash}`,
  applications: { gecko: { strict_min_version: minVersion } },
};
updates.addons[id].updates = [...list.filter((u) => u.version !== version), entry];
const json = JSON.stringify(updates, null, 2) + '\n';
console.log(`updates.json entry:\n${JSON.stringify(entry, null, 2)}`);
if (!DRY) await writeFile('updates.json', json);

run('git', ['add', 'updates.json']);
run('git', ['commit', '-m', `Release ${tag}`]);
run('git', ['push', 'origin', 'main']);

const notes = `Signed by Mozilla for self-distribution.

**Install:** download \`${asset}\` below, open it in Firefox (or drag it onto a Firefox window) and confirm. Firefox checks for updates automatically.`;
run('gh', ['release', 'create', tag, assetPath, '--repo', REPO, '--target', 'main', '--title', `Image Collector ${version}`, '--notes', notes]);
console.log(DRY ? 'Dry run: nothing was changed.' : `Released ${tag}: https://github.com/${REPO}/releases/tag/${tag}`);
