#!/usr/bin/env node
/**
 * fnmap - AI Code Indexing Tool
 * Analyzes JS/TS code structure and generates structured code maps to help AI understand code quickly
 */

// 导出类型
export type {
  ErrorType,
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
  FnmapConfig,
  LoadedConfig,
  ImportInfo,
  FunctionInfo,
  MethodInfo,
  ClassInfo,
  ConstantInfo,
  CallGraph,
  FileInfo,
  ParseErrorResult,
  AnalyzeResult,
  ProcessResult,
  ProcessSuccess,
  ProcessFailure,
  CLIOptions,
  ErrorContext,
  FileInfoEntry
} from './types';

// 导出类型守卫
export { ErrorTypes, isParseError, isProcessSuccess, isProcessFailure, isValidationSuccess, isValidationFailure } from './types';

// 导出常量
export { COLORS, SUPPORTED_EXTENSIONS, DEFAULT_EXCLUDES, DEFAULT_CONFIG, MAX_FILE_SIZE, MAX_DIR_DEPTH } from './constants';

// 导出验证函数
export { validateFilePath, validateConfig, formatError } from './validation';

// 导出配置函数
export { loadConfig, mergeConfig } from './config';

// 导出 CLI
export { setupCLI, getVersion, logger, setQuietMode, isQuietMode, program } from './cli';

// 导出扫描器
export { scanDirectory, getGitChangedFiles } from './scanner';

// 导出分析器
export { analyzeFile, extractJSDocDescription } from './analyzer';

// 导出生成器
export { generateHeader, removeExistingHeaders, generateAiMap, generateFileMermaid, generateProjectMermaid } from './generator';

// 导出处理器
export { processFile } from './processor';

// 导出主函数
export { main } from './main';

// CLI 入口
if (require.main === module) {
  const { main } = require('./main');
  main();
}
