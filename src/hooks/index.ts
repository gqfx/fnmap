import fs from 'fs';
import path from 'path';
import type { DetectedTool } from '../types';

/** 读取 package.json 的所有依赖名 */
function readDeps(projectDir: string): Set<string> {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ]);
  } catch {
    return new Set();
  }
}

/** 检查配置文件是否存在，返回匹配的文件名 */
function findConfigFile(projectDir: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      try {
        const entries = fs.readdirSync(projectDir).filter(f => f.startsWith(prefix));
        if (entries.length > 0) return entries[0] ?? null;
      } catch { /* ignore */ }
    } else {
      if (fs.existsSync(path.join(projectDir, pattern))) return pattern;
    }
  }
  return null;
}

/** 判断依赖来源描述 */
function depSource(projectDir: string, depName: string): string {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return '';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.devDependencies?.[depName]) return 'devDependencies';
    if (pkg.dependencies?.[depName]) return 'dependencies';
  } catch { /* ignore */ }
  return '';
}

/** 工具检测规则定义 */
interface ToolRule {
  name: string;
  depNames: string[];
  configPatterns: string[];
  level: 'block' | 'warn';
}

/** 支持检测的工具规则列表 */
const TOOL_RULES: ToolRule[] = [
  { name: 'typescript', depNames: ['typescript'], configPatterns: ['tsconfig.json'], level: 'block' },
  { name: 'eslint', depNames: ['eslint'], configPatterns: ['.eslintrc*', 'eslint.config.*'], level: 'warn' },
  { name: 'biome', depNames: ['@biomejs/biome'], configPatterns: ['biome.json', 'biome.jsonc'], level: 'warn' },
  { name: 'prettier', depNames: ['prettier'], configPatterns: ['.prettierrc*', 'prettier.config.*'], level: 'warn' },
  { name: 'vitest', depNames: ['vitest'], configPatterns: [], level: 'block' },
  { name: 'jest', depNames: ['jest'], configPatterns: ['jest.config.*'], level: 'block' },
  { name: 'mocha', depNames: ['mocha'], configPatterns: ['.mocharc*'], level: 'block' },
];

/** 检测项目中安装的工具 */
export function detectTools(projectDir: string): DetectedTool[] {
  const deps = readDeps(projectDir);

  return TOOL_RULES.map(rule => {
    const foundDep = rule.depNames.find(d => deps.has(d));
    if (foundDep) {
      const src = depSource(projectDir, foundDep);
      return { name: rule.name, detected: true, source: src || 'dependencies', level: rule.level };
    }
    const configFile = findConfigFile(projectDir, rule.configPatterns);
    if (configFile) {
      return { name: rule.name, detected: true, source: configFile, level: rule.level };
    }
    return { name: rule.name, detected: false, source: '', level: rule.level };
  });
}
