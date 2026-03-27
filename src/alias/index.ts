/**
 * 别名导入转换模块 - 将 ../ 相对路径导入转换为 @ 别名导入
 * 规则：仅替换 ../ 开头的导入，./ 同层导入不替换
 */
import fs from 'fs';
import path from 'path';
import parser from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import { logger } from '../cli';
import { COLORS } from '../constants';
import { normalizePath } from '../validation';

// 处理 ESM/CJS 兼容性
const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as { default: typeof _traverse }).default;
const generate = typeof _generate === 'function' ? _generate : (_generate as { default: typeof _generate }).default;

/** 别名映射配置 */
export interface AliasConfig {
  /** 别名前缀，如 '@' */
  alias: string;
  /** 对应的目录（相对于项目根，posix 格式），如 'src' */
  target: string;
}

/** 单个文件的转换结果 */
export interface AliasTransformResult {
  /** 转换后的代码，null 表示无变化 */
  code: string | null;
  /** 转换的导入路径记录：[原始路径, 新路径] */
  changes: Array<[string, string]>;
}

/**
 * 从 tsconfig.json 中检测路径别名配置
 * 支持 tsconfig.json 中的 compilerOptions.paths 和 compilerOptions.baseUrl
 */
export function detectAliasFromTsconfig(projectDir: string): AliasConfig[] {
  const tsconfigNames = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.build.json'];
  const aliases: AliasConfig[] = [];

  for (const name of tsconfigNames) {
    const tsconfigPath = path.join(projectDir, name);
    if (!fs.existsSync(tsconfigPath)) continue;

    try {
      const content = fs.readFileSync(tsconfigPath, 'utf-8');
      // 移除 JSON 注释（tsconfig 支持注释）
      const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const tsconfig = JSON.parse(cleaned) as {
        compilerOptions?: {
          baseUrl?: string;
          paths?: Record<string, string[]>;
        };
      };

      const compilerOptions = tsconfig.compilerOptions;
      if (!compilerOptions?.paths) continue;

      const baseUrl = compilerOptions.baseUrl ?? '.';

      for (const [pattern, targets] of Object.entries(compilerOptions.paths)) {
        if (!targets || targets.length === 0) continue;

        const firstTarget = targets[0];
        if (!firstTarget) continue;

        // 处理 "@/*": ["./src/*"] 这种模式
        const alias = pattern.replace(/\/\*$/, '');
        const targetPath = firstTarget.replace(/\/\*$/, '').replace(/^\.\//, '');

        // 合并 baseUrl 和 target 路径（统一使用 posix 格式）
        const normalizedBaseUrl = baseUrl.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
        const resolvedTarget = normalizedBaseUrl === '' || normalizedBaseUrl === '.'
          ? targetPath
          : path.posix.join(normalizedBaseUrl, targetPath);

        aliases.push({ alias, target: resolvedTarget });
      }

      if (aliases.length > 0) {
        logger.info(`从 ${name} 检测到 ${aliases.length} 个路径别名`);
        return aliases;
      }
    } catch {
      logger.warn(`解析 ${name} 失败，跳过`);
    }
  }

  return aliases;
}

/**
 * 将相对导入路径转换为别名路径
 * @param importPath 原始导入路径
 * @param fileDir 当前文件所在目录（相对于项目根，posix 格式）
 * @param aliases 别名配置列表
 * @returns 转换后的路径，若无需转换则返回 null
 */
export function resolveAliasPath(
  importPath: string,
  fileDir: string,
  aliases: AliasConfig[],
): string | null {
  // 仅处理 ../ 开头的相对路径（跨层引用）
  if (!importPath.startsWith('../')) return null;

  // 解析为规范化的相对路径（相对于项目根）
  const resolved = path.posix.normalize(path.posix.join(fileDir, importPath));

  // 尝试匹配别名（优先匹配更长的 target，即更具体的路径）
  const sorted = [...aliases].sort((a, b) => b.target.length - a.target.length);
  for (const { alias, target } of sorted) {
    if (resolved === target || resolved.startsWith(target + '/')) {
      const relative = resolved === target ? '' : resolved.slice(target.length + 1);
      return relative ? `${alias}/${relative}` : alias;
    }
  }

  return null;
}

/** 处理单个 source 节点的路径替换 */
function processSource(
  source: t.StringLiteral,
  fileDir: string,
  aliases: AliasConfig[],
  changes: Array<[string, string]>,
): void {
  const original = source.value;
  const aliasPath = resolveAliasPath(original, fileDir, aliases);
  if (aliasPath) {
    source.value = aliasPath;
    changes.push([original, aliasPath]);
  }
}

/**
 * 对源代码进行 AST 转换，将 ../ 相对导入替换为别名导入
 * @param code 源代码字符串
 * @param filePath 文件路径（相对于项目根，posix 格式）
 * @param aliases 别名配置
 * @returns 转换结果
 */
export function transformImports(
  code: string,
  filePath: string,
  aliases: AliasConfig[],
): AliasTransformResult {
  const fileDir = path.posix.dirname(filePath);
  const changes: Array<[string, string]> = [];

  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy', 'jsx'],
  });

  traverse(ast, {
    // 处理 import 声明
    ImportDeclaration(nodePath) {
      processSource(nodePath.node.source, fileDir, aliases, changes);
    },
    // 处理 export ... from '...' 声明
    ExportNamedDeclaration(nodePath) {
      if (nodePath.node.source) {
        processSource(nodePath.node.source, fileDir, aliases, changes);
      }
    },
    ExportAllDeclaration(nodePath) {
      processSource(nodePath.node.source, fileDir, aliases, changes);
    },
    // 处理动态 import()
    CallExpression(nodePath) {
      if (
        nodePath.node.callee.type === 'Import' &&
        nodePath.node.arguments.length > 0 &&
        t.isStringLiteral(nodePath.node.arguments[0])
      ) {
        processSource(nodePath.node.arguments[0], fileDir, aliases, changes);
      }
    },
  });

  if (changes.length === 0) {
    return { code: null, changes };
  }

  const output = generate(ast, {
    retainLines: true,
    retainFunctionParens: true,
  });

  return { code: output.code, changes };
}

/** 别名转换命令的选项 */
export interface AliasCommandOptions {
  /** 是否预览模式（不写入文件） */
  dryRun: boolean;
  /** 要处理的文件列表（绝对路径） */
  files: string[];
  /** 项目根目录 */
  projectDir: string;
  /** 手动指定别名配置（可选，默认从 tsconfig 检测） */
  aliases?: AliasConfig[];
}

/**
 * 执行别名转换命令
 */
export function executeAliasConvert(options: AliasCommandOptions): void {
  const { dryRun, files, projectDir } = options;

  // 检测别名配置
  const aliases = options.aliases ?? detectAliasFromTsconfig(projectDir);
  if (aliases.length === 0) {
    logger.stats(`${COLORS.red}✗${COLORS.reset} 未检测到路径别名配置，请确认 tsconfig.json 中配置了 compilerOptions.paths`);
    return;
  }

  logger.stats(`${COLORS.bold}fnmap - 别名导入转换${COLORS.reset}`);
  logger.stats('别名配置:');
  for (const { alias, target } of aliases) {
    logger.stats(`  ${alias} → ${target}`);
  }
  logger.stats(`模式: ${dryRun ? '预览（dry-run）' : '写入'}`);
  logger.stats('');

  let totalChanges = 0;
  let filesChanged = 0;

  for (const filePath of files) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const relativePath = normalizePath(path.relative(projectDir, filePath));
    const result = transformImports(code, relativePath, aliases);

    if (result.changes.length > 0) {
      filesChanged++;
      totalChanges += result.changes.length;
      logger.stats(`${relativePath} (${result.changes.length} 处替换):`);
      for (const [from, to] of result.changes) {
        logger.stats(`  ${from} → ${to}`);
      }

      if (!dryRun && result.code) {
        fs.writeFileSync(filePath, result.code, 'utf-8');
      }
    }
  }

  logger.stats('');
  logger.stats(`总计: ${COLORS.green}${filesChanged}${COLORS.reset} 个文件, ${COLORS.green}${totalChanges}${COLORS.reset} 处替换`);
  if (dryRun) {
    logger.stats(`（预览模式，未写入文件。添加 ${COLORS.bold}--write${COLORS.reset} 参数执行实际替换）`);
  }
}
