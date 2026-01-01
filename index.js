#!/usr/bin/env node
/**
 * fnmap - AI Code Indexing Tool
 * Analyzes JS/TS code structure and generates structured code maps to help AI understand code quickly
 *
 * Usage:
 *   fnmap                           # Process based on config file
 *   fnmap init                      # Create default config file
 *   fnmap --dir src                 # Process specified directory
 *   fnmap --files a.js,b.js         # Process specified files
 *   fnmap --changed                 # Process only git changed files
 *   fnmap --staged -q               # For pre-commit hook usage
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { program } = require('commander');

// ============== 配置 ==============

// ANSI颜色常量
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

// 日志工具
let quietMode = false;
const logger = {
  error: (msg) => !quietMode && console.error(`${COLORS.red}✗${COLORS.reset} ${msg}`),
  success: (msg) => !quietMode && console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  info: (msg) => !quietMode && console.log(msg),
  warn: (msg) => !quietMode && console.warn(`${COLORS.yellow}!${COLORS.reset} ${msg}`),
  title: (msg) => !quietMode && console.log(`${COLORS.bold}${msg}${COLORS.reset}`)
};

// 默认支持的文件扩展名
const SUPPORTED_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs'];

// 默认排除的目录
const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache'];

// 默认配置
const DEFAULT_CONFIG = {
  enable: true,
  include: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx', '**/*.mjs'],
  exclude: []
};

/**
 * 加载配置文件
 * 优先级: .fnmaprc > .fnmaprc.json > package.json#fnmap > 默认配置
 */
function loadConfig(projectDir) {
  const configFiles = ['.fnmaprc', '.fnmaprc.json'];

  for (const file of configFiles) {
    const configPath = path.join(projectDir, file);
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        return { config, source: file };
      } catch (e) {
        logger.warn(`Failed to parse config file ${file}: ${e.message}`);
      }
    }
  }

  // 检查 package.json 中的 fnmap 字段
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.fnmap) {
        return { config: pkg.fnmap, source: 'package.json#fnmap' };
      }
    } catch (e) {
      // ignore
    }
  }

  return { config: null, source: null };
}

/**
 * 合并配置
 */
function mergeConfig(userConfig) {
  if (!userConfig) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    exclude: [...(userConfig.exclude || [])]
  };
}

// ============== 命令行配置 ==============

/**
 * 获取package.json中的版本号
 */
function getVersion() {
  try {
    const pkg = require('./package.json');
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

/**
 * 配置CLI命令
 */
function setupCLI() {
  program
    .name('fnmap')
    .description('AI code indexing tool - Analyzes JS/TS code structure and generates structured code maps')
    .version(getVersion(), '-v, --version', 'Show version number')
    .option('-f, --files <files>', 'Process specified files (comma-separated)', (val) => val.split(',').map(f => f.trim()).filter(Boolean))
    .option('-d, --dir <dir>', 'Process all code files in directory')
    .option('-p, --project <dir>', 'Specify project root directory', process.env.CLAUDE_PROJECT_DIR || process.cwd())
    .option('-c, --changed', 'Process only git changed files (staged + modified + untracked)')
    .option('-s, --staged', 'Process only git staged files (for pre-commit hook)')
    .option('-m, --mermaid [mode]', 'Generate Mermaid call graph (file=file-level, project=project-level)')
    .option('-q, --quiet', 'Quiet mode')
    .option('--init', 'Create default config file .fnmaprc')
    .argument('[files...]', 'Directly specify file paths')
    .allowUnknownOption(false)
    .addHelpText('after', `
Configuration files (by priority):
  .fnmaprc              JSON config file
  .fnmaprc.json         JSON config file
  package.json#fnmap    fnmap field in package.json

Output:
  .fnmap                Code index file (imports, functions, classes, constants, call graph)
  *.mermaid             Mermaid call graph (when using --mermaid file)
  .fnmap.mermaid        Project-level Mermaid call graph (when using --mermaid project)

Examples:
  $ fnmap --dir src                  Process src directory
  $ fnmap --files a.js,b.js          Process specified files
  $ fnmap --changed                  Process git changed files
  $ fnmap --staged -q                For pre-commit hook usage
  $ fnmap --mermaid file --dir src   Generate file-level call graphs
  $ fnmap --mermaid project          Generate project-level call graph
  $ fnmap --init                     Create config file
`);

  return program;
}

// ============== 文件发现 ==============

/**
 * 获取 git 改动的文件列表
 * @param {string} projectDir 项目根目录
 * @param {boolean} stagedOnly 是否只获取 staged 文件
 * @returns {string[]} 改动文件的绝对路径列表
 */
function getGitChangedFiles(projectDir, stagedOnly = false) {
  const files = [];

  try {
    let output;
    if (stagedOnly) {
      // 只获取 staged 文件
      output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
    } else {
      // 获取所有改动文件（包括 staged、modified、untracked）
      const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
      const modified = execSync('git diff --name-only --diff-filter=ACMR', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
      const untracked = execSync('git ls-files --others --exclude-standard', {
        cwd: projectDir,
        encoding: 'utf-8'
      });
      output = `${staged}\n${modified}\n${untracked}`;
    }

    const changedFiles = output
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean)
      .filter(f => {
        const ext = path.extname(f);
        return SUPPORTED_EXTENSIONS.includes(ext);
      });

    // 去重并转换为绝对路径
    const uniqueFiles = [...new Set(changedFiles)];
    for (const f of uniqueFiles) {
      const fullPath = path.resolve(projectDir, f);
      if (fs.existsSync(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // 不是 git 仓库或其他错误
    return [];
  }

  return files;
}

/**
 * 递归扫描目录获取所有代码文件
 * @param {string} dir 目录路径
 * @param {string} baseDir 基准目录
 * @param {string[]} excludes 排除的目录列表
 */
function scanDirectory(dir, baseDir = dir, excludes = DEFAULT_EXCLUDES) {
  const files = [];

  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!excludes.includes(entry.name)) {
        files.push(...scanDirectory(fullPath, baseDir, excludes));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        files.push(path.relative(baseDir, fullPath));
      }
    }
  }

  return files;
}

// ============== 代码分析 ==============

/**
 * 从JSDoc注释中提取描述
 */
function extractJSDocDescription(comment) {
  if (!comment) return '';

  const text = comment.type === 'CommentBlock' ? comment.value : comment.value;
  const lines = text.split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim());

  // 优先查找 @description 标签
  for (const line of lines) {
    if (line.startsWith('@description ')) {
      return line.slice(13).trim().slice(0, 60);
    }
  }

  // 否则取第一行非空非标签内容
  for (const line of lines) {
    if (line && !line.startsWith('@') && !line.startsWith('/')) {
      return line.slice(0, 60);
    }
  }

  return '';
}

/**
 * 分析JS/TS文件，提取结构信息
 */
function analyzeFile(code, filePath) {
  const info = {
    description: '',
    imports: [],
    functions: [],
    classes: [],
    constants: []
  };

  // 提取现有的文件描述注释
  const existingCommentMatch = code.match(/^\/\*\*[\s\S]*?\*\//);
  if (existingCommentMatch) {
    const commentText = existingCommentMatch[0];
    const lines = commentText.split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(l => l && !l.startsWith('/') && !l.startsWith('@ai'));

    for (const line of lines) {
      if (line.startsWith('@description ')) {
        info.description = line.slice(13).trim();
        break;
      }
    }
    if (!info.description && lines.length > 0) {
      const firstLine = lines.find(l => !l.startsWith('@'));
      if (firstLine) info.description = firstLine;
    }
  }

  let ast;
  try {
    const isTS = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    ast = parser.parse(code, {
      sourceType: 'unambiguous',
      plugins: [
        'jsx',
        'classPrivateProperties',
        'classPrivateMethods',
        ...(isTS ? ['typescript'] : [])
      ]
    });
  } catch (e) {
    // 解析失败，返回错误信息
    return { parseError: e.message, loc: e.loc };
  }

  // 收集导入信息
  const importsMap = new Map();
  const localToModule = new Map();
  const usageMap = new Map();

  // 第一遍：收集导入信息
  traverse(ast, {
    VariableDeclarator(nodePath) {
      const node = nodePath.node;
      if (
        node.init?.type === 'CallExpression' &&
        node.init.callee?.name === 'require' &&
        node.init.arguments?.[0]?.type === 'StringLiteral'
      ) {
        const moduleName = node.init.arguments[0].value;
        if (!importsMap.has(moduleName)) {
          importsMap.set(moduleName, new Set());
        }

        if (node.id.type === 'Identifier') {
          const localName = node.id.name;
          importsMap.get(moduleName).add(localName);
          localToModule.set(localName, moduleName);
          usageMap.set(localName, new Set());
        } else if (node.id.type === 'ObjectPattern') {
          for (const prop of node.id.properties) {
            if (prop.key?.name) {
              const localName = prop.value?.name || prop.key.name;
              importsMap.get(moduleName).add(prop.key.name);
              localToModule.set(localName, moduleName);
              usageMap.set(localName, new Set());
            }
          }
        }
      }
    },

    CallExpression(nodePath) {
      const node = nodePath.node;
      if (
        node.callee?.name === 'require' &&
        node.arguments?.[0]?.type === 'StringLiteral'
      ) {
        const parent = nodePath.parent;
        if (parent?.type === 'MemberExpression' && parent.property) {
          const moduleName = node.arguments[0].value;
          if (!importsMap.has(moduleName)) {
            importsMap.set(moduleName, new Set());
          }
          importsMap.get(moduleName).add(parent.property.name);
          const grandParent = nodePath.parentPath?.parent;
          if (grandParent?.type === 'VariableDeclarator' && grandParent.id?.name) {
            localToModule.set(grandParent.id.name, moduleName);
            usageMap.set(grandParent.id.name, new Set());
          }
        }
      }
    },

    ImportDeclaration(nodePath) {
      const node = nodePath.node;
      const moduleName = node.source.value;
      if (!importsMap.has(moduleName)) {
        importsMap.set(moduleName, new Set());
      }

      for (const specifier of node.specifiers) {
        let importedName, localName;
        if (specifier.type === 'ImportDefaultSpecifier') {
          importedName = 'default';
          localName = specifier.local.name;
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          importedName = '*';
          localName = specifier.local.name;
        } else if (specifier.type === 'ImportSpecifier') {
          importedName = specifier.imported?.name || specifier.imported?.value;
          localName = specifier.local.name;
        }
        if (importedName) {
          importsMap.get(moduleName).add(importedName);
          localToModule.set(localName, moduleName);
          usageMap.set(localName, new Set());
        }
      }
    }
  });

  // 辅助函数：获取当前所在的函数/方法名
  function getEnclosingFunctionName(nodePath) {
    let current = nodePath;
    while (current) {
      if (current.node.type === 'FunctionDeclaration' && current.node.id) {
        return current.node.id.name;
      }
      if (current.node.type === 'ClassMethod' && current.node.key) {
        let classPath = current.parentPath?.parentPath;
        const className = classPath?.node?.id?.name || '';
        const methodName = current.node.key.name || '';
        return className ? `${className}.${methodName}` : methodName;
      }
      if (current.node.type === 'ArrowFunctionExpression' || current.node.type === 'FunctionExpression') {
        const parent = current.parent;
        if (parent?.type === 'VariableDeclarator' && parent.id?.name) {
          return parent.id.name;
        }
      }
      current = current.parentPath;
    }
    return null;
  }

  // 第二遍：收集函数/类信息，并追踪导入使用
  traverse(ast, {
    Identifier(nodePath) {
      const name = nodePath.node.name;
      if (usageMap.has(name)) {
        const parent = nodePath.parent;
        if (parent?.type === 'VariableDeclarator' && parent.id === nodePath.node) return;
        if (parent?.type === 'ImportSpecifier' || parent?.type === 'ImportDefaultSpecifier') return;
        const enclosing = getEnclosingFunctionName(nodePath);
        if (enclosing) {
          usageMap.get(name).add(enclosing);
        }
      }
    },

    FunctionDeclaration(nodePath) {
      const node = nodePath.node;
      const name = node.id?.name || '[anonymous]';
      const params = node.params.map(p => {
        if (p.type === 'Identifier') return p.name;
        if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') return p.left.name + '?';
        if (p.type === 'RestElement' && p.argument?.type === 'Identifier') return '...' + p.argument.name;
        return '?';
      });
      const startLine = node.loc?.start?.line || 0;
      const endLine = node.loc?.end?.line || 0;

      let desc = '';
      if (node.leadingComments?.length > 0) {
        desc = extractJSDocDescription(node.leadingComments[node.leadingComments.length - 1]);
      }

      info.functions.push({ name, params: params.join(','), startLine, endLine, description: desc });
    },

    ClassDeclaration(nodePath) {
      const node = nodePath.node;
      const name = node.id?.name || '[anonymous]';
      const startLine = node.loc?.start?.line || 0;
      const endLine = node.loc?.end?.line || 0;
      const superClass = node.superClass?.name || null;

      let desc = '';
      if (node.leadingComments?.length > 0) {
        desc = extractJSDocDescription(node.leadingComments[node.leadingComments.length - 1]);
      }

      const methods = [];
      if (node.body?.body) {
        for (const member of node.body.body) {
          if (member.type === 'ClassMethod') {
            const methodName = member.key?.name || '[computed]';
            const methodParams = member.params.map(p => {
              if (p.type === 'Identifier') return p.name;
              if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') return p.left.name + '?';
              return '?';
            });
            const methodLine = member.loc?.start?.line || 0;

            let methodDesc = '';
            if (member.leadingComments?.length > 0) {
              methodDesc = extractJSDocDescription(member.leadingComments[member.leadingComments.length - 1]);
            }

            methods.push({
              name: methodName,
              params: methodParams.join(','),
              line: methodLine,
              static: member.static,
              kind: member.kind,
              description: methodDesc
            });
          }
        }
      }

      info.classes.push({ name, superClass, startLine, endLine, methods, description: desc });
    },

    VariableDeclaration(nodePath) {
      if (nodePath.parent.type !== 'Program') return;

      const node = nodePath.node;
      if (node.kind === 'const') {
        let desc = '';
        if (node.leadingComments?.length > 0) {
          desc = extractJSDocDescription(node.leadingComments[node.leadingComments.length - 1]);
        }

        for (const decl of node.declarations) {
          const name = decl.id?.name;
          if (name && name === name.toUpperCase() && name.length > 2) {
            const startLine = node.loc?.start?.line || 0;
            info.constants.push({ name, line: startLine, description: desc });
          }
        }
      }
    }
  });

  // 转换导入信息
  for (const [moduleName, members] of importsMap) {
    const usedIn = new Set();
    for (const localName of localToModule.keys()) {
      if (localToModule.get(localName) === moduleName && usageMap.has(localName)) {
        for (const fn of usageMap.get(localName)) {
          usedIn.add(fn);
        }
      }
    }
    info.imports.push({ module: moduleName, members: Array.from(members), usedIn: Array.from(usedIn) });
  }

  // 第三遍：构建函数调用图（包含文件内函数和导入函数）
  const definedFunctions = new Set();
  for (const fn of info.functions) {
    definedFunctions.add(fn.name);
  }
  for (const cls of info.classes) {
    for (const method of cls.methods) {
      definedFunctions.add(method.name);
      definedFunctions.add(`${cls.name}.${method.name}`);
    }
  }

  // 收集所有导入的标识符
  const importedNames = new Set(localToModule.keys());

  const callGraph = new Map(); // caller -> Set<callee>

  traverse(ast, {
    CallExpression(nodePath) {
      const node = nodePath.node;
      let calleeName = null;

      // 直接函数调用: funcName()
      if (node.callee.type === 'Identifier') {
        calleeName = node.callee.name;
      }
      // 方法调用: this.method() 或 obj.method()
      else if (node.callee.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') {
        const objName = node.callee.object?.name;
        const propName = node.callee.property.name;
        // 导入对象的方法调用: fs.readFileSync()
        if (objName && importedNames.has(objName)) {
          calleeName = `${objName}.${propName}`;
        } else {
          calleeName = propName;
        }
      }

      if (calleeName) {
        const caller = getEnclosingFunctionName(nodePath);
        if (caller && caller !== calleeName) {
          // 文件内定义的函数 或 导入的函数
          const isDefinedFunc = definedFunctions.has(calleeName);
          const isImportedFunc = importedNames.has(calleeName) ||
            (calleeName.includes('.') && importedNames.has(calleeName.split('.')[0]));

          if (isDefinedFunc || isImportedFunc) {
            if (!callGraph.has(caller)) callGraph.set(caller, new Set());
            callGraph.get(caller).add(calleeName);
          }
        }
      }
    }
  });

  // 转换调用图为对象格式
  info.callGraph = {};
  for (const [caller, callees] of callGraph) {
    info.callGraph[caller] = Array.from(callees);
  }

  return info;
}

// ============== 注释生成 ==============

/**
 * 生成紧凑格式AI注释头
 */
function generateHeader(info, fileName) {
  const lines = [];

  let headerLine = `/*@AI ${fileName}`;
  if (info.description) {
    headerLine += ` - ${info.description.slice(0, 50)}`;
  }
  lines.push(headerLine);

  // 导入信息
  for (const imp of info.imports) {
    const members = imp.members.join(',');
    let line = `<${imp.module}:${members}`;
    if (imp.usedIn?.length > 0) {
      line += ` ->${imp.usedIn.join(',')}`;
    }
    lines.push(line);
  }

  // 类信息
  for (const cls of info.classes) {
    let clsLine = cls.name;
    if (cls.superClass) clsLine += `:${cls.superClass}`;
    clsLine += ` ${cls.startLine}-${cls.endLine}`;
    if (cls.description) clsLine += ` ${cls.description}`;
    lines.push(clsLine);

    for (const method of cls.methods) {
      const prefix = method.static ? '  +' : '  .';
      const kindMark = method.kind === 'get' ? 'get:' : method.kind === 'set' ? 'set:' : '';
      let methodLine = `${prefix}${kindMark}${method.name}(${method.params}) ${method.line}`;
      if (method.description) methodLine += ` ${method.description}`;
      lines.push(methodLine);
    }
  }

  // 函数信息
  for (const fn of info.functions) {
    let fnLine = `${fn.name}(${fn.params}) ${fn.startLine}-${fn.endLine}`;
    if (fn.description) fnLine += ` ${fn.description}`;
    lines.push(fnLine);
  }

  // 常量信息
  for (const c of info.constants) {
    let constLine = `${c.name} ${c.line}`;
    if (c.description) constLine += ` ${c.description}`;
    lines.push(constLine);
  }

  lines.push('@AI*/');
  return lines.join('\n');
}

/**
 * 移除现有的AI注释头
 */
function removeExistingHeaders(code) {
  code = code.replace(/\/\*@AI[\s\S]*?@AI\*\/\s*/g, '');
  code = code.replace(/\/\*\*[\s\S]*?@ai-context-end[\s\S]*?\*\/\s*/g, '');
  code = code.replace(/^\/\*\*[\s\S]*?\*\/\s*\n?/, '');
  return code;
}

// ============== .fnmap 索引生成 ==============

/**
 * 生成目录级 .fnmap 索引文件（包含完整信息）
 */
function generateAiMap(dirPath, filesInfo) {
  const lines = [`@FNMAP ${path.basename(dirPath)}/`];

  for (const { relativePath, info } of filesInfo) {
    const fileName = path.basename(relativePath);
    let fileLine = `#${fileName}`;
    if (info.description) {
      fileLine += ` ${info.description.slice(0, 50)}`;
    }
    lines.push(fileLine);

    // 添加导入信息（不含使用位置，由函数行的调用图提供）
    for (const imp of info.imports) {
      const members = imp.members.join(',');
      lines.push(`  <${imp.module}:${members}`);
    }

    // 添加类信息
    for (const cls of info.classes) {
      let clsLine = `  ${cls.name}`;
      if (cls.superClass) clsLine += `:${cls.superClass}`;
      clsLine += ` ${cls.startLine}-${cls.endLine}`;
      if (cls.description) clsLine += ` ${cls.description}`;
      lines.push(clsLine);

      // 类方法
      for (const method of cls.methods) {
        const prefix = method.static ? '    +' : '    .';
        const kindMark = method.kind === 'get' ? 'get:' : method.kind === 'set' ? 'set:' : '';
        let methodLine = `${prefix}${kindMark}${method.name}(${method.params}) ${method.line}`;
        if (method.description) methodLine += ` ${method.description}`;
        // 追加调用信息
        const methodKey = `${cls.name}.${method.name}`;
        const calls = info.callGraph?.[methodKey] || info.callGraph?.[method.name];
        if (calls?.length > 0) methodLine += ` →${calls.join(',')}`;
        lines.push(methodLine);
      }
    }

    // 添加函数信息
    for (const fn of info.functions) {
      let fnLine = `  ${fn.name}(${fn.params}) ${fn.startLine}-${fn.endLine}`;
      if (fn.description) fnLine += ` ${fn.description}`;
      // 追加调用信息
      const calls = info.callGraph?.[fn.name];
      if (calls?.length > 0) fnLine += ` →${calls.join(',')}`;
      lines.push(fnLine);
    }

    // 添加常量信息
    for (const c of info.constants) {
      let constLine = `  ${c.name} ${c.line}`;
      if (c.description) constLine += ` ${c.description}`;
      lines.push(constLine);
    }
  }

  lines.push('@FNMAP');
  return lines.join('\n');
}

// ============== Mermaid调用图生成 ==============

/**
 * 生成单文件的mermaid调用图
 */
function generateFileMermaid(fileName, info) {
  const lines = ['flowchart TD'];
  const safeId = (name) => name.replace(/[^a-zA-Z0-9_]/g, '_');

  // 收集所有函数节点
  const functions = info.functions.map(fn => fn.name);
  const classMethods = [];
  for (const cls of info.classes) {
    for (const method of cls.methods) {
      classMethods.push(`${cls.name}.${method.name}`);
    }
  }
  const allFunctions = [...functions, ...classMethods];

  if (allFunctions.length === 0) {
    return null;  // 没有函数，跳过
  }

  // 添加子图标题
  const baseName = path.basename(fileName, path.extname(fileName));
  lines.push(`  subgraph ${safeId(baseName)}["${baseName}"]`);

  // 添加函数节点
  for (const fn of allFunctions) {
    lines.push(`    ${safeId(fn)}["${fn}"]`);
  }
  lines.push('  end');

  // 添加调用关系边
  const callGraph = info.callGraph || {};
  for (const [caller, callees] of Object.entries(callGraph)) {
    for (const callee of callees) {
      // 只显示文件内部的调用关系
      if (allFunctions.includes(callee) || callee.includes('.')) {
        const calleeName = allFunctions.includes(callee) ? callee : callee.split('.').pop();
        if (allFunctions.includes(callee) || allFunctions.some(f => f.endsWith(calleeName))) {
          lines.push(`  ${safeId(caller)} --> ${safeId(callee)}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * 生成项目级mermaid调用图
 */
function generateProjectMermaid(projectDir, allFilesInfo) {
  const lines = ['flowchart TD'];
  const safeId = (name) => name.replace(/[^a-zA-Z0-9_]/g, '_');

  // 收集所有文件的函数和它们的调用关系
  const fileToFunctions = new Map();
  const allCallEdges = [];

  for (const { relativePath, info } of allFilesInfo) {
    const fileName = path.basename(relativePath, path.extname(relativePath));
    const functions = info.functions.map(fn => fn.name);
    const classMethods = [];
    for (const cls of info.classes) {
      for (const method of cls.methods) {
        classMethods.push(`${cls.name}.${method.name}`);
      }
    }
    const allFunctions = [...functions, ...classMethods];
    fileToFunctions.set(relativePath, { fileName, functions: allFunctions });

    // 收集调用边
    const callGraph = info.callGraph || {};
    for (const [caller, callees] of Object.entries(callGraph)) {
      for (const callee of callees) {
        allCallEdges.push({
          file: relativePath,
          fileName,
          caller,
          callee
        });
      }
    }
  }

  // 按文件生成子图
  for (const [relativePath, { fileName, functions }] of fileToFunctions) {
    if (functions.length === 0) continue;

    lines.push(`  subgraph ${safeId(fileName)}["${fileName}"]`);
    for (const fn of functions) {
      lines.push(`    ${safeId(fileName)}_${safeId(fn)}["${fn}"]`);
    }
    lines.push('  end');
  }

  // 添加调用关系边
  const addedEdges = new Set();
  for (const { fileName, caller, callee } of allCallEdges) {
    const callerId = `${safeId(fileName)}_${safeId(caller)}`;

    // 查找callee所在的文件
    let calleeId = null;
    for (const [, { fileName: fn, functions }] of fileToFunctions) {
      if (functions.includes(callee)) {
        calleeId = `${safeId(fn)}_${safeId(callee)}`;
        break;
      }
    }

    // 如果没找到，可能是同文件内调用或外部调用
    if (!calleeId) {
      const { functions } = fileToFunctions.get(
        [...fileToFunctions.keys()].find(k =>
          fileToFunctions.get(k).fileName === fileName
        )
      ) || { functions: [] };
      if (functions.includes(callee)) {
        calleeId = `${safeId(fileName)}_${safeId(callee)}`;
      }
    }

    if (calleeId) {
      const edgeKey = `${callerId}-->${calleeId}`;
      if (!addedEdges.has(edgeKey)) {
        lines.push(`  ${callerId} --> ${calleeId}`);
        addedEdges.add(edgeKey);
      }
    }
  }

  return lines.join('\n');
}

// ============== 文件处理 ==============

/**
 * 处理单个文件（只分析，不修改文件）
 */
function processFile(filePath, options) {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'not found' };
  }

  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const info = analyzeFile(code, filePath);

    if (!info) {
      return { success: false, error: 'parse failed' };
    }

    // 检查是否有解析错误
    if (info.parseError) {
      const loc = info.loc ? ` (行 ${info.loc.line}, 列 ${info.loc.column})` : '';
      return { success: false, error: `parse failed${loc}: ${info.parseError}` };
    }

    return { success: true, info };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============== 主函数 ==============

function main() {
  // 配置并解析CLI
  setupCLI();
  program.parse(process.argv);

  const options = program.opts();
  const args = program.args;

  // 设置静默模式
  if (options.quiet) {
    quietMode = true;
  }

  const projectDir = path.resolve(options.project);

  // init命令：创建默认配置文件
  if (options.init) {
    const configPath = path.join(projectDir, '.fnmaprc');
    if (fs.existsSync(configPath)) {
      console.log(`${COLORS.yellow}!${COLORS.reset} Config file already exists: .fnmaprc`);
      return;
    }

    const defaultConfig = {
      enable: true,
      include: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.jsx', 'src/**/*.tsx'],
      exclude: ['node_modules', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache']
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`${COLORS.green}✓${COLORS.reset} Created config file: .fnmaprc`);
    return;
  }

  // 合并文件参数
  const fileArgs = [...(options.files || []), ...args].filter(f => fs.existsSync(f));

  // 确定要处理的文件列表
  let filesToProcess = [];

  if (options.changed || options.staged) {
    // 基于git改动
    filesToProcess = getGitChangedFiles(projectDir, options.staged);
    if (filesToProcess.length === 0) {
      logger.info('No git changed code files detected');
      return;
    }
  } else if (fileArgs.length > 0) {
    // 指定的文件
    filesToProcess = fileArgs.map(f =>
      path.isAbsolute(f) ? f : path.resolve(projectDir, f)
    );
  } else if (options.dir) {
    // 扫描指定目录
    const targetDir = path.resolve(projectDir, options.dir);
    const relFiles = scanDirectory(targetDir, projectDir);
    filesToProcess = relFiles.map(f => path.join(projectDir, f));
  } else {
    // 检查项目配置文件
    const { config, source } = loadConfig(projectDir);

    if (config) {
      logger.info(`Using config: ${source}`);

      // 检查是否启用
      if (config.enable === false) {
        logger.info('Config file has enable set to false, skipping processing');
        return;
      }

      // 合并配置
      const mergedConfig = mergeConfig(config);
      const excludes = [...DEFAULT_EXCLUDES, ...mergedConfig.exclude];

      if (mergedConfig.include) {
        for (const pattern of mergedConfig.include) {
          const dir = pattern.replace(/\/\*\*\/.*$/, '').replace(/\*\*\/.*$/, '');
          const targetDir = dir ? path.resolve(projectDir, dir) : projectDir;
          if (fs.existsSync(targetDir)) {
            const relFiles = scanDirectory(targetDir, projectDir, excludes);
            filesToProcess.push(...relFiles.map(f => path.join(projectDir, f)));
          }
        }
      }
    } else {
      logger.warn('No config file found. Use fnmap init to create config, or use --dir/--files to specify scope');
      logger.info('');
      logger.info('Supported config files: .fnmaprc, .fnmaprc.json, package.json#fnmap');
      return;
    }
  }

  if (filesToProcess.length === 0) {
    logger.info('No files found to process');
    return;
  }

  // 去重
  filesToProcess = [...new Set(filesToProcess)];

  logger.info('='.repeat(50));
  logger.title('fnmap - AI Code Indexing Tool');
  logger.info('='.repeat(50));

  let processed = 0;
  let failed = 0;
  const dirFilesMap = new Map();

  for (const filePath of filesToProcess) {
    const relativePath = path.relative(projectDir, filePath);
    logger.info(`\nAnalyzing: ${relativePath}`);

    const result = processFile(filePath, options);

    if (result.success) {
      processed++;
      logger.success(`Imports: ${result.info.imports.length}, Functions: ${result.info.functions.length}, Classes: ${result.info.classes.length}, Constants: ${result.info.constants.length}`);

      // 收集目录信息
      const dir = path.dirname(filePath);
      if (!dirFilesMap.has(dir)) {
        dirFilesMap.set(dir, []);
      }
      dirFilesMap.get(dir).push({ relativePath, info: result.info });
    } else {
      failed++;
      logger.error(result.error);
    }
  }

  // 生成.fnmap索引文件
  if (dirFilesMap.size > 0) {
    logger.info('\nGenerating .fnmap index...');
    for (const [dir, filesInfo] of dirFilesMap) {
      const mapContent = generateAiMap(dir, filesInfo);
      const mapPath = path.join(dir, '.fnmap');
      fs.writeFileSync(mapPath, mapContent);
      logger.success(path.relative(projectDir, mapPath));
    }
  }

  // 生成Mermaid调用图
  if (options.mermaid && dirFilesMap.size > 0) {
    logger.info('\nGenerating Mermaid call graphs...');

    if (options.mermaid === 'file' || options.mermaid === true) {
      // 文件级：每个文件生成一个mermaid图
      for (const [dir, filesInfo] of dirFilesMap) {
        for (const { relativePath, info } of filesInfo) {
          const mermaidContent = generateFileMermaid(relativePath, info);
          if (mermaidContent) {
            const baseName = path.basename(relativePath, path.extname(relativePath));
            const mermaidPath = path.join(dir, `${baseName}.mermaid`);
            fs.writeFileSync(mermaidPath, mermaidContent);
            logger.success(path.relative(projectDir, mermaidPath));
          }
        }
      }
    } else if (options.mermaid === 'project') {
      // 项目级：生成一个包含所有文件的mermaid图
      const allFilesInfo = [];
      for (const [, filesInfo] of dirFilesMap) {
        allFilesInfo.push(...filesInfo);
      }
      const mermaidContent = generateProjectMermaid(projectDir, allFilesInfo);
      const mermaidPath = path.join(projectDir, '.fnmap.mermaid');
      fs.writeFileSync(mermaidPath, mermaidContent);
      logger.success(path.relative(projectDir, mermaidPath));
    }
  }

  logger.info('\n' + '='.repeat(50));
  logger.info(`Complete! Analyzed: ${COLORS.green}${processed}${COLORS.reset}, Failed: ${failed > 0 ? COLORS.red : ''}${failed}${COLORS.reset}`);
  logger.info('='.repeat(50));
}

// 导出供外部调用
module.exports = {
  analyzeFile,
  generateHeader,
  removeExistingHeaders,
  generateAiMap,
  generateFileMermaid,
  generateProjectMermaid,
  processFile,
  scanDirectory,
  getGitChangedFiles,
  extractJSDocDescription,
  loadConfig,
  mergeConfig
};

// 直接运行
if (require.main === module) {
  main();
}
