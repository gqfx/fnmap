# fnmap --hooks 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 fnmap 新增 `--hooks` 命令，自动检测项目工具链并生成 Claude Code hooks 配置

**Architecture:** 新建 `src/hooks/index.ts` 模块，包含工具检测、脚本生成、settings.json 合并写入三大功能。CLI 新增 `--hooks` 选项，`--init` 流程中集成为新步骤。

**Tech Stack:** Node.js fs/path, JSON merge, bash script 模板生成

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `src/hooks/index.ts` | 工具检测、脚本生成、hooks 安装全部逻辑 |
| 创建 | `test/hooks.test.ts` | hooks 模块单元测试 |
| 修改 | `src/types/index.ts` | CLIOptions 添加 `hooks` 字段，新增 `DetectedTool` 类型 |
| 修改 | `src/cli/index.ts` | 新增 `--hooks` 选项 |
| 修改 | `src/main.ts` | 调用 hooks 模块，`--init` 集成 |
| 修改 | `src/index.ts` | 导出 hooks 模块 |

---

### Task 1: 类型定义

**Files:**
- Modify: `src/types/index.ts:128-139`

- [ ] **Step 1: 添加 hooks 相关类型**

在 `CLIOptions` 中添加 `hooks` 字段，新增 `DetectedTool` 接口：

```typescript
// 在 CLIOptions 中添加
export interface CLIOptions {
  files?: string[];
  dir?: string;
  project: string;
  changed?: boolean;
  staged?: boolean;
  merge?: boolean;
  mermaid?: boolean | 'file' | 'project';
  log?: boolean;
  init?: boolean;
  clear?: boolean;
  hooks?: boolean; // 新增
}

// 在 InitOptions 之后添加

// hooks 检测到的工具信息
export interface DetectedTool {
  name: string;        // 工具名：typescript, eslint, biome, prettier, vitest, jest, mocha
  detected: boolean;   // 是否检测到
  source: string;      // 检测来源描述：如 "devDependencies" 或 "tsconfig.json"
  level: 'block' | 'warn'; // 错误反馈级别
}
```

- [ ] **Step 2: 确认类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/types/index.ts
git commit -m "feat: 添加 hooks 相关类型定义"
```

---

### Task 2: CLI 选项注册

**Files:**
- Modify: `src/cli/index.ts:86`

- [ ] **Step 1: 在 `--clear` 后添加 `--hooks` 选项**

在 `.option('--clear', ...)` 之后添加：

```typescript
    .option('--hooks', 'Setup Claude Code hooks for auto quality checks')
```

- [ ] **Step 2: 更新帮助文本**

在 Examples 部分添加：

```
  $ fnmap --hooks                    Setup Claude Code hooks
```

- [ ] **Step 3: 确认类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/cli/index.ts
git commit -m "feat: 添加 --hooks CLI 选项"
```

---

### Task 3: 工具检测逻辑

**Files:**
- Create: `src/hooks/index.ts`
- Create: `test/hooks.test.ts`

- [ ] **Step 1: 编写 detectTools 测试**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { detectTools } from '../src/hooks';

describe('detectTools', () => {
  const tempDir = path.join(__dirname, 'fixtures', 'temp-hooks-test');

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('应检测 package.json 中的 typescript', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { typescript: '^5.0.0' }
    }));
    const tools = detectTools(tempDir);
    const ts = tools.find(t => t.name === 'typescript');
    expect(ts?.detected).toBe(true);
    expect(ts?.source).toContain('devDependencies');
    expect(ts?.level).toBe('block');
  });

  it('应检测 tsconfig.json 文件', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
    const tools = detectTools(tempDir);
    const ts = tools.find(t => t.name === 'typescript');
    expect(ts?.detected).toBe(true);
    expect(ts?.source).toContain('tsconfig.json');
  });

  it('应检测 eslint（依赖方式）', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { eslint: '^8.0.0' }
    }));
    const tools = detectTools(tempDir);
    const eslint = tools.find(t => t.name === 'eslint');
    expect(eslint?.detected).toBe(true);
    expect(eslint?.level).toBe('warn');
  });

  it('应检测 eslint.config.js 文件', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), '');
    const tools = detectTools(tempDir);
    const eslint = tools.find(t => t.name === 'eslint');
    expect(eslint?.detected).toBe(true);
    expect(eslint?.source).toContain('eslint.config.js');
  });

  it('应检测 biome', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { '@biomejs/biome': '^1.0.0' }
    }));
    const tools = detectTools(tempDir);
    const biome = tools.find(t => t.name === 'biome');
    expect(biome?.detected).toBe(true);
    expect(biome?.level).toBe('warn');
  });

  it('应检测 prettier', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { prettier: '^3.0.0' }
    }));
    const tools = detectTools(tempDir);
    const prettier = tools.find(t => t.name === 'prettier');
    expect(prettier?.detected).toBe(true);
    expect(prettier?.level).toBe('warn');
  });

  it('应检测 vitest', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      devDependencies: { vitest: '^1.0.0' }
    }));
    const tools = detectTools(tempDir);
    const vitest = tools.find(t => t.name === 'vitest');
    expect(vitest?.detected).toBe(true);
    expect(vitest?.level).toBe('block');
  });

  it('应检测 jest（配置文件方式）', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    fs.writeFileSync(path.join(tempDir, 'jest.config.js'), '');
    const tools = detectTools(tempDir);
    const jest = tools.find(t => t.name === 'jest');
    expect(jest?.detected).toBe(true);
  });

  it('无工具时全部 detected 为 false', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({}));
    const tools = detectTools(tempDir);
    expect(tools.every(t => !t.detected)).toBe(true);
  });

  it('无 package.json 时不崩溃', () => {
    const tools = detectTools(tempDir);
    expect(tools.every(t => !t.detected)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/hooks.test.ts`
Expected: FAIL — `detectTools` 不存在

- [ ] **Step 3: 实现 detectTools**

创建 `src/hooks/index.ts`：

```typescript
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
    // 支持前缀匹配（如 .eslintrc*）
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      const entries = fs.readdirSync(projectDir).filter(f => f.startsWith(prefix));
      if (entries.length > 0) return entries[0];
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

// 工具检测规则定义
interface ToolRule {
  name: string;
  depNames: string[];
  configPatterns: string[];
  level: 'block' | 'warn';
}

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
    // 检查依赖
    const foundDep = rule.depNames.find(d => deps.has(d));
    if (foundDep) {
      const src = depSource(projectDir, foundDep);
      return { name: rule.name, detected: true, source: src || 'dependencies', level: rule.level };
    }
    // 检查配置文件
    const configFile = findConfigFile(projectDir, rule.configPatterns);
    if (configFile) {
      return { name: rule.name, detected: true, source: configFile, level: rule.level };
    }
    return { name: rule.name, detected: false, source: '', level: rule.level };
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/hooks.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/hooks/index.ts test/hooks.test.ts
git commit -m "feat: 添加项目工具链自动检测"
```

---

### Task 4: 质量检查脚本生成

**Files:**
- Modify: `src/hooks/index.ts`
- Modify: `test/hooks.test.ts`

- [ ] **Step 1: 编写 generateQualityScript 测试**

在 `test/hooks.test.ts` 中追加：

```typescript
import { detectTools, generateQualityScript } from '../src/hooks';

describe('generateQualityScript', () => {
  it('始终包含变更检测和 fnmap 更新', () => {
    const script = generateQualityScript([]);
    expect(script).toContain('git diff');
    expect(script).toContain('fnmap --changed');
    expect(script).toContain('Auto-generated by fnmap --hooks');
  });

  it('检测到 typescript 时包含 tsc 检查（block 级别）', () => {
    const tools: DetectedTool[] = [
      { name: 'typescript', detected: true, source: 'devDependencies', level: 'block' }
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('tsc --noEmit');
    expect(script).toContain('BLOCK_ERRORS');
  });

  it('检测到 eslint 时包含 eslint 检查（warn 级别）', () => {
    const tools: DetectedTool[] = [
      { name: 'eslint', detected: true, source: 'devDependencies', level: 'warn' }
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('eslint');
    expect(script).toContain('WARN_MESSAGES');
  });

  it('检测到 biome 时包含 biome 检查', () => {
    const tools: DetectedTool[] = [
      { name: 'biome', detected: true, source: 'devDependencies', level: 'warn' }
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('biome check');
  });

  it('检测到 prettier 时包含 prettier 检查', () => {
    const tools: DetectedTool[] = [
      { name: 'prettier', detected: true, source: 'devDependencies', level: 'warn' }
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('prettier --check');
  });

  it('检测到 vitest 时包含测试运行（block 级别）', () => {
    const tools: DetectedTool[] = [
      { name: 'vitest', detected: true, source: 'devDependencies', level: 'block' }
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('vitest run');
    expect(script).toContain('BLOCK_ERRORS');
  });

  it('检测到 jest 时包含 jest 运行', () => {
    const tools: DetectedTool[] = [
      { name: 'jest', detected: true, source: 'devDependencies', level: 'block' }
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('npx jest');
  });

  it('检测到 mocha 时包含 mocha 运行', () => {
    const tools: DetectedTool[] = [
      { name: 'mocha', detected: true, source: 'devDependencies', level: 'block' }
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('npx mocha');
  });

  it('未检测到的工具不包含在脚本中', () => {
    const tools: DetectedTool[] = [
      { name: 'eslint', detected: false, source: '', level: 'warn' }
    ];
    const script = generateQualityScript(tools);
    expect(script).not.toContain('eslint');
  });

  it('多个工具组合生成', () => {
    const tools: DetectedTool[] = [
      { name: 'typescript', detected: true, source: 'devDependencies', level: 'block' },
      { name: 'prettier', detected: true, source: 'devDependencies', level: 'warn' },
      { name: 'vitest', detected: true, source: 'devDependencies', level: 'block' },
    ];
    const script = generateQualityScript(tools);
    expect(script).toContain('tsc --noEmit');
    expect(script).toContain('prettier --check');
    expect(script).toContain('vitest run');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/hooks.test.ts`
Expected: FAIL — `generateQualityScript` 不存在

- [ ] **Step 3: 实现 generateQualityScript**

在 `src/hooks/index.ts` 中添加：

```typescript
// 各工具的检查脚本片段模板
const TOOL_SCRIPTS: Record<string, { check: string; level: 'block' | 'warn' }> = {
  typescript: {
    check: `# TypeScript 类型检查
TS_OUTPUT=$(npx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  TS_ERRORS=$(echo "$TS_OUTPUT" | head -30)
  BLOCK_ERRORS="$BLOCK_ERRORS\\n[TypeScript 类型错误]\\n$TS_ERRORS"
fi`,
    level: 'block'
  },
  eslint: {
    check: `# ESLint 检查（仅变更文件）
LINT_OUTPUT=$(echo "$ALL_CHANGED" | xargs npx eslint --no-warn 2>&1)
if [ $? -ne 0 ]; then
  LINT_ERRORS=$(echo "$LINT_OUTPUT" | head -30)
  WARN_MESSAGES="$WARN_MESSAGES\\n[ESLint 问题]\\n$LINT_ERRORS"
fi`,
    level: 'warn'
  },
  biome: {
    check: `# Biome 检查（仅变更文件）
BIOME_OUTPUT=$(echo "$ALL_CHANGED" | xargs npx biome check 2>&1)
if [ $? -ne 0 ]; then
  BIOME_ERRORS=$(echo "$BIOME_OUTPUT" | head -30)
  WARN_MESSAGES="$WARN_MESSAGES\\n[Biome 问题]\\n$BIOME_ERRORS"
fi`,
    level: 'warn'
  },
  prettier: {
    check: `# Prettier 格式检查（仅变更文件）
PRETTIER_OUTPUT=$(echo "$ALL_CHANGED" | xargs npx prettier --check 2>&1)
if [ $? -ne 0 ]; then
  PRETTIER_ERRORS=$(echo "$PRETTIER_OUTPUT" | grep -v '^\\[warn\\]' | head -20)
  WARN_MESSAGES="$WARN_MESSAGES\\n[Prettier 格式问题]\\n$PRETTIER_ERRORS"
fi`,
    level: 'warn'
  },
  vitest: {
    check: `# Vitest 测试
TEST_OUTPUT=$(npx vitest run 2>&1)
if [ $? -ne 0 ]; then
  TEST_ERRORS=$(echo "$TEST_OUTPUT" | tail -30)
  BLOCK_ERRORS="$BLOCK_ERRORS\\n[测试失败]\\n$TEST_ERRORS"
fi`,
    level: 'block'
  },
  jest: {
    check: `# Jest 测试
TEST_OUTPUT=$(npx jest 2>&1)
if [ $? -ne 0 ]; then
  TEST_ERRORS=$(echo "$TEST_OUTPUT" | tail -30)
  BLOCK_ERRORS="$BLOCK_ERRORS\\n[测试失败]\\n$TEST_ERRORS"
fi`,
    level: 'block'
  },
  mocha: {
    check: `# Mocha 测试
TEST_OUTPUT=$(npx mocha 2>&1)
if [ $? -ne 0 ]; then
  TEST_ERRORS=$(echo "$TEST_OUTPUT" | tail -30)
  BLOCK_ERRORS="$BLOCK_ERRORS\\n[测试失败]\\n$TEST_ERRORS"
fi`,
    level: 'block'
  }
};

/** 根据检测到的工具生成质量检查脚本 */
export function generateQualityScript(detectedTools: DetectedTool[]): string {
  const enabledTools = detectedTools.filter(t => t.detected);

  // 构建工具检查段
  const toolSections = enabledTools
    .map(t => TOOL_SCRIPTS[t.name]?.check)
    .filter(Boolean)
    .join('\n\n');

  return `#!/bin/bash
# Auto-generated by fnmap --hooks
# 自动代码质量检查脚本 - 由 fnmap 生成，勿手动编辑

cd "\${CLAUDE_PROJECT_DIR:-.}" || exit 0

# 检测变更的 JS/TS/Vue 文件
CHANGED=$(git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null | grep -E '\\.(js|ts|jsx|tsx|vue)$')
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | grep -E '\\.(js|ts|jsx|tsx|vue)$')
ALL_CHANGED=$(printf '%s\\n%s' "$CHANGED" "$UNTRACKED" | sort -u | grep -v '^$')

[ -z "$ALL_CHANGED" ] && exit 0

BLOCK_ERRORS=""
WARN_MESSAGES=""

# fnmap 索引更新
fnmap --changed 2>/dev/null || true

${toolSections}

# 转义 JSON 并输出结果
escape_json() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(d)));"
}

if [ -n "$BLOCK_ERRORS" ]; then
  ESCAPED=$(echo -e "$BLOCK_ERRORS" | escape_json)
  echo "{\\"decision\\":\\"block\\",\\"reason\\":$ESCAPED}"
elif [ -n "$WARN_MESSAGES" ]; then
  ESCAPED=$(echo -e "$WARN_MESSAGES" | escape_json)
  echo "{\\"systemMessage\\":$ESCAPED}"
fi
`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/hooks.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/hooks/index.ts test/hooks.test.ts
git commit -m "feat: 添加质量检查脚本动态生成"
```

---

### Task 5: settings.json 合并写入

**Files:**
- Modify: `src/hooks/index.ts`
- Modify: `test/hooks.test.ts`

- [ ] **Step 1: 编写 installHooks 测试**

在 `test/hooks.test.ts` 中追加：

```typescript
import { detectTools, generateQualityScript, installHooks } from '../src/hooks';

describe('installHooks', () => {
  const tempDir = path.join(__dirname, 'fixtures', 'temp-hooks-test');

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('应创建 .claude/settings.json 和 hooks 脚本', () => {
    const tools: DetectedTool[] = [
      { name: 'typescript', detected: true, source: 'devDependencies', level: 'block' }
    ];
    installHooks(tempDir, tools);

    expect(fs.existsSync(path.join(tempDir, '.claude', 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.claude', 'hooks', 'quality-check.sh'))).toBe(true);
  });

  it('settings.json 应包含 PreToolUse 和 Stop hooks', () => {
    const tools: DetectedTool[] = [
      { name: 'typescript', detected: true, source: 'devDependencies', level: 'block' }
    ];
    installHooks(tempDir, tools);

    const settings = JSON.parse(fs.readFileSync(path.join(tempDir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.PreToolUse[0].matcher).toBe('Edit|Write');
    expect(settings.hooks.Stop[0].hooks[0].command).toContain('quality-check.sh');
  });

  it('应合并已有的 settings.json 而非覆盖', () => {
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(git:*)'] },
      hooks: {
        SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }]
      }
    }, null, 2));

    installHooks(tempDir, []);

    const settings = JSON.parse(fs.readFileSync(path.join(tempDir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.permissions.allow).toContain('Bash(git:*)');
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();
  });

  it('幂等：重复安装应更新而非重复添加', () => {
    installHooks(tempDir, []);
    installHooks(tempDir, []);

    const settings = JSON.parse(fs.readFileSync(path.join(tempDir, '.claude', 'settings.json'), 'utf-8'));
    // PreToolUse 中只有一个 fnmap 相关的 hook entry
    const fnmapPreHooks = settings.hooks.PreToolUse.filter(
      (h: any) => h.hooks?.some((hh: any) => hh.statusMessage?.includes('fnmap'))
    );
    expect(fnmapPreHooks.length).toBe(1);

    // Stop 中只有一个 fnmap 相关的 hook entry
    const fnmapStopHooks = settings.hooks.Stop.filter(
      (h: any) => h.hooks?.some((hh: any) => hh.command?.includes('quality-check.sh'))
    );
    expect(fnmapStopHooks.length).toBe(1);
  });

  it('quality-check.sh 应有可执行内容', () => {
    const tools: DetectedTool[] = [
      { name: 'vitest', detected: true, source: 'devDependencies', level: 'block' }
    ];
    installHooks(tempDir, tools);

    const script = fs.readFileSync(path.join(tempDir, '.claude', 'hooks', 'quality-check.sh'), 'utf-8');
    expect(script).toContain('#!/bin/bash');
    expect(script).toContain('vitest run');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/hooks.test.ts`
Expected: FAIL — `installHooks` 不存在

- [ ] **Step 3: 实现 installHooks**

在 `src/hooks/index.ts` 中添加：

```typescript
import { COLORS } from '../constants';

// fnmap hooks 的固定标识，用于幂等更新
const FNMAP_PRE_HOOK_MARKER = '检查 .fnmap 文件保护...';
const FNMAP_STOP_HOOK_MARKER = 'quality-check.sh';

// PreToolUse 的内联 node 命令
const FNMAP_PROTECT_COMMAND = `node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const f=j.tool_input?.file_path||'';if(f.endsWith('.fnmap')){console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'.fnmap 文件由脚本自动维护，禁止手动修改。请使用 fnmap --changed 命令更新。'}}));}"`;

/** 将 fnmap hooks 安装到项目的 .claude 目录 */
export function installHooks(projectDir: string, detectedTools: DetectedTool[]): void {
  const claudeDir = path.join(projectDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const scriptPath = path.join(hooksDir, 'quality-check.sh');

  // 确保目录存在
  fs.mkdirSync(hooksDir, { recursive: true });

  // 1. 生成并写入质量检查脚本
  const script = generateQualityScript(detectedTools);
  fs.writeFileSync(scriptPath, script);

  // 2. 读取已有 settings.json 或创建空对象
  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  // 确保 hooks 对象存在
  if (!settings.hooks) settings.hooks = {};

  // 3. 安装/更新 PreToolUse hook（fnmap 保护）
  const preToolUseHook = {
    matcher: 'Edit|Write',
    hooks: [{
      type: 'command' as const,
      command: FNMAP_PROTECT_COMMAND,
      statusMessage: FNMAP_PRE_HOOK_MARKER
    }]
  };

  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  // 幂等：移除已有的 fnmap hook，再添加新的
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    (h: any) => !h.hooks?.some((hh: any) => hh.statusMessage?.includes('fnmap'))
  );
  settings.hooks.PreToolUse.push(preToolUseHook);

  // 4. 安装/更新 Stop hook（质量检查）
  const stopHook = {
    matcher: '',
    hooks: [{
      type: 'command' as const,
      command: 'bash .claude/hooks/quality-check.sh',
      timeout: 120,
      statusMessage: '代码质量检查中...'
    }]
  };

  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  settings.hooks.Stop = settings.hooks.Stop.filter(
    (h: any) => !h.hooks?.some((hh: any) => hh.command?.includes(FNMAP_STOP_HOOK_MARKER))
  );
  settings.hooks.Stop.push(stopHook);

  // 5. 写入 settings.json
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/hooks.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/hooks/index.ts test/hooks.test.ts
git commit -m "feat: 添加 hooks 安装与 settings.json 合并写入"
```

---

### Task 6: 交互流程与 CLI 集成

**Files:**
- Modify: `src/hooks/index.ts`
- Modify: `src/main.ts:280-311`
- Modify: `src/index.ts`

- [ ] **Step 1: 添加 executeHooksSetup 交互函数**

在 `src/hooks/index.ts` 中添加：

```typescript
import * as readline from 'node:readline';

/** 交互式提问工具 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/** 交互式 hooks 安装流程 */
export async function executeHooksSetup(projectDir: string, rl?: readline.Interface): Promise<void> {
  const ownRl = !rl;
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }

  try {
    console.log(`\n${COLORS.bold}fnmap - Claude Code Hooks Setup${COLORS.reset}`);
    console.log('='.repeat(50));
    console.log('Detecting project tools...\n');

    // 检测工具
    const tools = detectTools(projectDir);

    // 显示检测结果
    for (const tool of tools) {
      if (tool.detected) {
        console.log(`  ${COLORS.green}✓${COLORS.reset} ${tool.name} (${tool.source})`);
      } else {
        console.log(`  ${COLORS.gray}✗ ${tool.name} (not found)${COLORS.reset}`);
      }
    }

    const enabledTools = tools.filter(t => t.detected);

    // 显示将安装的 hooks
    console.log(`\nHooks to install:`);
    console.log(`  1. ${COLORS.bold}[protect]${COLORS.reset}  Block AI from editing .fnmap files (PreToolUse)`);
    console.log(`  2. ${COLORS.bold}[fnmap]${COLORS.reset}    Auto-update fnmap index on stop (Stop)`);

    let idx = 3;
    for (const tool of enabledTools) {
      const levelTag = tool.level === 'block' ? 'block on errors' : 'warn on issues';
      console.log(`  ${idx}. ${COLORS.bold}[${tool.name}]${COLORS.reset}${' '.repeat(Math.max(1, 10 - tool.name.length))}${tool.name} check - ${levelTag} (Stop)`);
      idx++;
    }

    // 确认安装
    const answer = await askQuestion(rl, `\nInstall these hooks to .claude/settings.json? (Y/n): `);
    if (answer.toLowerCase() === 'n') {
      console.log('Skipped hooks installation.');
      return;
    }

    // 执行安装
    installHooks(projectDir, enabledTools);

    console.log(`\n${COLORS.green}✓${COLORS.reset} Created .claude/hooks/quality-check.sh`);
    console.log(`${COLORS.green}✓${COLORS.reset} Updated .claude/settings.json`);
    console.log(`${COLORS.green}✓${COLORS.reset} Hooks installed! Restart Claude Code session to activate.`);
  } finally {
    if (ownRl) rl.close();
  }
}
```

- [ ] **Step 2: 在 main.ts 中集成 --hooks 命令**

在 `src/main.ts` 的 `main()` 函数中，`if (options.init)` 块之前添加：

```typescript
import { executeHooksSetup } from './hooks';

// ...在 main() 中，options.init 判断之前：

  // hooks命令：安装 Claude Code hooks（临时关闭静默模式）
  if (options.hooks) {
    const originalQuietMode = isQuietMode();
    setQuietMode(false);
    await executeHooksSetup(projectDir);
    setQuietMode(originalQuietMode);
    return;
  }
```

- [ ] **Step 3: 在 --init 流程中集成 hooks 步骤**

在 `src/main.ts` 的 `executeInitInteractive` 函数末尾（`Setup complete!` 之前）添加：

```typescript
    // 5. 询问是否安装 Claude Code hooks
    const hooksAnswer = await askQuestion(rl, `\nSetup Claude Code hooks for auto quality checks? (Y/n): `);
    if (hooksAnswer.toLowerCase() !== 'n') {
      await executeHooksSetup(projectDir, rl);
    }
```

- [ ] **Step 4: 在 src/index.ts 中添加导出**

```typescript
// 导出 hooks
export { detectTools, generateQualityScript, installHooks, executeHooksSetup } from './hooks';
```

同时在类型导出中添加 `DetectedTool`。

- [ ] **Step 5: 确认类型检查和测试通过**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add src/hooks/index.ts src/main.ts src/cli/index.ts src/index.ts src/types/index.ts
git commit -m "feat: 添加 fnmap --hooks 命令和 --init 集成"
```

---

### Task 7: 端到端验证

**Files:**
- 无新文件

- [ ] **Step 1: 构建项目**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 2: 在当前项目测试 --hooks**

Run: `node dist/index.js --hooks`
Expected: 显示检测到 TypeScript、Prettier、Vitest，询问确认后写入 `.claude/settings.json`

- [ ] **Step 3: 验证生成的文件**

检查 `.claude/settings.json` 包含 PreToolUse 和 Stop hooks，`.claude/hooks/quality-check.sh` 包含 tsc、prettier、vitest 检查段。

- [ ] **Step 4: 验证幂等性**

再次运行 `node dist/index.js --hooks`，确认不会重复添加 hooks。

- [ ] **Step 5: 运行全部测试**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "feat: fnmap --hooks 功能完成"
```
