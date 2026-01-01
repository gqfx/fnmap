import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { SUPPORTED_EXTENSIONS, DEFAULT_EXCLUDES, MAX_DIR_DEPTH } from '../constants';
import { logger } from '../cli';

/**
 * 检查是否为类型定义文件 (.d.ts)
 */
function isTypeDefinitionFile(filePath: string): boolean {
  return filePath.endsWith('.d.ts') || filePath.endsWith('.d.tsx') || filePath.endsWith('.d.mts');
}

/**
 * 获取 git 仓库根目录
 */
function getGitRoot(cwd: string): string | null {
  try {
    return child_process
      .execSync('git rev-parse --show-toplevel', {
        cwd,
        encoding: 'utf-8'
      })
      .trim();
  } catch {
    return null;
  }
}

/**
 * 获取 git 改动的文件列表
 */
export function getGitChangedFiles(projectDir: string, stagedOnly = false): string[] {
  const files: string[] = [];

  try {
    // 获取 git 仓库根目录
    const gitRoot = getGitRoot(projectDir);
    if (!gitRoot) {
      return [];
    }

    let output: string;
    if (stagedOnly) {
      // 只获取 staged 文件
      output = child_process.execSync('git diff --cached --name-only --diff-filter=ACMR', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
    } else {
      // 获取所有改动文件（包括 staged、modified、untracked）
      const staged = child_process.execSync('git diff --cached --name-only --diff-filter=ACMR', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
      const modified = child_process.execSync('git diff --name-only --diff-filter=ACMR', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
      const untracked = child_process.execSync('git ls-files --others --exclude-standard', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
      output = `${staged}\n${modified}\n${untracked}`;
    }

    const changedFiles = output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => {
        const ext = path.extname(f);
        return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) && !isTypeDefinitionFile(f);
      });

    // 去重并转换为绝对路径（相对于 git 根目录）
    const uniqueFiles = [...new Set(changedFiles)];
    for (const f of uniqueFiles) {
      // git 返回的路径是相对于仓库根目录的
      const fullPath = path.resolve(gitRoot, f);
      // 只包含 projectDir 下的文件
      if (fs.existsSync(fullPath) && fullPath.startsWith(path.resolve(projectDir))) {
        files.push(fullPath);
      }
    }
  } catch {
    // 不是 git 仓库或其他错误
    return [];
  }

  return files;
}

/**
 * 扫描单个目录下的代码文件（不递归）
 */
export function scanSingleDirectory(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) && !isTypeDefinitionFile(entry.name)) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
  } catch {
    return files;
  }

  return files;
}

/**
 * 递归扫描目录获取所有代码文件
 */
export function scanDirectory(
  dir: string,
  baseDir: string = dir,
  excludes: readonly string[] = DEFAULT_EXCLUDES,
  depth = 0,
  visited: Set<string> = new Set()
): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    logger.warn(`Directory does not exist: ${dir} / 目录不存在`);
    return files;
  }

  // 检查深度限制
  if (depth > MAX_DIR_DEPTH) {
    logger.warn(`Max directory depth (${MAX_DIR_DEPTH}) exceeded: ${dir} / 超过最大目录深度`);
    return files;
  }

  // 获取规范化的真实路径,处理符号链接
  let realPath: string;
  try {
    realPath = fs.realpathSync(dir);
  } catch (e) {
    const error = e as Error;
    logger.warn(`Cannot resolve real path: ${dir}. Reason: ${error.message} / 无法解析真实路径`);
    return files;
  }

  // 检测循环引用
  if (visited.has(realPath)) {
    logger.warn(`Circular reference detected, skipping: ${dir} / 检测到循环引用`);
    return files;
  }
  visited.add(realPath);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      logger.warn(`Permission denied: ${dir} / 权限不足`);
    } else {
      logger.warn(`Failed to read directory: ${dir}. Reason: ${error.message} / 读取目录失败`);
    }
    return files;
  }

  for (const entry of entries) {
    try {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!excludes.includes(entry.name)) {
          files.push(...scanDirectory(fullPath, baseDir, excludes, depth + 1, visited));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) && !isTypeDefinitionFile(entry.name)) {
          files.push(path.relative(baseDir, fullPath));
        }
      }
      // 忽略符号链接、设备文件等其他类型
    } catch (e) {
      const error = e as Error;
      logger.warn(`Error processing entry: ${entry.name}. Reason: ${error.message} / 处理条目出错`);
    }
  }

  return files;
}
