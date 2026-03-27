import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { detectTools } from '../src/hooks';

describe('detectTools', () => {
  const tempDir = path.join(__dirname, 'fixtures', 'temp-hooks-test');

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('应检测 package.json 中的 typescript', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { typescript: '^5.0.0' }
    }));
    const tools = detectTools(tempDir);
    const ts = tools.find(t => t.name === 'typescript');
    expect(ts?.detected).toBe(true);
    expect(ts?.source).toContain('devDependencies');
    expect(ts?.level).toBe('block');
  });

  it('应检测 tsconfig.json 文件', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
    const tools = detectTools(tempDir);
    const ts = tools.find(t => t.name === 'typescript');
    expect(ts?.detected).toBe(true);
    expect(ts?.source).toContain('tsconfig.json');
  });

  it('应检测 eslint（依赖方式）', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { eslint: '^8.0.0' }
    }));
    const tools = detectTools(tempDir);
    const eslint = tools.find(t => t.name === 'eslint');
    expect(eslint?.detected).toBe(true);
    expect(eslint?.level).toBe('warn');
  });

  it('应检测 eslint.config.js 文件', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), '');
    const tools = detectTools(tempDir);
    const eslint = tools.find(t => t.name === 'eslint');
    expect(eslint?.detected).toBe(true);
    expect(eslint?.source).toContain('eslint.config.js');
  });

  it('应检测 biome', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { '@biomejs/biome': '^1.0.0' }
    }));
    const tools = detectTools(tempDir);
    const biome = tools.find(t => t.name === 'biome');
    expect(biome?.detected).toBe(true);
    expect(biome?.level).toBe('warn');
  });

  it('应检测 prettier', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { prettier: '^3.0.0' }
    }));
    const tools = detectTools(tempDir);
    const prettier = tools.find(t => t.name === 'prettier');
    expect(prettier?.detected).toBe(true);
    expect(prettier?.level).toBe('warn');
  });

  it('应检测 vitest', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { vitest: '^1.0.0' }
    }));
    const tools = detectTools(tempDir);
    const vitest = tools.find(t => t.name === 'vitest');
    expect(vitest?.detected).toBe(true);
    expect(vitest?.level).toBe('block');
  });

  it('应检测 jest（配置文件方式）', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(tempDir, 'jest.config.js'), '');
    const tools = detectTools(tempDir);
    const jest = tools.find(t => t.name === 'jest');
    expect(jest?.detected).toBe(true);
  });

  it('无工具时全部 detected 为 false', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    const tools = detectTools(tempDir);
    expect(tools.every(t => !t.detected)).toBe(true);
  });

  it('无 package.json 时不崩溃', () => {
    const tools = detectTools(tempDir);
    expect(tools.every(t => !t.detected)).toBe(true);
  });
});
