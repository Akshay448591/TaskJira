import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

function runInstall(dirName) {
  const targetDir = path.join(rootDir, dirName);
  console.log(`\n=== Installing dependencies in ${dirName} (${targetDir}) ===`);
  const result = spawnSync(npmCmd, ['install'], {
    cwd: targetDir,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    console.error(`Error installing dependencies in ${dirName}`);
    process.exit(result.status ?? 1);
  }
}

console.log('Starting full project install...');
runInstall('server');
runInstall('client');
console.log('\nAll dependencies installed successfully!');
