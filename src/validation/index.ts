import fs from 'fs';
import type { ValidationResult, ErrorContext, FnmapConfig, ErrorType } from '../types';
import { ErrorTypes } from '../types';
import { MAX_FILE_SIZE } from '../constants';

/**
 * 验证文件路径
 */
export function validateFilePath(filePath: unknown): ValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return {
      valid: false,
      error: 'File path is required and must be a string / 文件路径必须是字符串',
      errorType: ErrorTypes.VALIDATION_ERROR
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      error: `File not found: ${filePath} / 文件不存在: ${filePath}`,
      errorType: ErrorTypes.FILE_NOT_FOUND
    };
  }

  try {
    const stats = fs.statSync(filePath);

    if (!stats.isFile()) {
      return {
        valid: false,
        error: `Path is not a file: ${filePath} / 路径不是文件: ${filePath}`,
        errorType: ErrorTypes.VALIDATION_ERROR
      };
    }

    if (stats.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB > ${MAX_FILE_SIZE / 1024 / 1024}MB): ${filePath} / 文件过大`,
        errorType: ErrorTypes.FILE_TOO_LARGE
      };
    }
  } catch (e) {
    const error = e as Error;
    return {
      valid: false,
      error: `Cannot access file: ${filePath}. Reason: ${error.message} / 无法访问文件`,
      errorType: ErrorTypes.PERMISSION_ERROR
    };
  }

  return { valid: true };
}

/**
 * 验证配置对象
 */
export function validateConfig(config: unknown): ValidationResult {
  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      error: 'Config must be an object / 配置必须是对象'
    };
  }

  const cfg = config as Partial<FnmapConfig>;

  if (cfg.enable !== undefined && typeof cfg.enable !== 'boolean') {
    return {
      valid: false,
      error: 'Config.enable must be a boolean / enable 字段必须是布尔值'
    };
  }

  if (cfg.include !== undefined && !Array.isArray(cfg.include)) {
    return {
      valid: false,
      error: 'Config.include must be an array / include 字段必须是数组'
    };
  }

  if (cfg.exclude !== undefined && !Array.isArray(cfg.exclude)) {
    return {
      valid: false,
      error: 'Config.exclude must be an array / exclude 字段必须是数组'
    };
  }

  return { valid: true };
}

/**
 * 格式化错误信息
 */
export function formatError(
  _errorType: ErrorType | string,
  message: string,
  context: ErrorContext = {}
): string {
  const parts: string[] = [message];

  if (context.file) {
    parts.push(`File: ${context.file}`);
  }

  if (context.line !== undefined && context.column !== undefined) {
    parts.push(`Location: Line ${context.line}, Column ${context.column}`);
  }

  if (context.suggestion) {
    parts.push(`Suggestion: ${context.suggestion}`);
  }

  return parts.join('\n  ');
}
