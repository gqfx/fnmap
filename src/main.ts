import fs from 'fs';
import path from 'path';
import os from 'os';
import * as readline from 'node:readline';
import type { CLIOptions, FileInfoEntry } from './types';
import { COLORS, DEFAULT_EXCLUDES } from './constants';
import { logger, setupCLI, setQuietMode, isQuietMode } from './cli';
import { loadConfig, mergeConfig } from './config';
import { scanDirectory, getGitChangedFiles, scanSingleDirectory } from './scanner';
import { processFile } from './processor';
import { generateAiMap, generateFileMermaid, generateProjectMermaid } from './generator';
import { normalizePath } from './validation';

/** fnmap 格式说明的英文版内容 */
const FNMAP_DOCS_EN = `

## .fnmap Code Index Format

The \`.fnmap\` file provides a structured code index for quick navigation. Read it before exploring code to locate target files and function line numbers.

**Format Reference:**

- \`#filename.js\` - Filename followed by file description
- \`<module:members\` - Imported module and its members
- \`funcName(params) 10-20 description →callee1,callee2\` - Function signature, line range, description, call graph
- \`ClassName:SuperClass 30-100\` - Class definition with inheritance
- \`  .method(params) 35 →callee\` - Instance method (\`.\` prefix)
- \`  +staticMethod(params) 40\` - Static method (\`+\` prefix)
- \`CONST_NAME 5\` - Constant definition with line number

**Call Graph:** The \`→\` at the end of function/method lines indicates which functions are called (both local and imported), helping you understand code execution flow.

**Note:** \`.fnmap\` files are auto-maintained by scripts and should not be manually updated.

## Code Comment Guidelines

1. Every global variable, function, class, and file module must have a **concise comment describing its purpose or functionality** - avoid describing anything else
2. When updating code, always update related comments to reflect the changes
3. Prefer encapsulating logic in functions rather than writing flat, sequential code
`;

/** 生成文件的 gitignore 规则 */
const GITIGNORE_RULES = `
# fnmap generated files
.fnmap
*.fnmap
*.mermaid
.fnmap.mermaid
`;

/** 交互式提问工具 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * 递归清理指定目录下的生成文件
 */
function clearGeneratedFiles(dir: string, projectDir: string): number {
  let count = 0;
  const excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];

  if (!fs.existsSync(dir)) {
    logger.warn(`Directory does not exist: ${dir}`);
    return 0;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 跳过排除的目录
      if (excludeDirs.includes(entry.name)) {
        continue;
      }
      count += clearGeneratedFiles(fullPath, projectDir);
    } else if (entry.isFile()) {
      // 匹配生成的文件: .fnmap, *.fnmap, *.mermaid
      const name = entry.name;
      if (name === '.fnmap' || name.endsWith('.fnmap') || name.endsWith('.mermaid')) {
        try {
          fs.unlinkSync(fullPath);
          logger.success(`Deleted: ${path.relative(projectDir, fullPath)}`);
          count++;
        } catch (err) {
          const error = err as Error;
          logger.error(`Failed to delete ${path.relative(projectDir, fullPath)}: ${error.message}`);
        }
      }
    }
  }

  return count;
}

/**
 * 执行 clear 命令
 */
function executeClear(projectDir: string, targetDir?: string): void {
  logger.title('fnmap - Clear Generated Files');
  logger.info('='.repeat(50));

  const dir = targetDir ? path.resolve(projectDir, targetDir) : projectDir;
  const count = clearGeneratedFiles(dir, projectDir);

  logger.info('='.repeat(50));
  if (count > 0) {
    logger.success(`Cleared ${count} generated file(s)`);
  } else {
    logger.info('No generated files found');
  }
}

/**
 * 添加 gitignore 规则
 */
function addGitignoreRules(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    // 检查是否已包含规则
    if (content.includes('fnmap generated files') || content.includes('*.fnmap')) {
      console.log(`${COLORS.yellow}!${COLORS.reset} .gitignore already contains fnmap rules`);
      return;
    }
    // 追加规则
    fs.appendFileSync(gitignorePath, GITIGNORE_RULES);
  } else {
    // 创建新的 .gitignore
    fs.writeFileSync(gitignorePath, GITIGNORE_RULES.trim() + '\n');
  }
  console.log(`${COLORS.green}✓${COLORS.reset} Added fnmap rules to .gitignore`);
}

/**
 * 写入文档到指定文件
 */
function writeDocsToFile(filePath: string, displayName: string): void {
  // 确保目录存在
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('.fnmap Code Index Format')) {
      console.log(`${COLORS.yellow}!${COLORS.reset} ${displayName} already contains fnmap documentation`);
      return;
    }
    fs.appendFileSync(filePath, FNMAP_DOCS_EN);
  } else {
    fs.writeFileSync(filePath, FNMAP_DOCS_EN.trim() + '\n');
  }
  console.log(`${COLORS.green}✓${COLORS.reset} Added fnmap documentation to ${displayName}`);
}

/**
 * 交互式初始化命令 - 支持多选
 */
async function executeInitInteractive(projectDir: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n${COLORS.bold}fnmap - Interactive Setup${COLORS.reset}`);
  console.log('='.repeat(50));

  try {
    // 1. 创建配置文件
    const configPath = path.join(projectDir, '.fnmaprc');
    if (fs.existsSync(configPath)) {
      console.log(`${COLORS.yellow}!${COLORS.reset} Config file already exists: .fnmaprc`);
    } else {
      const defaultConfig = {
        enable: true,
        include: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.jsx', 'src/**/*.tsx'],
        exclude: ['node_modules', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache']
      };
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      console.log(`${COLORS.green}✓${COLORS.reset} Created config file: .fnmaprc`);
    }

    // 2. 询问是否添加 gitignore 规则
    const gitignoreAnswer = await askQuestion(rl, `\nAdd fnmap rules to .gitignore? (Y/n): `);
    if (gitignoreAnswer.toLowerCase() !== 'n') {
      addGitignoreRules(projectDir);
    }

    // 3. 检测已存在的文件
    const projectClaudeMdPath = path.join(projectDir, 'CLAUDE.md');
    const projectAgentsMdPath = path.join(projectDir, 'AGENTS.md');
    const userClaudeMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');

    const hasProjectClaudeMd = fs.existsSync(projectClaudeMdPath);
    const hasProjectAgentsMd = fs.existsSync(projectAgentsMdPath);
    const hasUserClaudeMd = fs.existsSync(userClaudeMdPath);

    // 检查是否有任何项目级文件存在
    const hasAnyProjectFile = hasProjectClaudeMd || hasProjectAgentsMd;

    // 4. 如果没有任何项目级文件，询问是否创建
    if (!hasAnyProjectFile) {
      console.log(`\n${COLORS.yellow}!${COLORS.reset} No CLAUDE.md or AGENTS.md found in project.`);
      const createAnswer = await askQuestion(rl, `Create CLAUDE.md with fnmap documentation? (Y/n): `);
      if (createAnswer.toLowerCase() !== 'n') {
        writeDocsToFile(projectClaudeMdPath, 'CLAUDE.md');
      }
    } else {
      // 5. 显示多选菜单（只显示已存在的项目级文件）
      console.log(`\n${COLORS.bold}Select files to add fnmap documentation:${COLORS.reset}`);
      console.log(`(Enter numbers separated by comma, e.g., 1,2)\n`);

      const options: { key: string; label: string; path: string; exists: boolean }[] = [];
      let keyIndex = 1;

      if (hasProjectClaudeMd) {
        options.push({ key: String(keyIndex++), label: 'Project CLAUDE.md', path: projectClaudeMdPath, exists: true });
      }
      options.push({ key: String(keyIndex++), label: 'User CLAUDE.md (~/.claude/CLAUDE.md)', path: userClaudeMdPath, exists: hasUserClaudeMd });
      if (hasProjectAgentsMd) {
        options.push({ key: String(keyIndex++), label: 'AGENTS.md', path: projectAgentsMdPath, exists: true });
      }

      const customKey = String(keyIndex);

      for (const opt of options) {
        const existsMarker = opt.exists ? `${COLORS.green}[exists]${COLORS.reset}` : `${COLORS.gray}[new]${COLORS.reset}`;
        console.log(`  ${opt.key}. ${opt.label} ${existsMarker}`);
      }
      console.log(`  ${customKey}. Custom file path`);
      console.log(`  0. Skip\n`);

      const selectionAnswer = await askQuestion(rl, `Your choice: `);
      const selections = selectionAnswer.split(',').map((s) => s.trim()).filter(Boolean);

      if (selections.includes('0') || selections.length === 0) {
        console.log('Skipped adding documentation to files.');
      } else {
        // 处理选择
        for (const sel of selections) {
          if (sel === customKey) {
            // 自定义文件路径
            const customPath = await askQuestion(rl, `Enter custom file path: `);
            if (customPath) {
              const fullPath = path.isAbsolute(customPath) ? customPath : path.resolve(projectDir, customPath);
              writeDocsToFile(fullPath, customPath);
            }
          } else {
            const opt = options.find((o) => o.key === sel);
            if (opt) {
              writeDocsToFile(opt.path, opt.label);
            }
          }
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`${COLORS.green}✓${COLORS.reset} Setup complete!`);
    console.log(`\nRun ${COLORS.bold}fnmap${COLORS.reset} or ${COLORS.bold}fnmap --dir src${COLORS.reset} to generate code index.`);

  } finally {
    rl.close();
  }
}

/**
 * 主函数
 */
export async function main(): Promise<void> {
  // 配置并解析CLI
  const program = setupCLI();
  program.parse(process.argv);

  const options = program.opts<CLIOptions>();
  const args = program.args;

  // 设置日志模式 - 默认静默，-l/--log 开启详细日志
  if (options.log) {
    setQuietMode(false);
  }

  const projectDir = path.resolve(options.project);

  // clear命令：清理生成的文件（临时关闭静默模式）
  if (options.clear) {
    const originalQuietMode = isQuietMode();
    setQuietMode(false);
    executeClear(projectDir, options.dir);
    setQuietMode(originalQuietMode);
    return;
  }

  // init命令：交互式初始化（临时关闭静默模式）
  if (options.init) {
    const originalQuietMode = isQuietMode();
    setQuietMode(false);
    await executeInitInteractive(projectDir);
    setQuietMode(originalQuietMode);
    return;
  }

  // 合并文件参数（位置参数也需要规范化路径）
  const fileArgs = [...(options.files ?? []), ...args.map(normalizePath)].filter((f) => fs.existsSync(f));

  // 确定要处理的文件列表
  let filesToProcess: string[] = [];
  // 标记是否为单文件模式（-f 参数）
  let singleFileMode = false;

  if (options.changed || options.staged) {
    // 基于git改动 - 增量模式
    const changedFiles = getGitChangedFiles(projectDir, options.staged);
    if (changedFiles.length === 0) {
      logger.info('No git changed code files detected');
      return;
    }

    // 收集变更文件所在的目录
    const affectedDirs = new Set<string>();
    for (const filePath of changedFiles) {
      affectedDirs.add(path.dirname(filePath));
    }

    // 对于每个受影响的目录，扫描该目录下所有代码文件
    for (const dir of affectedDirs) {
      const dirFiles = scanSingleDirectory(dir);
      filesToProcess.push(...dirFiles);
    }
  } else if (fileArgs.length > 0) {
    // 指定的文件 - 单文件模式
    singleFileMode = true;
    filesToProcess = fileArgs.map((f) => (path.isAbsolute(f) ? f : path.resolve(projectDir, f)));
  } else if (options.dir) {
    // 扫描指定目录
    const targetDir = path.resolve(projectDir, options.dir);
    const relFiles = scanDirectory(targetDir, projectDir);
    filesToProcess = relFiles.map((f) => path.join(projectDir, f));
  } else {
    // 无参数时：读取配置中的 include 目录，像 -d 一样处理
    const { config, source } = loadConfig(projectDir);

    if (config) {
      logger.info(`Using config: ${source}`);

      // 检查是否启用
      if (config.enable === false) {
        logger.info('Config file has enable set to false, skipping processing');
        return;
      }

      // 合并配置
      const mergedConfig = mergeConfig(config);
      const excludes = [...DEFAULT_EXCLUDES, ...mergedConfig.exclude];

      if (mergedConfig.include && mergedConfig.include.length > 0) {
        // 从 include 模式中提取目录并去重
        const includeDirs = new Set<string>();
        for (const pattern of mergedConfig.include) {
          // 从 glob 模式中提取目录部分，例如 src/**/*.ts -> src
          const dir = pattern.replace(/\/\*\*\/.*$/, '').replace(/\*\*\/.*$/, '').replace(/\/\*\..*$/, '').replace(/\*\..*$/, '');
          if (dir) {
            includeDirs.add(dir);
          }
        }

        // 对每个目录使用 -d 的方式处理
        for (const dir of includeDirs) {
          const targetDir = path.resolve(projectDir, dir);
          if (fs.existsSync(targetDir)) {
            const relFiles = scanDirectory(targetDir, projectDir, excludes);
            filesToProcess.push(...relFiles.map((f) => path.join(projectDir, f)));
          }
        }
      }
    } else {
      logger.warn('No config file found. Use fnmap init to create config, or use --dir/--files to specify scope');
      logger.info('');
      logger.info('Supported config files: .fnmaprc, .fnmaprc.json, package.json#fnmap');
      return;
    }
  }

  if (filesToProcess.length === 0) {
    logger.info('No files found to process');
    return;
  }

  // 去重
  filesToProcess = [...new Set(filesToProcess)];

  logger.info('='.repeat(50));
  logger.title('fnmap - AI Code Indexing Tool');
  logger.info('='.repeat(50));

  let processed = 0;
  let failed = 0;
  const dirFilesMap = new Map<string, FileInfoEntry[]>();

  for (const filePath of filesToProcess) {
    const relativePath = path.relative(projectDir, filePath);
    logger.info(`\nAnalyzing: ${relativePath}`);

    const result = processFile(filePath);

    if (result.success) {
      processed++;
      const info = result.info;

      // 跳过纯类型文件
      if (info.isPureType) {
        logger.info(`Skipped (pure type file) / 跳过纯类型文件`);
        continue;
      }

      logger.success(
        `Imports: ${info.imports.length}, Functions: ${info.functions.length}, Classes: ${info.classes.length}, Constants: ${info.constants.length}`
      );

      // 收集目录信息
      const dir = path.dirname(filePath);
      if (!dirFilesMap.has(dir)) {
        dirFilesMap.set(dir, []);
      }
      dirFilesMap.get(dir)!.push({ relativePath, info });
    } else {
      failed++;
      logger.error(result.error);
    }
  }

  // 生成.fnmap索引文件
  if (dirFilesMap.size > 0) {
    logger.info('\nGenerating .fnmap index...');

    if (singleFileMode) {
      // 单文件模式：为每个文件生成 filename.fnmap
      for (const [dir, filesInfo] of dirFilesMap) {
        for (const { relativePath, info } of filesInfo) {
          try {
            const mapContent = generateAiMap(dir, [{ relativePath, info }]);
            const baseName = path.basename(relativePath, path.extname(relativePath));
            const mapPath = path.join(dir, `${baseName}.fnmap`);
            fs.writeFileSync(mapPath, mapContent);
            logger.success(path.relative(projectDir, mapPath));
          } catch (err) {
            const error = err as Error;
            logger.error(`Failed to generate .fnmap for ${relativePath}: ${error.message}`);
          }
        }
      }
    } else {
      // 目录模式：每个目录生成一个 .fnmap
      for (const [dir, filesInfo] of dirFilesMap) {
        try {
          const mapContent = generateAiMap(dir, filesInfo);
          const mapPath = path.join(dir, '.fnmap');
          fs.writeFileSync(mapPath, mapContent);
          logger.success(path.relative(projectDir, mapPath));
        } catch (err) {
          const error = err as Error;
          logger.error(`Failed to generate .fnmap for ${path.relative(projectDir, dir)}: ${error.message}`);
        }
      }
    }
  }

  // 生成Mermaid调用图
  if (options.mermaid && dirFilesMap.size > 0) {
    logger.info('\nGenerating Mermaid call graphs...');

    if (options.mermaid === 'file' || options.mermaid === true) {
      // 文件级：每个文件生成一个mermaid图
      for (const [dir, filesInfo] of dirFilesMap) {
        for (const { relativePath, info } of filesInfo) {
          try {
            const mermaidContent = generateFileMermaid(relativePath, info);
            if (mermaidContent) {
              const baseName = path.basename(relativePath, path.extname(relativePath));
              const mermaidPath = path.join(dir, `${baseName}.mermaid`);
              fs.writeFileSync(mermaidPath, mermaidContent);
              logger.success(path.relative(projectDir, mermaidPath));
            }
          } catch (err) {
            const error = err as Error;
            logger.error(`Failed to generate mermaid for ${relativePath}: ${error.message}`);
          }
        }
      }
    } else if (options.mermaid === 'project') {
      // 项目级：生成一个包含所有文件的mermaid图
      try {
        const allFilesInfo: FileInfoEntry[] = [];
        for (const [, filesInfo] of dirFilesMap) {
          allFilesInfo.push(...filesInfo);
        }
        const mermaidContent = generateProjectMermaid(projectDir, allFilesInfo);
        const mermaidPath = path.join(projectDir, '.fnmap.mermaid');
        fs.writeFileSync(mermaidPath, mermaidContent);
        logger.success(path.relative(projectDir, mermaidPath));
      } catch (err) {
        const error = err as Error;
        logger.error(`Failed to generate project mermaid: ${error.message}`);
      }
    }
  }

  logger.info('\n' + '='.repeat(50));
  logger.stats(
    `Complete! Analyzed: ${COLORS.green}${processed}${COLORS.reset}, Failed: ${failed > 0 ? COLORS.red : ''}${failed}${COLORS.reset}`
  );
  logger.info('='.repeat(50));
}
