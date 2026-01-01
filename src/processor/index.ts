import fs from 'fs';
import type { ProcessResult } from '../types';
import { ErrorTypes, isParseError } from '../types';
import { validateFilePath, formatError } from '../validation';
import { analyzeFile } from '../analyzer';

/**
 * 处理单个文件(只分析,不修改文件)
 */
export function processFile(filePath: string): ProcessResult {
  // 使用验证函数
  const validation = validateFilePath(filePath);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      errorType: validation.errorType ?? ErrorTypes.VALIDATION_ERROR
    };
  }

  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const result = analyzeFile(code, filePath);

    if (!result) {
      return {
        success: false,
        error: 'Analysis returned null / 分析返回空值',
        errorType: ErrorTypes.PARSE_ERROR
      };
    }

    // 检查是否有解析错误
    if (isParseError(result)) {
      return {
        success: false,
        error: result.parseError,
        errorType: result.errorType,
        loc: result.loc
      };
    }

    return { success: true, info: result };
  } catch (e) {
    const error = e as Error;
    // 捕获文件读取错误
    const errorMsg = formatError(ErrorTypes.FILE_READ_ERROR, `Failed to read or process file / 读取或处理文件失败`, {
      file: filePath,
      suggestion: error.message
    });
    return {
      success: false,
      error: errorMsg,
      errorType: ErrorTypes.FILE_READ_ERROR
    };
  }
}
