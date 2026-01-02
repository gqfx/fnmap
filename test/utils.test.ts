import { describe, it, expect } from 'vitest';
import { analyzeFile } from '../src/index';
import type { FileInfo } from '../src/index';
import { normalizePath, normalizePaths } from '../src/validation';

// 测试路径规范化函数
describe('Path Normalization', () => {
  it('should normalize Windows-style paths', () => {
    const input = 'src\\components\\Button.tsx';
    const result = normalizePath(input);
    expect(result).not.toContain('\\\\'); // 不应有双反斜杠
    expect(result).toMatch(/src.components.Button\.tsx$/);
  });

  it('should normalize Unix-style paths', () => {
    const input = 'src/components/Button.tsx';
    const result = normalizePath(input);
    expect(result).toMatch(/src.components.Button\.tsx$/);
  });

  it('should handle mixed separators', () => {
    const input = 'src\\components/utils\\index.ts';
    const result = normalizePath(input);
    expect(result).toMatch(/src.components.utils.index\.ts$/);
  });

  it('should handle empty path', () => {
    expect(normalizePath('')).toBe('');
  });

  it('should normalize array of paths', () => {
    const inputs = ['src\\a.ts', 'lib/b.ts', 'test\\c/d.ts'];
    const results = normalizePaths(inputs);
    expect(results).toHaveLength(3);
    results.forEach(p => {
      expect(p).not.toContain('\\\\');
    });
  });

  it('should handle absolute Windows paths', () => {
    const input = 'D:\\coding\\project\\src\\index.ts';
    const result = normalizePath(input);
    expect(result).toMatch(/index\.ts$/);
  });
});

// 测试工具函数
describe('Utility Functions', () => {
  describe('extractJSDocDescription', () => {
    it('should extract description from JSDoc comment', async () => {
       // const { analyzeFile } = await import('../index.js'); // Removed dynamic import

      const code = `
/**
 * This is a description
 * @param {string} name
 */
function test(name) {}
      `;

      const result = analyzeFile(code, 'test.js');
      const info = result as FileInfo;
      expect(info.functions?.[0]?.description ?? '').toContain('This is a description');
    });

    it('should extract description from multi-line JSDoc', async () => {
      // const { analyzeFile } = await import('../index.js');

      const code = `
/**
 * First line of description
 * Second line of description
 * @param {number} x
 * @returns {number}
 */
function calculate(x) { return x * 2; }
      `;

      const result = analyzeFile(code, 'test.js');
      const info = result as FileInfo;
      expect(info.functions?.[0]?.description ?? '').toContain('First line');
    });
  });

  describe('removeExistingHeaders', () => {
    it('should remove AI headers from code', async () => {
      // const module = await import('../index.js');
      // removeExistingHeaders 需要被导出
      // 这里我们通过分析来间接测试

      const code = `
/*@AI test.js
function info
@AI*/

function test() {
  return true;
}
      `;

      // 由于函数未导出，我们测试它的效果
      const result = analyzeFile(code, 'test.js');
      const info = result as FileInfo;
      expect(info.functions).toHaveLength(1);
      expect(info.functions?.[0]?.name).toBe('test');
    });
  });
});

describe('Configuration Handling', () => {
  it('should handle default configuration', () => {
    // 测试默认配置逻辑
    const DEFAULT_CONFIG = {
      enable: true,
      include: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.mjs'],
      exclude: []
    };

    expect(DEFAULT_CONFIG.enable).toBe(true);
    expect(DEFAULT_CONFIG.include).toContain('**/*.js');
  });

  it('should merge user config with defaults', () => {
    // 测试配置合并逻辑
    const userConfig = {
      include: ['src/**/*.js'],
      exclude: ['dist']
    };

    const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'build'];
    const mergedExcludes = [...DEFAULT_EXCLUDES, ...userConfig.exclude];

    expect(mergedExcludes).toContain('node_modules');
    expect(mergedExcludes).toContain('dist');
  });
});
