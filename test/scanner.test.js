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

  // 注意:实际的 git 测试需要在真实的 git 仓库中运行
  // 这里只测试错误处理
});

// ========== 边界测试用例 ==========

describe('scanDirectory - Boundary Cases', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    // 确保 fixtures 目录存在
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
  });

  it('should handle empty directory', () => {
    const emptyDir = path.join(fixturesDir, 'empty-dir');
    if (!fs.existsSync(emptyDir)) fs.mkdirSync(emptyDir, { recursive: true });

    const files = scanDirectory(emptyDir, emptyDir);

    expect(files).toEqual([]);

    // 清理
    fs.rmdirSync(emptyDir);
  });

  it('should handle non-existent directory gracefully', () => {
    const nonExistent = path.join(fixturesDir, 'does-not-exist');

    const files = scanDirectory(nonExistent, nonExistent);

    expect(files).toEqual([]);
  });

  it('should handle very deep directory structure', () => {
    const deepBase = path.join(fixturesDir, 'deep-test');
    let deepPath = deepBase;

    // 创建深层目录结构
    for (let i = 0; i < 10; i++) {
      deepPath = path.join(deepPath, `level${i}`);
    }
    fs.mkdirSync(deepPath, { recursive: true });
    fs.writeFileSync(path.join(deepPath, 'deep.js'), 'console.log("deep");');

    const files = scanDirectory(deepBase, deepBase);

    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.endsWith('deep.js'))).toBe(true);

    // 清理
    fs.rmSync(deepBase, { recursive: true, force: true });
  });

  it('should handle special characters in filenames', () => {
    const specialDir = path.join(fixturesDir, 'special-chars');
    fs.mkdirSync(specialDir, { recursive: true });

    // 注意: 某些特殊字符在 Windows 上不允许使用
    const safeNames = ['file with spaces.js', 'file-dash.js', 'file_underscore.js'];
    safeNames.forEach(name => {
      try {
        fs.writeFileSync(path.join(specialDir, name), '// test');
      } catch (e) {
        // Skip if filename not allowed on this OS
      }
    });

    const files = scanDirectory(specialDir, specialDir);

    expect(files.length).toBeGreaterThan(0);

    // 清理
    fs.rmSync(specialDir, { recursive: true, force: true });
  });

  it('should filter non-supported extensions', () => {
    const mixedDir = path.join(fixturesDir, 'mixed-extensions');
    fs.mkdirSync(mixedDir, { recursive: true });

    fs.writeFileSync(path.join(mixedDir, 'script.js'), '// js');
    fs.writeFileSync(path.join(mixedDir, 'types.ts'), '// ts');
    fs.writeFileSync(path.join(mixedDir, 'component.jsx'), '// jsx');
    fs.writeFileSync(path.join(mixedDir, 'readme.md'), '# readme');
    fs.writeFileSync(path.join(mixedDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(mixedDir, 'style.css'), '{}');

    const files = scanDirectory(mixedDir, mixedDir);

    expect(files.every(f => {
      const ext = path.extname(f);
      return ['.js', '.ts', '.jsx', '.tsx', '.mjs'].includes(ext);
    })).toBe(true);
    expect(files.some(f => f.endsWith('.md'))).toBe(false);
    expect(files.some(f => f.endsWith('.json'))).toBe(false);

    // 清理
    fs.rmSync(mixedDir, { recursive: true, force: true });
  });

  it('should handle directories with many files', () => {
    const manyFilesDir = path.join(fixturesDir, 'many-files');
    fs.mkdirSync(manyFilesDir, { recursive: true });

    // 创建100个文件
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(path.join(manyFilesDir, `file${i}.js`), `// file ${i}`);
    }

    const files = scanDirectory(manyFilesDir, manyFilesDir);

    expect(files.length).toBe(100);

    // 清理
    fs.rmSync(manyFilesDir, { recursive: true, force: true });
  });

  it('should respect exclude patterns', () => {
    const excludeDir = path.join(fixturesDir, 'exclude-test');
    const distDir = path.join(excludeDir, 'dist');
    const srcDir = path.join(excludeDir, 'src');

    fs.mkdirSync(distDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(path.join(distDir, 'bundle.js'), '// dist');
    fs.writeFileSync(path.join(srcDir, 'source.js'), '// src');

    const files = scanDirectory(excludeDir, excludeDir, ['dist']);

    expect(files.some(f => f.includes('dist'))).toBe(false);
    expect(files.some(f => f.includes('src'))).toBe(true);

    // 清理
    fs.rmSync(excludeDir, { recursive: true, force: true });
  });

  it('should handle dot directories correctly', () => {
    const dotDir = path.join(fixturesDir, 'dot-test');
    const hiddenDir = path.join(dotDir, '.hidden');

    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.writeFileSync(path.join(hiddenDir, 'secret.js'), '// hidden');

    // .hidden is not in default excludes
    const files = scanDirectory(dotDir, dotDir);

    // 应该包含 hidden 目录中的文件(如果没有被排除)
    expect(files).toBeDefined();

    // 清理
    fs.rmSync(dotDir, { recursive: true, force: true });
  });

  it('should return relative paths correctly', () => {
    const relativeDir = path.join(fixturesDir, 'relative-test');
    const subDir = path.join(relativeDir, 'sub');

    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'file.js'), '// test');

    const files = scanDirectory(relativeDir, relativeDir);

    files.forEach(file => {
      expect(path.isAbsolute(file)).toBe(false);
      expect(file).toContain('sub');
    });

    // 清理
    fs.rmSync(relativeDir, { recursive: true, force: true });
  });
});
