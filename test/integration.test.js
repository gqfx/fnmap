import { describe, it, expect } from 'vitest';
import { processFile } from '../index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('processFile - Integration Tests', () => {
  it('should process a valid JavaScript file successfully', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.js');
    const result = processFile(filePath, {});

    expect(result.success).toBe(true);
    expect(result.info).toBeDefined();
    expect(result.info.functions).toBeDefined();
    expect(result.info.functions.length).toBeGreaterThan(0);
  });

  it('should process a TypeScript file successfully', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.ts');
    const result = processFile(filePath, {});

    expect(result.success).toBe(true);
    expect(result.info).toBeDefined();
    expect(result.info.classes).toBeDefined();
  });

  it('should handle file not found error', () => {
    const filePath = path.join(__dirname, 'fixtures/nonexistent.js');
    const result = processFile(filePath, {});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorType).toBe('FILE_NOT_FOUND');
  });

  it('should handle parse errors', () => {
    const filePath = path.join(__dirname, 'fixtures/sample-error.js');
    const result = processFile(filePath, {});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorType).toBe('PARSE_ERROR');
  });

  it('should extract complete file information', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.js');
    const result = processFile(filePath, {});

    expect(result.success).toBe(true);
    expect(result.info.imports).toBeDefined();
    expect(result.info.functions).toBeDefined();
    expect(result.info.classes).toBeDefined();
    expect(result.info.constants).toBeDefined();
    expect(result.info.callGraph).toBeDefined();
  });

  it('should handle class files correctly', () => {
    const filePath = path.join(__dirname, 'fixtures/sample-class.js');
    const result = processFile(filePath, {});

    expect(result.success).toBe(true);
    expect(result.info.classes).toHaveLength(1);
    
    const myClass = result.info.classes[0];
    expect(myClass.name).toBe('MyClass');
    expect(myClass.superClass).toBe('EventEmitter');
    expect(myClass.methods.length).toBeGreaterThan(0);
  });
});

describe('End-to-End Workflow', () => {
  it('should analyze file and generate all outputs', () => {
    const filePath = path.join(__dirname, 'fixtures/sample.js');
    const result = processFile(filePath, {});

    expect(result.success).toBe(true);

    // 可以生成 header
    const { generateHeader } = require('../index.js');
    const header = generateHeader(result.info, 'sample.js');
    expect(header).toContain('/*@AI');
    expect(header).toContain('@AI*/');

    // 可以生成 mermaid
    const { generateFileMermaid } = require('../index.js');
    const mermaid = generateFileMermaid('sample.js', result.info);
    expect(mermaid).toBeDefined();
    expect(mermaid).toContain('flowchart TD');
  });
});
