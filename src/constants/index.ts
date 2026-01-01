import type { FnmapConfig } from '../types';

// ANSI颜色常量
export const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
} as const;

// 文件大小限制 (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 最大目录深度限制
export const MAX_DIR_DEPTH = 50;

// 默认支持的文件扩展名
export const SUPPORTED_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

// 默认排除的目录
export const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.cache'
] as const;

// 默认配置
export const DEFAULT_CONFIG: Required<FnmapConfig> = {
  enable: true,
  include: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.mjs'],
  exclude: []
};
