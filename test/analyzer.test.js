import { describe, it, expect } from 'vitest';
import { analyzeFile } from '../index.js';
import fs from 'fs';
import path from 'path';

describe('analyzeFile', () => {
  it('should analyze a simple JavaScript file', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    expect(result).toBeDefined();
    expect(result.parseError).toBeUndefined();
    expect(result.functions).toHaveLength(3);
    expect(result.functions[0].name).toBe('add');
    expect(result.functions[0].params).toBe('a,b');
    expect(result.functions[0].description).toContain('Add two numbers');
  });

  it('should extract function parameters correctly', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    const calculateFn = result.functions.find(f => f.name === 'calculate');
    expect(calculateFn).toBeDefined();
    expect(calculateFn.params).toBe('x,y,z');
  });

  it('should detect constants', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    expect(result.constants).toHaveLength(1);
    expect(result.constants[0].name).toBe('MAX_SIZE');
  });

  it('should parse imports', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    expect(result.imports).toHaveLength(2);
    const fsImport = result.imports.find(imp => imp.module === 'fs');
    expect(fsImport).toBeDefined();
    expect(fsImport.members).toContain('fs');
  });

  it('should analyze TypeScript files', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.ts'), 'utf-8');
    const result = analyzeFile(code, 'sample.ts');

    expect(result).toBeDefined();
    expect(result.parseError).toBeUndefined();
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe('UserManager');
  });

  it('should extract class methods', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample-class.js'), 'utf-8');
    const result = analyzeFile(code, 'sample-class.js');

    expect(result.classes).toHaveLength(1);
    const myClass = result.classes[0];
    expect(myClass.name).toBe('MyClass');
    expect(myClass.superClass).toBe('EventEmitter');
    expect(myClass.methods).toHaveLength(4); // constructor, increment, getCount, create
    
    const staticMethod = myClass.methods.find(m => m.name === 'create');
    expect(staticMethod).toBeDefined();
    expect(staticMethod.static).toBe(true);
  });

  it('should build call graph', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    expect(result.callGraph).toBeDefined();
    expect(result.callGraph.calculate).toBeDefined();
    expect(result.callGraph.calculate).toContain('add');
    expect(result.callGraph.calculate).toContain('multiply');
  });

  it('should handle parse errors gracefully', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample-error.js'), 'utf-8');
    const result = analyzeFile(code, 'sample-error.js');

    expect(result.parseError).toBeDefined();
    expect(result.loc).toBeDefined();
  });

  it('should extract JSDoc descriptions', () => {
    const code = `
/**
 * This is a test function
 * It does something useful
 * @param {string} name - The name
 * @returns {string} The result
 */
function test(name) {
  return name;
}
    `;
    const result = analyzeFile(code, 'test.js');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].description).toContain('This is a test function');
  });

  it('should handle arrow functions', () => {
    const code = `
const arrow = (x, y) => x + y;
const arrowBlock = (a, b) => {
  return a * b;
};
    `;
    const result = analyzeFile(code, 'arrow.js');

    expect(result).toBeDefined();
    expect(result.parseError).toBeUndefined();
  });

  it('should handle default parameters', () => {
    const code = `
function withDefaults(a, b = 10, c = 20) {
  return a + b + c;
}
    `;
    const result = analyzeFile(code, 'defaults.js');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].params).toBe('a,b?,c?');
  });

  it('should handle rest parameters', () => {
    const code = `
function withRest(first, ...rest) {
  return [first, ...rest];
}
    `;
    const result = analyzeFile(code, 'rest.js');

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].params).toBe('first,...rest');
  });
});
