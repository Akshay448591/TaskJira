import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('Starting TaskJira development servers (Server on :5000, Client on :5173)...');

const serverBin = path.join(rootDir, 'server', 'node_modules', 'nodemon', 'bin', 'nodemon.js');
const clientBin = path.join(rootDir, 'client', 'node_modules', 'vite', 'bin', 'vite.js');

const serverProcess = spawn(process.execPath, [serverBin, 'src/index.js'], {
  cwd: path.join(rootDir, 'server'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '1' },
});

serverProcess.stdout.on('data', (data) => process.stdout.write(data));
serverProcess.stderr.on('data', (data) => process.stderr.write(data));

const clientProcess = spawn(process.execPath, [clientBin], {
  cwd: path.join(rootDir, 'client'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '1' },
});

clientProcess.stdout.on('data', (data) => process.stdout.write(data));
clientProcess.stderr.on('data', (data) => process.stderr.write(data));

function cleanup() {
  console.log('\nStopping servers...');
  try {
    serverProcess.kill();
    clientProcess.kill();
  } catch (err) {
    // ignore
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

serverProcess.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`Server process exited with code ${code}`);
  }
});

clientProcess.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`Client process exited with code ${code}`);
  }
});
