import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 由于 index.js 使用 module.exports，我们需要动态导入
let scanDirectory, getGitChangedFiles, loadConfig, mergeConfig;

beforeEach(async () => {
  const module = await import('../index.js');
  scanDirectory = module.scanDirectory;
  getGitChangedFiles = module.getGitChangedFiles;
  // loadConfig 和 mergeConfig 未导出，需要添加到 index.js 的导出中
});

describe('scanDirectory', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  it('should scan directory and find JS/TS files', () => {
    const files = scanDirectory(fixturesDir, fixturesDir);

    expect(files).toBeDefined();
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.endsWith('.js'))).toBe(true);
  });

  it('should return relative paths', () => {
    const files = scanDirectory(fixturesDir, fixturesDir);

    files.forEach(file => {
      expect(path.isAbsolute(file)).toBe(false);
    });
  });

  it('should exclude specified directories', () => {
    const tempDir = path.join(fixturesDir, 'temp-test');
    const nodeModulesDir = path.join(tempDir, 'node_modules');
    
    // 创建临时测试目录
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(nodeModulesDir)) fs.mkdirSync(nodeModulesDir, { recursive: true });
    
    fs.writeFileSync(path.join(tempDir, 'test.js'), 'console.log("test");');
    fs.writeFileSync(path.join(nodeModulesDir, 'lib.js'), 'console.log("lib");');

    const files = scanDirectory(tempDir, tempDir, ['node_modules']);

    expect(files).toBeDefined();
    expect(files.some(f => f.includes('node_modules'))).toBe(false);
    expect(files.some(f => f === 'test.js')).toBe(true);

    // 清理
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should only include supported extensions', () => {
    const files = scanDirectory(fixturesDir, fixturesDir);

    files.forEach(file => {
      const ext = path.extname(file);
      expect(['.js', '.ts', '.jsx', '.tsx', '.mjs']).toContain(ext);
    });
  });
});

describe('getGitChangedFiles', () => {
  it('should return empty array if not a git repository', () => {
    const tempDir = path.join(__dirname, 'temp-no-git');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const files = getGitChangedFiles(tempDir, false);

    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBe(0);

    // 清理
    fs.rmdirSync(tempDir);
  });

  // 注意：实际的 git 测试需要在真实的 git 仓库中运行
  // 这里只测试错误处理
});
