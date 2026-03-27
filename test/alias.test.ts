import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveAliasPath, transformImports, detectAliasFromTsconfig } from '../src/alias';
import type { AliasConfig } from '../src/alias';

const aliases: AliasConfig[] = [
  { alias: '@', target: 'src' },
  { alias: '@libs', target: 'libs' },
  { alias: '@components', target: 'src/components' },
];

describe('resolveAliasPath', () => {
  it('应将 ../ 路径转换为别名路径', () => {
    expect(resolveAliasPath('../utils/helper', 'src/pages', aliases)).toBe('@/utils/helper');
  });

  it('应优先匹配更具体的别名', () => {
    // src/components 比 src 更具体
    expect(resolveAliasPath('../components/Button', 'src/pages', aliases)).toBe('@components/Button');
  });

  it('不应转换 ./ 同层路径', () => {
    expect(resolveAliasPath('./helper', 'src/utils', aliases)).toBeNull();
  });

  it('不应转换非相对路径', () => {
    expect(resolveAliasPath('lodash', 'src/utils', aliases)).toBeNull();
    expect(resolveAliasPath('@/utils', 'src/pages', aliases)).toBeNull();
  });

  it('应处理多层 ../ 路径', () => {
    expect(resolveAliasPath('../../utils/helper', 'src/pages/admin', aliases)).toBe('@/utils/helper');
  });

  it('应处理指向 libs 的路径', () => {
    expect(resolveAliasPath('../../libs/math', 'src/pages', aliases)).toBe('@libs/math');
  });

  it('无法匹配别名时返回 null', () => {
    expect(resolveAliasPath('../other/file', 'src', aliases)).toBeNull();
  });

  it('应处理指向别名根目录的路径', () => {
    // 从 src 目录引用 ../libs 会解析为 libs
    expect(resolveAliasPath('../libs', 'src', [{ alias: '@libs', target: 'libs' }])).toBe('@libs');
  });
});

describe('transformImports', () => {
  it('应转换 import 声明中的 ../ 路径', () => {
    const code = `import { helper } from '../utils/helper';`;
    const result = transformImports(code, 'src/pages/index.ts', aliases);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toEqual(['../utils/helper', '@/utils/helper']);
    expect(result.code).toContain('@/utils/helper');
  });

  it('不应转换 ./ 同层导入', () => {
    const code = `import { helper } from './helper';`;
    const result = transformImports(code, 'src/utils/index.ts', aliases);
    expect(result.changes).toHaveLength(0);
    expect(result.code).toBeNull();
  });

  it('应转换 export ... from 声明', () => {
    const code = `export { helper } from '../utils/helper';`;
    const result = transformImports(code, 'src/pages/index.ts', aliases);
    expect(result.changes).toHaveLength(1);
    expect(result.code).toContain('@/utils/helper');
  });

  it('应转换 export * from 声明', () => {
    const code = `export * from '../utils/helper';`;
    const result = transformImports(code, 'src/pages/index.ts', aliases);
    expect(result.changes).toHaveLength(1);
    expect(result.code).toContain('@/utils/helper');
  });

  it('不应转换动态 import()（构建工具不处理）', () => {
    const code = `const mod = import('../utils/helper');`;
    const result = transformImports(code, 'src/pages/index.ts', aliases);
    expect(result.changes).toHaveLength(0);
    expect(result.code).toBeNull();
  });

  it('应处理多个导入', () => {
    const code = [
      `import { a } from '../utils/a';`,
      `import { b } from './b';`,
      `import { c } from '../components/c';`,
    ].join('\n');
    const result = transformImports(code, 'src/pages/index.ts', aliases);
    expect(result.changes).toHaveLength(2);
    expect(result.code).toContain('@/utils/a');
    expect(result.code).toContain('@components/c');
    // ./b 不应被转换
    expect(result.code).toContain('./b');
  });

  it('应处理 TypeScript 类型导入', () => {
    const code = `import type { Foo } from '../types/foo';`;
    const result = transformImports(code, 'src/pages/index.ts', aliases);
    expect(result.changes).toHaveLength(1);
    expect(result.code).toContain('@/types/foo');
  });

  it('应处理带装饰器的代码', () => {
    const code = [
      `import { Component } from '../decorators';`,
      `@Component`,
      `class MyClass {}`,
    ].join('\n');
    const result = transformImports(code, 'src/pages/index.ts', aliases);
    expect(result.changes).toHaveLength(1);
    expect(result.code).toContain('@/decorators');
  });

  it('应处理 JSX 代码', () => {
    const code = [
      `import { Button } from '../components/Button';`,
      `const App = () => <Button />;`,
    ].join('\n');
    const result = transformImports(code, 'src/pages/index.tsx', aliases);
    expect(result.changes).toHaveLength(1);
    expect(result.code).toContain('@components/Button');
  });
});

describe('detectAliasFromTsconfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fnmap-alias-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('应从 tsconfig.json 的 paths 中检测别名', () => {
    const tsconfig = {
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@/*': ['./src/*'],
          '@libs/*': ['./libs/*'],
        },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig));

    const result = detectAliasFromTsconfig(tmpDir);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ alias: '@', target: 'src' });
    expect(result).toContainEqual({ alias: '@libs', target: 'libs' });
  });

  it('应处理带注释的 tsconfig.json', () => {
    const content = `{
      // 这是注释
      "compilerOptions": {
        "baseUrl": ".",
        /* 路径别名 */
        "paths": {
          "@/*": ["./src/*"]
        }
      }
    }`;
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), content);

    const result = detectAliasFromTsconfig(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ alias: '@', target: 'src' });
  });

  it('应处理非 . 的 baseUrl', () => {
    const tsconfig = {
      compilerOptions: {
        baseUrl: './src',
        paths: {
          '@components/*': ['./components/*'],
        },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig));

    const result = detectAliasFromTsconfig(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ alias: '@components', target: 'src/components' });
  });

  it('无 tsconfig 时返回空数组', () => {
    const result = detectAliasFromTsconfig(tmpDir);
    expect(result).toEqual([]);
  });

  it('无 paths 配置时返回空数组', () => {
    const tsconfig = { compilerOptions: { target: 'ES2020' } };
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig));

    const result = detectAliasFromTsconfig(tmpDir);
    expect(result).toEqual([]);
  });
});
