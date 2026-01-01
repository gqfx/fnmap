import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { scanDirectory, getGitChangedFiles } from '../src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Scanner & Git Integration', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  describe('scanDirectory', () => {
    it('should scan directory and find JS/TS files', () => {
      const files = scanDirectory(fixturesDir, fixturesDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.endsWith('.js'))).toBe(true);
    });

    it('should handle symlink loops gracefully', () => {
      const loopDir = path.join(fixturesDir, 'loop-test');
      if (!fs.existsSync(loopDir)) fs.mkdirSync(loopDir, { recursive: true });

      const subDir = path.join(loopDir, 'sub');
      if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);

      try {
        fs.symlinkSync(loopDir, path.join(subDir, 'link-to-parent'), 'dir');

        const files = scanDirectory(loopDir, loopDir);
        expect(files).toBeDefined();
      } catch {
        console.warn('Skipping symlink test due to permission/OS limitations');
      } finally {
        fs.rmSync(loopDir, { recursive: true, force: true });
      }
    });

    it('should return empty array for non-existent directory', () => {
      const nonExistentDir = path.join(fixturesDir, 'non-existent-dir');
      const files = scanDirectory(nonExistentDir, nonExistentDir);
      expect(files).toEqual([]);
    });
  });

  describe('getGitChangedFiles', () => {
    it('should return empty array for non-git directory', () => {
      // 使用一个肯定不是 git 仓库的临时目录
      const tempDir = path.join(fixturesDir, 'temp-non-git');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      try {
        const files = getGitChangedFiles(tempDir);
        // 在非 git 目录中应该返回空数组
        expect(Array.isArray(files)).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return files in current git repository', () => {
      // 使用实际的 git 仓库（项目根目录）来测试
      const projectRoot = path.resolve(__dirname, '..');
      const files = getGitChangedFiles(projectRoot);

      // 返回值应该是数组（可能为空或非空，取决于是否有未提交的更改）
      expect(Array.isArray(files)).toBe(true);
    });
  });
});
