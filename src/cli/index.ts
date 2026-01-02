import { Command } from 'commander';
import { COLORS } from '../constants';
import { normalizePath } from '../validation';

// 日志工具 - 默认静默模式，只显示统计信息
let quietMode = true;

// 使用模块级变量存储 program 实例
let _program: Command | null = null;

export const logger = {
  error: (msg: string): void => {
    if (!quietMode) console.error(`${COLORS.red}✗${COLORS.reset} ${msg}`);
  },
  success: (msg: string): void => {
    if (!quietMode) console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`);
  },
  info: (msg: string): void => {
    if (!quietMode) console.log(msg);
  },
  warn: (msg: string): void => {
    if (!quietMode) console.warn(`${COLORS.yellow}!${COLORS.reset} ${msg}`);
  },
  title: (msg: string): void => {
    if (!quietMode) console.log(`${COLORS.bold}${msg}${COLORS.reset}`);
  },
  // 统计信息 - 始终显示，不受静默模式影响
  stats: (msg: string): void => {
    console.log(msg);
  }
};

export function setQuietMode(quiet: boolean): void {
  quietMode = quiet;
}

export function isQuietMode(): boolean {
  return quietMode;
}

/**
 * 获取package.json中的版本号
 */
export function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../package.json') as { version: string };
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

/**
 * 配置CLI命令
 */
export function setupCLI(): Command {
  // 每次创建新的 Command 实例以支持测试
  _program = new Command();

  _program
    .name('fnmap')
    .description('AI code indexing tool - Analyzes JS/TS code structure and generates structured code maps')
    .version(getVersion(), '-v, --version', 'Show version number')
    .option('-f, --files <files>', 'Process specified files (comma-separated)', (val: string) =>
      val
        .split(',')
        .map((f) => normalizePath(f.trim()))
        .filter(Boolean)
    )
    .option('-d, --dir <dir>', 'Process all code files in directory', (val: string) => normalizePath(val))
    .option('-p, --project <dir>', 'Specify project root directory (default: current directory)', (val: string) => normalizePath(val), process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
    .option('-c, --changed', 'Process only git changed files (staged + modified + untracked)')
    .option('-s, --staged', 'Process only git staged files (for pre-commit hook)')
    .option('-m, --mermaid [mode]', 'Generate Mermaid call graph (file=file-level, project=project-level)')
    .option('-l, --log', 'Show detailed processing logs')
    .option('--init', 'Create default config file and setup project (interactive)')
    .option('--clear', 'Clear generated files (.fnmap, *.fnmap, *.mermaid)')
    .argument('[files...]', 'Directly specify file paths')
    .allowUnknownOption(false)
    .addHelpText(
      'after',
      `
Configuration files (by priority):
  .fnmaprc              JSON config file
  .fnmaprc.json         JSON config file
  package.json#fnmap    fnmap field in package.json

Output:
  .fnmap                Code index file in directory mode (imports, functions, classes, constants, call graph)
  *.fnmap               Individual file index when using --files (e.g., module.fnmap)
  *.mermaid             Mermaid call graph (when using --mermaid file)
  .fnmap.mermaid        Project-level Mermaid call graph (when using --mermaid project)

Examples:
  $ fnmap --dir src                  Process src directory
  $ fnmap --files a.js,b.js          Process specified files
  $ fnmap --changed                  Process git changed files
  $ fnmap --staged                   For pre-commit hook usage
  $ fnmap --log --dir src            Show detailed processing logs
  $ fnmap --mermaid file --dir src   Generate file-level call graphs
  $ fnmap --mermaid project          Generate project-level call graph
  $ fnmap --init                     Interactive project setup
  $ fnmap --clear                    Clear all generated files
  $ fnmap --clear --dir src          Clear generated files in src directory
`
    );

  return _program;
}

// 导出 program getter
export function getProgram(): Command {
  if (!_program) {
    return setupCLI();
  }
  return _program;
}

// 为了兼容性，导出 program 为 getter
export const program = {
  get opts() {
    return getProgram().opts.bind(getProgram());
  },
  get args() {
    return getProgram().args;
  },
  get parse() {
    return getProgram().parse.bind(getProgram());
  }
};
