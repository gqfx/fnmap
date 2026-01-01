import fs from 'fs';
import path from 'path';
import type { FnmapConfig, LoadedConfig } from '../types';
import { ErrorTypes } from '../types';
import { DEFAULT_CONFIG } from '../constants';
import { validateConfig, formatError } from '../validation';
import { logger } from '../cli';

/**
 * 加载配置文件
 * 优先级: .fnmaprc > .fnmaprc.json > package.json#fnmap > 默认配置
 */
export function loadConfig(projectDir: string): LoadedConfig {
  const configFiles = ['.fnmaprc', '.fnmaprc.json'];

  for (const file of configFiles) {
    const configPath = path.join(projectDir, file);
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');

        // 检查是否为空文件
        if (!content.trim()) {
          logger.warn(`Config file is empty: ${file}. Using default config / 配置文件为空,使用默认配置`);
          continue;
        }

        let config: unknown;
        try {
          config = JSON.parse(content);
        } catch (parseError) {
          const pe = parseError as Error & { lineNumber?: number; columnNumber?: number };
          const errorMsg = formatError(
            ErrorTypes.CONFIG_ERROR,
            `Failed to parse config file: ${file} / 配置文件解析失败`,
            {
              file: configPath,
              line: pe.lineNumber,
              column: pe.columnNumber,
              suggestion: 'Check JSON syntax, ensure proper quotes and commas / 检查 JSON 语法,确保引号和逗号正确'
            }
          );
          logger.warn(errorMsg);
          continue;
        }

        // 验证配置
        const validation = validateConfig(config);
        if (!validation.valid) {
          logger.warn(`Invalid config in ${file}: ${validation.error}`);
          continue;
        }

        return { config: config as FnmapConfig, source: file };
      } catch (e) {
        const error = e as Error;
        const errorMsg = formatError(
          ErrorTypes.FILE_READ_ERROR,
          `Failed to read config file: ${file} / 配置文件读取失败`,
          {
            file: configPath,
            suggestion: error.message
          }
        );
        logger.warn(errorMsg);
      }
    }
  }

  // 检查 package.json 中的 fnmap 字段
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { fnmap?: unknown };
      if (pkg.fnmap) {
        const validation = validateConfig(pkg.fnmap);
        if (!validation.valid) {
          logger.warn(`Invalid fnmap config in package.json: ${validation.error}`);
        } else {
          return { config: pkg.fnmap as FnmapConfig, source: 'package.json#fnmap' };
        }
      }
    } catch {
      // ignore package.json parse errors
    }
  }

  return { config: null, source: null };
}

/**
 * 合并配置
 */
export function mergeConfig(userConfig: FnmapConfig | null): Required<FnmapConfig> {
  if (!userConfig) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    exclude: [...(userConfig.exclude ?? [])]
  };
}
