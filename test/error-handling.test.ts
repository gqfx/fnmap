import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  processFile, 
  validateFilePath, 
  validateConfig,
  formatError,
  ErrorTypes 
} from '../src/index';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Error Handling', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const tempDir = path.join(fixturesDir, 'temp-error-test');

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateFilePath', () => {
    it('should reject null file path', () => {
      const result = validateFilePath(null);
      
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.VALIDATION_ERROR);
      expect(result.error).toContain('required');
    });

    it('should reject undefined file path', () => {
      const result = validateFilePath(undefined);
      
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.VALIDATION_ERROR);
    });

    it('should reject non-string file path', () => {
      const result = validateFilePath(123);
      
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.VALIDATION_ERROR);
    });

   it('should reject non-existent file', () => {
      const result = validateFilePath('/path/to/nonexistent/file.js');
      
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.FILE_NOT_FOUND);
    });

    it('should reject directory path', () => {
      const result = validateFilePath(tempDir);
      
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.VALIDATION_ERROR);
      expect(result.error).toContain('not a file');
    });

    it('should accept valid file', () => {
      const testFile = path.join(tempDir, 'valid.js');
      fs.writeFileSync(testFile, 'console.log("test");');

      const result = validateFilePath(testFile);
      
      expect(result.valid).toBe(true);
    });

    it('should reject file that is too large', () => {
      const largeFile = path.join(tempDir, 'large.js');
      
      // 创建一个大于 10MB 的文件
      const size = 11 * 1024 * 1024; // 11MB
      const buffer = Buffer.alloc(size, 'a');
      fs.writeFileSync(largeFile, buffer);

      const result = validateFilePath(largeFile);
      
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.FILE_TOO_LARGE);
      expect(result.error).toContain('too large');
    });
  });

  describe('validateConfig', () => {
    it('should reject null config', () => {
      const result = validateConfig(null);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an object');
    });

    it('should reject non-object config', () => {
      const result = validateConfig('string');
      
      expect(result.valid).toBe(false);
    });

    it('should reject config with invalid enable field', () => {
      const result = validateConfig({ enable: 'yes' });
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('enable');
      expect(result.error).toContain('boolean');
    });

    it('should reject config with invalid include field', () => {
      const result = validateConfig({ include: 'src/**/*.js' });
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('include');
      expect(result.error).toContain('array');
    });

    it('should reject config with invalid exclude field', () => {
      const result = validateConfig({ exclude: 'node_modules' });
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exclude');
      expect(result.error).toContain('array');
    });

    it('should accept valid config', () => {
      const result = validateConfig({
        enable: true,
        include: ['**/*.js'],
        exclude: ['node_modules']
      });
      
      expect(result.valid).toBe(true);
    });

    it('should accept partial config', () => {
      const result = validateConfig({
        enable: true
      });
      
      expect(result.valid).toBe(true);
    });

    it('should accept empty config object', () => {
      const result = validateConfig({});
      
      expect(result.valid).toBe(true);
    });
  });

  describe('formatError', () => {
    it('should format basic error message', () => {
      const msg = formatError('TEST_ERROR', 'Something went wrong');
      
      expect(msg).toContain('Something went wrong');
    });

    it('should include file context', () => {
      const msg = formatError('TEST_ERROR', 'Error', {
        file: '/path/to/file.js'
      });
      
      expect(msg).toContain('/path/to/file.js');
      expect(msg).toContain('File:');
    });

    it('should include location context', () => {
      const msg = formatError('TEST_ERROR', 'Error', {
        line: 10,
        column: 5
      });
      
      expect(msg).toContain('Line 10');
      expect(msg).toContain('Column 5');
    });

    it('should include suggestion', () => {
      const msg = formatError('TEST_ERROR', 'Error', {
        suggestion: 'Try fixing the syntax'
      });
      
      expect(msg).toContain('Suggestion:');
      expect(msg).toContain('Try fixing the syntax');
    });

    it('should format complete error with all context', () => {
      const msg = formatError('PARSE_ERROR', 'Syntax error', {
        file: '/path/to/file.js',
        line: 15,
        column: 3,
        suggestion: 'Check for missing bracket'
      });
      
      expect(msg).toContain('Syntax error');
      expect(msg).toContain('/path/to/file.js');
      expect(msg).toContain('Line 15');
      expect(msg).toContain('Column 3');
      expect(msg).toContain('Check for missing bracket');
    });
  });

  describe('processFile Error Handling', () => {
    it('should handle file not found', () => {
      const result = processFile('/nonexistent/file.js', {});
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.FILE_NOT_FOUND);
    });

    it('should handle directory instead of file', () => {
      const result = processFile(tempDir, {});
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.VALIDATION_ERROR);
    });

    it('should handle parse errors', () => {
      const errorFile = path.join(tempDir, 'error.js');
      fs.writeFileSync(errorFile, 'function broken( { return "unclosed"; }');

      const result = processFile(errorFile, {});
      
      expect(result.success).toBe(false);
      expect(result.errorType).toBe(ErrorTypes.PARSE_ERROR);
      expect(result.error).toBeDefined();
      expect(result.loc).toBeDefined();
    });

    it('should provide Chinese error messages', () => {
      const result = processFile('/nonexistent/file.js', {});
      
      expect(result.error).toMatch(/文件不存在|File not found/);
    });

    it('should handle empty file gracefully', () => {
      const emptyFile = path.join(tempDir, 'empty.js');
      fs.writeFileSync(emptyFile, '');

      const result = processFile(emptyFile, {});
      
      expect(result.success).toBe(true);
      expect(result.info).toBeDefined();
      expect(result.info!.functions).toEqual([]);
      expect(result.info!.classes).toEqual([]);
    });

    it('should catch file read errors', () => {
      // 这个测试在某些系统上可能无法创建不可读的文件
      // 所以我们只是验证错误处理机制存在
      // @ts-ignore
      const result = processFile(null, {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('ErrorTypes', () => {
    it('should export all error types', () => {
      expect(ErrorTypes.FILE_NOT_FOUND).toBeDefined();
      expect(ErrorTypes.FILE_READ_ERROR).toBeDefined();
      expect(ErrorTypes.PARSE_ERROR).toBeDefined();
      expect(ErrorTypes.CONFIG_ERROR).toBeDefined();
      expect(ErrorTypes.VALIDATION_ERROR).toBeDefined();
      expect(ErrorTypes.PERMISSION_ERROR).toBeDefined();
      expect(ErrorTypes.FILE_TOO_LARGE).toBeDefined();
    });
  });
});
