import { describe, it, expect } from 'vitest';
import { processFile, generateHeader, generateFileMermaid, isProcessSuccess, isProcessFailure } from '../src/index';
import type { ProcessSuccess, ProcessFailure } from '../src/index';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('processFile - Integration Tests', () => {
  it('should process a valid JavaScript file successfully', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.js');
    const result = processFile(filePath);

    expect(isProcessSuccess(result)).toBe(true);
    const success = result as ProcessSuccess;
    expect(success.info).toBeDefined();
    expect(success.info.functions).toBeDefined();
    expect(success.info.functions.length).toBeGreaterThan(0);
  });

  it('should process a TypeScript file successfully', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.ts');
    const result = processFile(filePath);

    expect(isProcessSuccess(result)).toBe(true);
    const success = result as ProcessSuccess;
    expect(success.info).toBeDefined();
    expect(success.info.classes).toBeDefined();
  });

  it('should handle file not found error', () => {
    const filePath = path.join(__dirname, 'fixtures/nonexistent.js');
    const result = processFile(filePath);

    expect(isProcessFailure(result)).toBe(true);
    const failure = result as ProcessFailure;
    expect(failure.error).toBeDefined();
    expect(failure.errorType).toBe('FILE_NOT_FOUND');
  });

  it('should handle parse errors', () => {
    const filePath = path.join(__dirname, 'fixtures/sample-error.js');
    const result = processFile(filePath);

    expect(isProcessFailure(result)).toBe(true);
    const failure = result as ProcessFailure;
    expect(failure.error).toBeDefined();
    expect(failure.errorType).toBe('PARSE_ERROR');
  });

  it('should extract complete file information', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.js');
    const result = processFile(filePath);

    expect(isProcessSuccess(result)).toBe(true);
    const success = result as ProcessSuccess;
    expect(success.info.imports).toBeDefined();
    expect(success.info.functions).toBeDefined();
    expect(success.info.classes).toBeDefined();
    expect(success.info.constants).toBeDefined();
    expect(success.info.callGraph).toBeDefined();
  });

  it('should handle class files correctly', () => {
    const filePath = path.join(__dirname, 'fixtures/sample-class.js');
    const result = processFile(filePath);

    expect(isProcessSuccess(result)).toBe(true);
    const success = result as ProcessSuccess;
    expect(success.info.classes).toHaveLength(1);

    const myClass = success.info.classes[0];
    expect(myClass!.name).toBe('MyClass');
    expect(myClass!.superClass).toBe('EventEmitter');
    expect(myClass!.methods.length).toBeGreaterThan(0);
  });
});

describe('End-to-End Workflow', () => {
  it('should analyze file and generate all outputs', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.js');
    const result = processFile(filePath);

    expect(isProcessSuccess(result)).toBe(true);
    const success = result as ProcessSuccess;

    // 可以生成 header
    const header = generateHeader(success.info, 'sample.js');
    expect(header).toContain('/*@AI');
    expect(header).toContain('@AI*/');

    // 可以生成 mermaid
    const mermaid = generateFileMermaid('sample.js', success.info);
    expect(mermaid).toBeDefined();
    expect(mermaid).toContain('flowchart TD');
  });
});
