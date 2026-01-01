import { program, Command } from 'commander';
import { COLORS } from '../constants';

// 日志工具
let quietMode = false;

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
  program
    .name('fnmap')
    .description('AI code indexing tool - Analyzes JS/TS code structure and generates structured code maps')
    .version(getVersion(), '-v, --version', 'Show version number')
    .option('-f, --files <files>', 'Process specified files (comma-separated)', (val: string) =>
      val
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
    )
    .option('-d, --dir <dir>', 'Process all code files in directory')
    .option('-p, --project <dir>', 'Specify project root directory', process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
    .option('-c, --changed', 'Process only git changed files (staged + modified + untracked)')
    .option('-s, --staged', 'Process only git staged files (for pre-commit hook)')
    .option('-m, --mermaid [mode]', 'Generate Mermaid call graph (file=file-level, project=project-level)')
    .option('-q, --quiet', 'Quiet mode')
    .option('--init', 'Create default config file .fnmaprc')
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
  .fnmap                Code index file (imports, functions, classes, constants, call graph)
  *.mermaid             Mermaid call graph (when using --mermaid file)
  .fnmap.mermaid        Project-level Mermaid call graph (when using --mermaid project)

Examples:
  $ fnmap --dir src                  Process src directory
  $ fnmap --files a.js,b.js          Process specified files
  $ fnmap --changed                  Process git changed files
  $ fnmap --staged -q                For pre-commit hook usage
  $ fnmap --mermaid file --dir src   Generate file-level call graphs
  $ fnmap --mermaid project          Generate project-level call graph
  $ fnmap --init                     Create config file
`
    );

  return program;
}

export { program };
