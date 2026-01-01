import fs from 'fs';
import path from 'path';
import type { CLIOptions, FileInfoEntry } from './types';
import { COLORS, DEFAULT_EXCLUDES } from './constants';
import { logger, setupCLI, setQuietMode } from './cli';
import { loadConfig, mergeConfig } from './config';
import { scanDirectory, getGitChangedFiles, scanSingleDirectory } from './scanner';
import { processFile } from './processor';
import { generateAiMap, generateFileMermaid, generateProjectMermaid } from './generator';

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

/**
 * 检查目录中是否存在 CLAUDE.md 或 AGENTS.md（忽略大小写），如果存在则追加 fnmap 文档
 */
function appendFnmapDocsToAgentFiles(projectDir: string): void {
  const targetFiles = ['CLAUDE.md', 'AGENTS.md'];
  const files = fs.readdirSync(projectDir);

  for (const targetFile of targetFiles) {
    // 忽略大小写查找匹配的文件
    const matchedFile = files.find((f) => f.toLowerCase() === targetFile.toLowerCase());

    if (matchedFile) {
      const filePath = path.join(projectDir, matchedFile);
      const content = fs.readFileSync(filePath, 'utf-8');

      // 检查是否已经包含 fnmap 文档（避免重复添加）
      if (content.includes('.fnmap Code Index Format')) {
        console.log(`${COLORS.yellow}!${COLORS.reset} ${matchedFile} already contains fnmap documentation`);
        continue;
      }

      // 追加文档
      fs.appendFileSync(filePath, FNMAP_DOCS_EN);
      console.log(`${COLORS.green}✓${COLORS.reset} Appended fnmap documentation to ${matchedFile}`);
    }
  }
}

/**
 * 主函数
 */
export function main(): void {
  // 配置并解析CLI
  const program = setupCLI();
  program.parse(process.argv);

  const options = program.opts<CLIOptions>();
  const args = program.args;

  // 设置静默模式
  if (options.quiet) {
    setQuietMode(true);
  }

  const projectDir = path.resolve(options.project);

  // init命令：创建配置文件并更新 agent 文档
  if (options.init) {
    // 1. 检查并创建 .fnmaprc
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

    // 2. 检查并更新 CLAUDE.md 或 AGENTS.md（独立检测）
    appendFnmapDocsToAgentFiles(projectDir);
    return;
  }

  // 合并文件参数
  const fileArgs = [...(options.files ?? []), ...args].filter((f) => fs.existsSync(f));

  // 确定要处理的文件列表
  let filesToProcess: string[] = [];

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
    // 指定的文件
    filesToProcess = fileArgs.map((f) => (path.isAbsolute(f) ? f : path.resolve(projectDir, f)));
  } else if (options.dir) {
    // 扫描指定目录
    const targetDir = path.resolve(projectDir, options.dir);
    const relFiles = scanDirectory(targetDir, projectDir);
    filesToProcess = relFiles.map((f) => path.join(projectDir, f));
  } else {
    // 检查项目配置文件
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

      if (mergedConfig.include) {
        for (const pattern of mergedConfig.include) {
          const dir = pattern.replace(/\/\*\*\/.*$/, '').replace(/\*\*\/.*$/, '');
          const targetDir = dir ? path.resolve(projectDir, dir) : projectDir;
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
  logger.info(
    `Complete! Analyzed: ${COLORS.green}${processed}${COLORS.reset}, Failed: ${failed > 0 ? COLORS.red : ''}${failed}${COLORS.reset}`
  );
  logger.info('='.repeat(50));
}
