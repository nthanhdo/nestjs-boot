import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigWatcher, createDevConfigWatcher } from '../../src/config/config-watcher';

function writeTempEnv(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nestjs-boot-test-'));
  const filePath = path.join(dir, '.env');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('ConfigWatcher', () => {
  afterEach(() => {
    // Restore NODE_ENV
    delete process.env.NODE_ENV;
  });

  it('throws when called in production', () => {
    process.env.NODE_ENV = 'production';
    const watcher = new ConfigWatcher();
    expect(() => watcher.watch('.env', () => {})).toThrow(
      'ConfigWatcher.watch() called in production',
    );
  });

  it('throws when the target file does not exist', () => {
    process.env.NODE_ENV = 'development';
    const watcher = new ConfigWatcher();
    expect(() =>
      watcher.watch('/tmp/nestjs-boot-nonexistent-abc123.env', () => {}),
    ).toThrow('File not found');
  });

  it('notifies onChange callback when the file is modified', (done) => {
    process.env.NODE_ENV = 'development';
    const envPath = writeTempEnv('KEY=value1');

    const watcher = new ConfigWatcher();
    watcher.watch(envPath, (changedPath) => {
      expect(changedPath).toBe(path.resolve(envPath));
      watcher.stop();
      // Clean up temp file
      try { fs.unlinkSync(envPath); } catch {}
      done();
    });

    // Trigger change after a short delay
    setTimeout(() => {
      fs.writeFileSync(envPath, 'KEY=value2', 'utf-8');
    }, 50);
  }, 3000);
});
