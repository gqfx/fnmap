export interface FunctionPath {
  name: string;
  params: string;
  startLine: number;
  endLine: number;
  description: string;
}

export interface ClassMethod {
  name: string;
  params: string;
  line: number;
  static: boolean;
  kind: string;
  description: string;
}

export interface ClassPath {
  name: string;
  superClass: string | null;
  startLine: number;
  endLine: number;
  methods: ClassMethod[];
  description: string;
}

export interface ImportInfo {
  module: string;
  members: string[];
  usedIn: string[]; // Or Set<string> if not converted? index.js converts to array at end?
}

export interface ConstantInfo {
  name: string;
  line: number;
  description: string;
}

export interface AnalyzeResult {
  description?: string;
  imports?: ImportInfo[];
  functions?: FunctionPath[];
  classes?: ClassPath[];
  constants?: ConstantInfo[];
  callGraph?: Record<string, string[]>;
  parseError?: string;
  errorType?: string;
  loc?: { line: number; column: number };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorType?: string;
}

export interface ProcessResult {
  success: boolean;
  info?: AnalyzeResult;
  error?: string;
  errorType?: string;
  loc?: { line: number; column: number };
}

export interface Config {
  enable?: boolean;
  include?: string[];
  exclude?: string[];
}

export const ErrorTypes: {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND';
  FILE_READ_ERROR: 'FILE_READ_ERROR';
  PARSE_ERROR: 'PARSE_ERROR';
  CONFIG_ERROR: 'CONFIG_ERROR';
  VALIDATION_ERROR: 'VALIDATION_ERROR';
  PERMISSION_ERROR: 'PERMISSION_ERROR';
  FILE_TOO_LARGE: 'FILE_TOO_LARGE';
};

export function validateFilePath(filePath: any): ValidationResult;
export function validateConfig(config: any): ValidationResult;
export function formatError(errorType: string, message: string, context?: any): string;
export function loadConfig(projectDir: string): { config: Config | null; source: string | null };
export function scanDirectory(dir: string, baseDir?: string, excludes?: string[]): string[];
export function getGitChangedFiles(projectDir: string, stagedOnly?: boolean): string[];
export function analyzeFile(code: string | null | undefined, filePath: string | null): AnalyzeResult;
export function processFile(filePath: string, config: any): ProcessResult;
export function generateHeader(info: AnalyzeResult, filePath: string): string;
export function removeExistingHeaders(code: string): string;
export function generateAiMap(projectDir: string, filesInfo: any[]): string;
export function generateFileMermaid(filePath: string, info: AnalyzeResult): string | null;
export function generateProjectMermaid(projectDir: string, allFilesInfo: any[]): string;
export function main(): void;
