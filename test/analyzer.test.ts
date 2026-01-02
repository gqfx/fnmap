import { describe, it, expect } from 'vitest';
import { analyzeFile, isParseError } from '../src/index';
import type { FileInfo, ParseErrorResult } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

describe('analyzeFile', () => {
  it('should analyze a simple JavaScript file', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    expect(result).toBeDefined();
    expect(isParseError(result)).toBe(false);
    const info = result as FileInfo;
    expect(info.functions).toHaveLength(3);
    expect(info.functions[0]!.name).toBe('add');
    expect(info.functions[0]!.params).toBe('a,b');
    expect(info.functions[0]!.description).toContain('Add two numbers');
  });

  it('should extract function parameters correctly', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    const info = result as FileInfo;
    const calculateFn = info.functions.find(f => f.name === 'calculate');
    expect(calculateFn).toBeDefined();
    expect(calculateFn!.params).toBe('x,y,z');
  });

  it('should detect constants', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    const info = result as FileInfo;
    expect(info.constants).toHaveLength(1);
    expect(info.constants[0]!.name).toBe('MAX_SIZE');
  });

  it('should parse imports', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    const info = result as FileInfo;
    expect(info.imports).toHaveLength(2);
    const fsImport = info.imports.find(imp => imp.module === 'fs');
    expect(fsImport).toBeDefined();
    expect(fsImport!.members).toContain('fs');
  });

  it('should analyze TypeScript files', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.ts'), 'utf-8');
    const result = analyzeFile(code, 'sample.ts');

    expect(result).toBeDefined();
    expect(isParseError(result)).toBe(false);
    const info = result as FileInfo;
    expect(info.classes).toHaveLength(1);
    expect(info.classes[0]!.name).toBe('UserManager');
  });

  it('should extract class methods', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample-class.js'), 'utf-8');
    const result = analyzeFile(code, 'sample-class.js');

    const info = result as FileInfo;
    expect(info.classes).toHaveLength(1);
    const myClass = info.classes[0];
    expect(myClass!.name).toBe('MyClass');
    expect(myClass!.superClass).toBe('EventEmitter');
    expect(myClass!.methods).toHaveLength(4); // constructor, increment, getCount, create

    const staticMethod = myClass!.methods.find(m => m.name === 'create');
    expect(staticMethod).toBeDefined();
    expect(staticMethod!.static).toBe(true);
  });

  it('should build call graph', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample.js'), 'utf-8');
    const result = analyzeFile(code, 'sample.js');

    const info = result as FileInfo;
    expect(info.callGraph).toBeDefined();
    expect(info.callGraph.calculate).toBeDefined();
    expect(info.callGraph.calculate).toContain('add');
    expect(info.callGraph.calculate).toContain('multiply');
  });

  it('should handle parse errors gracefully', () => {
    const code = fs.readFileSync(path.join(__dirname, 'fixtures/sample-error.js'), 'utf-8');
    const result = analyzeFile(code, 'sample-error.js');

    expect(isParseError(result)).toBe(true);
    const err = result as ParseErrorResult;
    expect(err.parseError).toBeDefined();
    expect(err.loc).toBeDefined();
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

    const info = result as FileInfo;
    expect(info.functions).toHaveLength(1);
    expect(info.functions[0]!.description).toContain('This is a test function');
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
    expect(isParseError(result)).toBe(false);
    const info = result as FileInfo;
    expect(info.functions).toHaveLength(2);
    expect(info.functions[0]!.name).toBe('arrow');
    expect(info.functions[0]!.params).toBe('x,y');
    expect(info.functions[1]!.name).toBe('arrowBlock');
    expect(info.functions[1]!.params).toBe('a,b');
  });

  it('should handle async arrow functions', () => {
    const code = `
/** 写入日志到浏览器 */
const writeLodBrowser = async () => {};

const fetchData = async (url, options) => {
  const response = await fetch(url, options);
  return response.json();
};
    `;
    const result = analyzeFile(code, 'async-arrow.js');

    expect(result).toBeDefined();
    expect(isParseError(result)).toBe(false);
    const info = result as FileInfo;
    expect(info.functions).toHaveLength(2);
    expect(info.functions[0]!.name).toBe('writeLodBrowser');
    expect(info.functions[0]!.params).toBe('');
    expect(info.functions[0]!.description).toContain('写入日志到浏览器');
    expect(info.functions[1]!.name).toBe('fetchData');
    expect(info.functions[1]!.params).toBe('url,options');
  });

  it('should handle function expressions', () => {
    const code = `
const myFunc = function(a, b) {
  return a + b;
};
const namedFunc = function calculate(x, y) {
  return x * y;
};
    `;
    const result = analyzeFile(code, 'func-expr.js');

    expect(result).toBeDefined();
    expect(isParseError(result)).toBe(false);
    const info = result as FileInfo;
    expect(info.functions).toHaveLength(2);
    expect(info.functions[0]!.name).toBe('myFunc');
    expect(info.functions[1]!.name).toBe('namedFunc');
  });

  it('should handle default parameters', () => {
    const code = `
function withDefaults(a, b = 10, c = 20) {
  return a + b + c;
}
    `;
    const result = analyzeFile(code, 'defaults.js');

    const info = result as FileInfo;
    expect(info.functions).toHaveLength(1);
    expect(info.functions[0]!.params).toBe('a,b?,c?');
  });

  it('should handle rest parameters', () => {
    const code = `
function withRest(first, ...rest) {
  return [first, ...rest];
}
    `;
    const result = analyzeFile(code, 'rest.js');

    const info = result as FileInfo;
    expect(info.functions).toHaveLength(1);
    expect(info.functions[0]!.params).toBe('first,...rest');
  });

  // ========== 边界测试用例 ==========

  describe('Boundary Cases', () => {
    it('should handle null code', () => {
      const result = analyzeFile(null, 'test.js');

      expect(isParseError(result)).toBe(true);
      const err = result as ParseErrorResult;
      expect(err.parseError).toBeDefined();
      expect(err.errorType).toBe('VALIDATION_ERROR');
    });

    it('should handle undefined code', () => {
      const result = analyzeFile(undefined, 'test.js');

      expect(isParseError(result)).toBe(true);
      const err = result as ParseErrorResult;
      expect(err.parseError).toBeDefined();
      expect(err.errorType).toBe('VALIDATION_ERROR');
    });

    it('should handle non-string code', () => {
      const result = analyzeFile(123 as unknown, 'test.js');

      expect(isParseError(result)).toBe(true);
      const err = result as ParseErrorResult;
      expect(err.parseError).toBeDefined();
      expect(err.errorType).toBe('VALIDATION_ERROR');
    });

    it('should handle empty file', () => {
      const code = '';
      const result = analyzeFile(code, 'empty.js');

      const info = result as FileInfo;
      expect(info.functions).toEqual([]);
      expect(info.classes).toEqual([]);
      expect(info.imports).toEqual([]);
      expect(info.constants).toEqual([]);
    });

    it('should handle file with only whitespace', () => {
      const code = '   \n\t  \r\n  ';
      const result = analyzeFile(code, 'whitespace.js');

      const info = result as FileInfo;
      expect(info.functions).toEqual([]);
      expect(info.classes).toEqual([]);
    });

    it('should handle file with only comments', () => {
      const code = `
// This is a comment
/*
 * Multi-line comment
 */
/** JSDoc comment */
      `;
      const result = analyzeFile(code, 'comments.js');

      const info = result as FileInfo;
      expect(info.functions).toEqual([]);
      expect(info.classes).toEqual([]);
    });

    it('should handle Unicode characters in code', () => {
      const code = `
/**
 * 中文函数描述 🎉
 */
function 测试函数(参数一, 参数二) {
  return '中文字符串';
}
      `;
      const result = analyzeFile(code, 'unicode.js');

      const info = result as FileInfo;
      expect(info.functions).toHaveLength(1);
      expect(info.functions[0]!.name).toBe('测试函数');
      expect(info.functions[0]!.description).toContain('中文函数描述');
    });

    it('should handle emoji in code', () => {
      const code = `
function sendMessage(emoji = '👋') {
  return '🚀' + emoji;
}
      `;
      const result = analyzeFile(code, 'emoji.js');

      const info = result as FileInfo;
      expect(info.functions).toHaveLength(1);
      expect(info.functions[0]!.name).toBe('sendMessage');
    });

    it('should handle deeply nested functions', () => {
      const code = `
function level1() {
  function level2() {
    function level3() {
      function level4() {
        return 'deep';
      }
      return level4();
    }
    return level3();
  }
  return level2();
}
      `;
      const result = analyzeFile(code, 'nested.js');

      const info = result as FileInfo;
      // Babel's FunctionDeclaration visitor captures all function declarations
      expect(info.functions.length).toBeGreaterThan(0);
      expect(info.functions.some(f => f.name === 'level1')).toBe(true);
    });

    it('should handle very long function names', () => {
      const codeName = 'a'.repeat(500);
      const code = `function ${codeName}() { return true; }`;
      const result = analyzeFile(code, 'long.js');

      const info = result as FileInfo;
      expect(info.functions).toHaveLength(1);
      expect(info.functions[0]!.name).toBe(codeName);
    });

    it('should handle syntax error gracefully', () => {
      const code = `
function broken( {
  return "unclosed bracket";
}
      `;
      const result = analyzeFile(code, 'error.js');

      expect(isParseError(result)).toBe(true);
      const err = result as ParseErrorResult;
      expect(err.parseError).toBeDefined();
      expect(err.errorType).toBe('PARSE_ERROR');
      expect(err.loc).toBeDefined();
    });

    it('should handle modern JavaScript syntax', () => {
      const code = `
const obj = { a: 1 };
const copy = { ...obj };
const value = obj?.a ?? 'default';
function process(config) {
  return config?.settings?.['theme'] ?? 'light';
}
      `;
      const result = analyzeFile(code, 'modern.js');

      expect(isParseError(result)).toBe(false);
      const info = result as FileInfo;
      expect(info.functions).toHaveLength(1);
    });

    it('should handle TypeScript without filePath extension', () => {
      const code = `
interface User {
  name: string;
}
function getUser(): User {
  return { name: 'test' };
}
      `;
      const result = analyzeFile(code, null); // No file path

      // Should still try to parse
      expect(result).toBeDefined();
    });

    it('should handle circular call graph', () => {
      const code = `
function funcA() {
  funcB();
}
function funcB() {
  funcA();
}
      `;
      const result = analyzeFile(code, 'circular.js');

      const info = result as FileInfo;
      expect(info.functions).toHaveLength(2);
      expect(info.callGraph.funcA).toContain('funcB');
      expect(info.callGraph.funcB).toContain('funcA');
    });

    it('should handle large file with many functions', () => {
      let code = '';
      for (let i = 0; i < 100; i++) {
        code += `function func${i}() { return ${i}; }\n`;
      }
      const result = analyzeFile(code, 'large.js');

      const info = result as FileInfo;
      expect(info.functions).toHaveLength(100);
    });

    it('should handle complex class hierarchy', () => {
      const code = `
class Base {
  constructor() {}
  baseMethod() {}
}
class Middle extends Base {
  middleMethod() {}
}
class Child extends Middle {
  childMethod() {}
}
      `;
      const result = analyzeFile(code, 'hierarchy.js');

      const info = result as FileInfo;
      expect(info.classes).toHaveLength(3);
      expect(info.classes[1]!.superClass).toBe('Base');
      expect(info.classes[2]!.superClass).toBe('Middle');
    });

    it('should handle mixed import styles', () => {
      const code = `
import defaultExport from 'module1';
import * as namespace from 'module2';
import { named1, named2 as alias } from 'module3';
const commonjs = require('module4');
const { destructured } = require('module5');
      `;
      const result = analyzeFile(code, 'imports.js');

      const info = result as FileInfo;
      expect(info.imports.length).toBeGreaterThan(0);
    });

    it('should handle generator functions', () => {
      const code = `
function* generateNumbers() {
  yield 1;
  yield 2;
  yield 3;
}
      `;
      const result = analyzeFile(code, 'generator.js');

      const info = result as FileInfo;
      expect(info.functions).toHaveLength(1);
      expect(info.functions[0]!.name).toBe('generateNumbers');
    });

    it('should handle async functions', () => {
      const code = `
async function fetchData() {
  const data = await fetch('/api');
  return data;
}
      `;
      const result = analyzeFile(code, 'async.js');

      const info = result as FileInfo;
      expect(info.functions).toHaveLength(1);
      expect(info.functions[0]!.name).toBe('fetchData');
    });

    it('should handle special method names', () => {
      const code = `
class Example {
  ['computed' + 'Name']() {}
  [Symbol.iterator]() {}
}
      `;
      const result = analyzeFile(code, 'special.js');

      const info = result as FileInfo;
      expect(info.classes).toHaveLength(1);
      expect(info.classes[0]!.methods.length).toBeGreaterThan(0);
    });
  });
});
