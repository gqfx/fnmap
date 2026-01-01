import { describe, it, expect } from 'vitest';
import {
  generateHeader,
  removeExistingHeaders,
  generateAiMap,
  generateFileMermaid,
  generateProjectMermaid
} from '../src/index';
import type { FileInfo, MethodInfo } from '../src/index';

describe('generateHeader', () => {
  it('should generate AI comment header', () => {
    const info: FileInfo = {
      description: 'Test file',
      imports: [
        { module: 'fs', members: ['readFileSync', 'writeFileSync'], usedIn: ['readFile'] }
      ],
      functions: [
        { name: 'test', params: 'a,b', startLine: 10, endLine: 15, description: 'Test function' }
      ],
      classes: [],
      constants: [
        { name: 'MAX_SIZE', line: 5, description: 'Maximum size' }
      ],
      callGraph: {}
    };

    const header = generateHeader(info, 'test.js');

    expect(header).toContain('/*@AI test.js');
    expect(header).toContain('Test file');
    expect(header).toContain('<fs:readFileSync,writeFileSync');
    expect(header).toContain('test(a,b) 10-15');
    expect(header).toContain('MAX_SIZE 5');
    expect(header).toContain('@AI*/');
  });

  it('should include class information', () => {
    const info: FileInfo = {
      description: '',
      imports: [],
      functions: [],
      classes: [
        {
          name: 'MyClass',
          superClass: 'BaseClass',
          startLine: 10,
          endLine: 30,
          methods: [
            { name: 'method1', params: 'x', line: 15, static: false, kind: 'method', description: '' },
            { name: 'staticMethod', params: '', line: 20, static: true, kind: 'method', description: '' }
          ] as MethodInfo[],
          description: 'My class'
        }
      ],
      constants: [],
      callGraph: {}
    };

    const header = generateHeader(info, 'class.js');

    expect(header).toContain('MyClass:BaseClass 10-30');
    expect(header).toContain('.method1(x) 15');
    expect(header).toContain('+staticMethod() 20');
  });

  it('should handle get and set methods', () => {
    const info: FileInfo = {
      description: '',
      imports: [],
      functions: [],
      classes: [
        {
          name: 'MyClass',
          superClass: null,
          startLine: 1,
          endLine: 10,
          methods: [
            { name: 'value', params: '', line: 5, static: false, kind: 'get', description: '' },
            { name: 'value', params: 'v', line: 8, static: false, kind: 'set', description: '' }
          ] as MethodInfo[],
          description: ''
        }
      ],
      constants: [],
      callGraph: {}
    };

    const header = generateHeader(info, 'getset.js');

    expect(header).toContain('get:value() 5');
    expect(header).toContain('set:value(v) 8');
  });
});

describe('removeExistingHeaders', () => {
  it('should remove AI comment headers', () => {
    const code = `/*@AI test.js
<fs:readFile
test() 10-20
@AI*/

function test() {
  return true;
}`;

    const cleaned = removeExistingHeaders(code);

    expect(cleaned).not.toContain('/*@AI');
    expect(cleaned).not.toContain('@AI*/');
    expect(cleaned).toContain('function test()');
  });

  it('should remove old-style headers', () => {
    const code = `/**
 * @ai-context-start
 * Some context
 * @ai-context-end
 */

function test() {}`;

    const cleaned = removeExistingHeaders(code);

    expect(cleaned).not.toContain('@ai-context');
    expect(cleaned).toContain('function test()');
  });
});

describe('generateAiMap', () => {
  it('should generate .fnmap index file', () => {
    const filesInfo = [
      {
        relativePath: 'src/utils.js',
        info: {
          description: 'Utility functions',
          imports: [{ module: 'fs', members: ['readFileSync'], usedIn: [] }],
          functions: [
            { name: 'helper', params: 'x', startLine: 10, endLine: 15, description: 'Helper function' }
          ],
          classes: [],
          constants: [],
          callGraph: {}
        }
      }
    ];

    const mapContent = generateAiMap('/project/src', filesInfo);

    expect(mapContent).toContain('@FNMAP src/');
    expect(mapContent).toContain('#utils.js');
    expect(mapContent).toContain('Utility functions');
    expect(mapContent).toContain('<fs:readFileSync');
    expect(mapContent).toContain('helper(x) 10-15');
    expect(mapContent).toContain('@FNMAP');
  });

  it('should include call graph information', () => {
    const filesInfo = [
      {
        relativePath: 'test.js',
        info: {
          description: '',
          imports: [],
          functions: [
            { name: 'caller', params: '', startLine: 1, endLine: 5, description: '' },
            { name: 'callee', params: '', startLine: 7, endLine: 10, description: '' }
          ],
          classes: [],
          constants: [],
          callGraph: {
            caller: ['callee']
          }
        }
      }
    ];

    const mapContent = generateAiMap('/project', filesInfo);

    expect(mapContent).toContain('caller() 1-5 →callee');
  });
});

describe('generateFileMermaid', () => {
  it('should generate mermaid flowchart for a file', () => {
    const info: FileInfo = {
      description: '',
      imports: [],
      functions: [
        { name: 'func1', params: '', startLine: 1, endLine: 5, description: '' },
        { name: 'func2', params: '', startLine: 7, endLine: 10, description: '' }
      ],
      classes: [],
      constants: [],
      callGraph: {
        func1: ['func2']
      }
    };

    const mermaid = generateFileMermaid('test.js', info);

    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('subgraph id_test["test"]');
    expect(mermaid).toContain('func1["func1"]');
    expect(mermaid).toContain('func2["func2"]');
    expect(mermaid).toContain('-->');
  });

  it('should return null for files without functions', () => {
    const info: FileInfo = {
      description: '',
      imports: [],
      functions: [],
      classes: [],
      constants: [],
      callGraph: {}
    };

    const mermaid = generateFileMermaid('empty.js', info);

    expect(mermaid).toBeNull();
  });

  it('should handle class methods', () => {
    const info: FileInfo = {
      description: '',
      imports: [],
      functions: [],
      classes: [
        {
          name: 'MyClass',
          superClass: null,
          startLine: 0,
          endLine: 0,
          description: '',
          methods: [
            { name: 'method1', params: '', line: 5, static: false, kind: 'method', description: '' },
            { name: 'method2', params: '', line: 10, static: false, kind: 'method', description: '' }
          ] as MethodInfo[]
        }
      ],
      constants: [],
      callGraph: {
        'MyClass.method1': ['MyClass.method2']
      }
    };

    const mermaid = generateFileMermaid('class.js', info);

    // Assert that IDs are generated (we check partial match since ID gen logic is complex now)
    expect(mermaid).toContain('MyClass_46_method1');
    expect(mermaid).toContain('MyClass_46_method2');
  });

  it('should handle special characters in function names (escaping)', () => {
    const info: FileInfo = {
      description: '',
      imports: [],
      functions: [
        { name: 'func"with"quote', params: '', startLine: 1, endLine: 5, description: '' }
      ],
      classes: [],
      constants: [],
      callGraph: {}
    };

    const mermaid = generateFileMermaid('special.js', info);

    // Should escape " to #quot;
    expect(mermaid).toContain('#quot;with#quot;quote');
    // ID should be safe
    expect(mermaid).not.toContain('"with"');
  });
});

describe('generateProjectMermaid', () => {
  it('should generate project-level mermaid diagram', () => {
    const allFilesInfo = [
      {
        relativePath: 'file1.js',
        info: {
          description: '',
          imports: [],
          functions: [{ name: 'func1', params: '', startLine: 1, endLine: 5, description: '' }],
          classes: [],
          constants: [],
          callGraph: {}
        } as FileInfo
      },
      {
        relativePath: 'file2.js',
        info: {
          description: '',
          imports: [],
          functions: [{ name: 'func2', params: '', startLine: 1, endLine: 5, description: '' }],
          classes: [],
          constants: [],
          callGraph: {}
        } as FileInfo
      }
    ];

    const mermaid = generateProjectMermaid('/project', allFilesInfo);

    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('subgraph id_file1["file1"]');
    expect(mermaid).toContain('subgraph id_file2["file2"]');
  });

  it('should avoid ID collisions for similar filenames', () => {
    const allFilesInfo = [
      {
        relativePath: 'test.js',
        info: {
          description: '',
          imports: [],
          functions: [{ name: 'fn', params: '', startLine: 1, endLine: 1, description: '' }],
          classes: [],
          constants: [],
          callGraph: {}
        } as FileInfo
      },
      {
        relativePath: 'test_js', // No extension or different one
        info: {
          description: '',
          imports: [],
          functions: [{ name: 'fn', params: '', startLine: 1, endLine: 1, description: '' }],
          classes: [],
          constants: [],
          callGraph: {}
        } as FileInfo
      }
    ];

    const mermaid = generateProjectMermaid('/project', allFilesInfo);

    // Check that subgraph IDs are different
    // test.js -> test_46_js
    // test_js -> test_95_js
    const matches = mermaid.match(/subgraph (id_[^\s]+)/g);
    expect(matches).not.toBeNull();
    expect(matches).toHaveLength(2);
    expect(matches![0]).not.toEqual(matches![1]);
  });
});
