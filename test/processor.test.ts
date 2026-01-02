import { describe, it, expect } from 'vitest';
import { processCode, processFile } from '../src/index';

describe('processCode', () => {
  it('should analyze code string successfully', () => {
    const code = `
function hello(name) {
  console.log('Hello', name);
}
`;
    const result = processCode(code);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.info.functions).toHaveLength(1);
      expect(result.info.functions[0]!.name).toBe('hello');
      expect(result.info.functions[0]!.params).toBe('name');
    }
  });

  it('should parse TypeScript when filePath is provided', () => {
    const code = `
interface User {
  name: string;
}

function greet(user: User): void {
  console.log(user.name);
}
`;
    const result = processCode(code, { filePath: 'test.ts' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.info.functions).toHaveLength(1);
      expect(result.info.functions[0]!.name).toBe('greet');
    }
  });

  it('should detect classes and methods', () => {
    const code = `
class Greeter {
  greet(name) {
    return 'Hello ' + name;
  }

  static create() {
    return new Greeter();
  }
}
`;
    const result = processCode(code);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.info.classes).toHaveLength(1);
      expect(result.info.classes[0]!.name).toBe('Greeter');
      expect(result.info.classes[0]!.methods).toHaveLength(2);
    }
  });

  it('should build call graph', () => {
    const code = `
function foo() {
  bar();
}

function bar() {
  console.log('bar');
}
`;
    const result = processCode(code);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.info.callGraph['foo']).toContain('bar');
    }
  });

  it('should return error for invalid syntax', () => {
    const code = `function broken( { }`;
    const result = processCode(code);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.errorType).toBe('PARSE_ERROR');
    }
  });

  it('should handle empty code', () => {
    const result = processCode('');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.info.functions).toHaveLength(0);
      expect(result.info.classes).toHaveLength(0);
    }
  });
});
