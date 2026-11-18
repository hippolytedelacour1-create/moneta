const { copyFileSync, mkdirSync, rmSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { buildSync } = require('esbuild');

const sdk = 'app/supabase-client.js';
buildSync({
  entryPoints: ['src/supabase-client.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'MonetaSupabase',
  platform: 'browser',
  target: 'es2020',
  outfile: sdk,
  legalComments: 'eof'
});

const publishDir = 'dist';
const publicFiles = [
  '_redirects',
  'index.html',
  'app/index.html',
  'app/accounts.js',
  'app/app.js',
  'app/cloud-config.js',
  'app/data.js',
  'app/plus.js',
  'app/sync.js',
  sdk
];

rmSync(publishDir, { recursive: true, force: true });
for (const source of publicFiles) {
  const target = join(publishDir, source);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
