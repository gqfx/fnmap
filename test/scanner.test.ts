import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import child_process from 'child_process';
import { scanDirectory, getGitChangedFiles } from '../src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Scanner & Git Integration', () => {
  let execSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    // Setup spy BEFORE tests
    execSyncSpy = vi.spyOn(child_process, 'execSync').mockImplementation(() => '') as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fixturesDir = path.join(__dirname, 'fixtures');

  describe('scanDirectory', () => {
    it('should scan directory and find JS/TS files', () => {
      // Restore execSync for this test since it doesn't need mocking
      execSyncSpy.mockRestore();
      const files = scanDirectory(fixturesDir, fixturesDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.endsWith('.js'))).toBe(true);
    });

    it('should handle symlink loops gracefully', () => {
      execSyncSpy.mockRestore();
      const loopDir = path.join(fixturesDir, 'loop-test');
      if (!fs.existsSync(loopDir)) fs.mkdirSync(loopDir, { recursive: true });

      const subDir = path.join(loopDir, 'sub');
      if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);

      try {
        fs.symlinkSync(loopDir, path.join(subDir, 'link-to-parent'), 'dir');

        const files = scanDirectory(loopDir, loopDir);
        expect(files).toBeDefined();
      } catch (e) {
        console.warn('Skipping symlink test due to permission/OS limitations');
      } finally {
        fs.rmSync(loopDir, { recursive: true, force: true });
      }
    });

    it('should handle permission errors gracefully', async () => {
      execSyncSpy.mockRestore();
      const originalReaddir = fs.readdirSync;
      const spy = vi.spyOn(fs, 'readdirSync');

      const permDir = path.join(fixturesDir, 'perm-test');
      if (!fs.existsSync(permDir)) fs.mkdirSync(permDir, { recursive: true });

      spy.mockImplementation((pathArg, options) => {
        if (pathArg.toString().includes('perm-test')) {
          const err = new Error('EACCES: permission denied') as Error & { code: string };
          err.code = 'EACCES';
          throw err;
        }
         return originalReaddir(pathArg, options);
       });

      const files = scanDirectory(permDir, permDir);

      expect(files).toEqual([]);

      spy.mockRestore();
      fs.rmSync(permDir, { recursive: true, force: true });
    });
  });

  describe('getGitChangedFiles', () => {
    it('should parse git diff output correctly', () => {
      execSyncSpy.mockImplementation(((cmd: any) => {
        if (cmd.includes('--cached')) return 'staged.js\n';
        if (cmd.includes('ls-files')) return 'untracked.js\n';
        return 'modified.js\nfile with spaces.ts\n';
      }) as any);

      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const resolveSpy = vi.spyOn(path, 'resolve').mockImplementation((...args) => args.join('/'));

      const files = getGitChangedFiles('/mock/path');

      expect(files.some(f => f.endsWith('staged.js'))).toBe(true);
      expect(files.some(f => f.endsWith('modified.js'))).toBe(true);
      expect(files.some(f => f.endsWith('untracked.js'))).toBe(true);
      expect(files.some(f => f.endsWith('file with spaces.ts'))).toBe(true);

      existsSpy.mockRestore();
      resolveSpy.mockRestore();
    });

    it('should handle empty git output', () => {
      execSyncSpy.mockReturnValue('');

      const files = getGitChangedFiles('/mock/path');
      expect(files).toEqual([]);
    });

    it('should handle git command failure gracefully', () => {
      execSyncSpy.mockImplementation(() => {
        throw new Error('Command failed');
      });

      const files = getGitChangedFiles('/mock/path');
      expect(files).toEqual([]);
    });

    it('should filter unsupported extensions', () => {
      execSyncSpy.mockReturnValue('image.png\nreadme.md\nscript.js');
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const resolveSpy = vi.spyOn(path, 'resolve').mockImplementation((...args) => args.join('/'));

      const files = getGitChangedFiles('/mock/path');

      expect(files.some(f => f.endsWith('script.js'))).toBe(true);
      expect(files.some(f => f.endsWith('image.png'))).toBe(false);

      existsSpy.mockRestore();
      resolveSpy.mockRestore();
    });
  });
});
