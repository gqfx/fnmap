// ============== 错误类型 ==============

export const ErrorTypes = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE'
} as const;

export type ErrorType = (typeof ErrorTypes)[keyof typeof ErrorTypes];

// ============== 验证结果类型 ==============

export interface ValidationSuccess {
  valid: true;
}

export interface ValidationFailure {
  valid: false;
  error: string;
  errorType?: ErrorType;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// ============== 配置类型 ==============

export interface FnmapConfig {
  enable?: boolean;
  include?: string[];
  exclude?: string[];
}

export interface LoadedConfig {
  config: FnmapConfig | null;
  source: string | null;
}

// ============== 代码分析结果类型 ==============

export interface ImportInfo {
  module: string;
  members: string[];
  usedIn: string[];
}

export interface FunctionInfo {
  name: string;
  params: string;
  startLine: number;
  endLine: number;
  description: string;
}

export interface MethodInfo {
  name: string;
  params: string;
  line: number;
  static: boolean;
  kind: 'method' | 'get' | 'set' | 'constructor';
  description: string;
}

export interface ClassInfo {
  name: string;
  superClass: string | null;
  startLine: number;
  endLine: number;
  methods: MethodInfo[];
  description: string;
}

export interface ConstantInfo {
  name: string;
  line: number;
  description: string;
}

export type CallGraph = Record<string, string[]>;

export interface FileInfo {
  description: string;
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  constants: ConstantInfo[];
  callGraph: CallGraph;
  isPureType?: boolean; // 是否为纯类型文件（只有 type/interface 声明）
}

export interface ParseErrorResult {
  parseError: string;
  errorType: ErrorType;
  loc?: { line: number; column: number };
}

export type AnalyzeResult = FileInfo | ParseErrorResult;

// ============== 处理结果类型 ==============

export interface ProcessSuccess {
  success: true;
  info: FileInfo;
}

export interface ProcessFailure {
  success: false;
  error: string;
  errorType: ErrorType;
  loc?: { line: number; column: number };
}

export type ProcessResult = ProcessSuccess | ProcessFailure;

// ============== CLI 类型 ==============

export interface CLIOptions {
  files?: string[];
  dir?: string;
  project: string;
  changed?: boolean;
  staged?: boolean;
  mermaid?: boolean | 'file' | 'project';
  quiet?: boolean;
  init?: boolean;
  clear?: boolean;
}

// init 命令的交互式选项
export interface InitOptions {
  gitignore: boolean; // 是否添加 .gitignore 规则
  claudeMd: 'project' | 'user' | 'none'; // 写入项目还是用户的 CLAUDE.md
  cursorRules: boolean; // 是否写入 .cursorrules
}

// ============== 错误格式化上下文 ==============

export interface ErrorContext {
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

// ============== 文件信息映射 ==============

export interface FileInfoEntry {
  relativePath: string;
  info: FileInfo;
}

// ============== 类型守卫 ==============

export function isParseError(result: AnalyzeResult): result is ParseErrorResult {
  return 'parseError' in result;
}

export function isProcessSuccess(result: ProcessResult): result is ProcessSuccess {
  return result.success === true;
}

export function isProcessFailure(result: ProcessResult): result is ProcessFailure {
  return result.success === false;
}

export function isValidationSuccess(result: ValidationResult): result is ValidationSuccess {
  return result.valid === true;
}

export function isValidationFailure(result: ValidationResult): result is ValidationFailure {
  return result.valid === false;
}
