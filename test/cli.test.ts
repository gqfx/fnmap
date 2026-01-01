import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { main } from '../index';
import { program } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CLI', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const tempDir = path.join(fixturesDir, 'temp-cli-test');
  
  // 保存原始的 process.argv
  const originalArgv = process.argv;
  // 保存原始的 console
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    // 重置 commander 状态
    // 注意：Commander 的状态是全局的，这可能会比较难以完全重置
    // 我们主要通过 mock 来控制
    
    // 创建临时目录
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Mock console
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    
    // 确保 process.exit 不会真的退出进程
    vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    // 恢复 process.argv
    process.argv = originalArgv;
    
    // 恢复 console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    vi.restoreAllMocks();
  });

  it('should handle --init command', () => {
    const configPath = path.join(tempDir, '.fnmaprc');
    
    // 模拟 process.argv
    process.argv = ['node', 'fnmap', '--init', '--project', tempDir];
    
    main();
    
    // 验证配置文件是否创建
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.enable).toBe(true);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Created config file'));
  });

  it('should not overwrite existing config with --init', () => {
    const configPath = path.join(tempDir, '.fnmaprc');
    fs.writeFileSync(configPath, '{}');
    
    process.argv = ['node', 'fnmap', '--init', '--project', tempDir];
    
    main();
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    // 验证内容没变
    expect(fs.readFileSync(configPath, 'utf-8')).toBe('{}');
  });

  it('should handle --file arguments', () => {
    const testFile = path.join(tempDir, 'test.js');
    fs.writeFileSync(testFile, 'function test() {}');
    
    process.argv = ['node', 'fnmap', '--files', testFile, '--project', tempDir];
    
    main();
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Analyzing'));
  });
  
  it('should handle --dir arguments', () => {
    const subDir = path.join(tempDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'a.js'), 'const a = 1;');
    
    process.argv = ['node', 'fnmap', '--dir', 'src', '--project', tempDir];
    
    main();
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Analyzing'));
    // 应该会生成 .fnmap 文件
    expect(fs.existsSync(path.join(subDir, '.fnmap'))).toBe(true);
  });
});
