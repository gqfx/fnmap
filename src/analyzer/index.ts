import parser from '@babel/parser';
import _traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import type {
  FileInfo,
  AnalyzeResult,
  ImportInfo,
  FunctionInfo,
  ClassInfo,
  MethodInfo,
  ConstantInfo
} from '../types';
import { ErrorTypes } from '../types';
import { formatError } from '../validation';
import { extractJSDocDescription, getLeadingComment } from './jsdoc';

// 处理 ESM/CJS 兼容性
const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as { default: typeof _traverse }).default;

/**
 * 分析JS/TS文件,提取结构信息
 */
export function analyzeFile(code: unknown, filePath: string | null): AnalyzeResult {
  // 输入验证
  if (code === null || code === undefined) {
    return {
      parseError: 'Code content is null or undefined / 代码内容为空',
      errorType: ErrorTypes.VALIDATION_ERROR
    };
  }

  if (typeof code !== 'string') {
    return {
      parseError: 'Code must be a string / 代码必须是字符串类型',
      errorType: ErrorTypes.VALIDATION_ERROR
    };
  }

  // 检查空文件
  if (!code.trim()) {
    return {
      description: '',
      imports: [],
      functions: [],
      classes: [],
      constants: [],
      callGraph: {}
    };
  }

  const info: FileInfo = {
    description: '',
    imports: [],
    functions: [],
    classes: [],
    constants: [],
    callGraph: {}
  };

  // 提取现有的文件描述注释
  const existingCommentMatch = code.match(/^\/\*\*[\s\S]*?\*\//);
  if (existingCommentMatch) {
    const commentText = existingCommentMatch[0];
    const lines = commentText
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .filter((l) => l && !l.startsWith('/') && !l.startsWith('@ai'));

    for (const line of lines) {
      if (line.startsWith('@description ')) {
        info.description = line.slice(13).trim();
        break;
      }
    }
    if (!info.description && lines.length > 0) {
      const firstLine = lines.find((l) => !l.startsWith('@'));
      if (firstLine) info.description = firstLine;
    }
  }

  let ast: t.File;
  try {
    const isTS = filePath && (filePath.endsWith('.ts') || filePath.endsWith('.tsx'));
    ast = parser.parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'classPrivateProperties', 'classPrivateMethods', ...(isTS ? (['typescript'] as const) : [])]
    });
  } catch (e) {
    const error = e as Error & { loc?: { line: number; column: number } };
    const errorMsg = formatError(ErrorTypes.PARSE_ERROR, `Syntax error: ${error.message} / 语法错误`, {
      file: filePath ?? undefined,
      line: error.loc?.line,
      column: error.loc?.column,
      suggestion: 'Check syntax errors in the file / 检查文件中的语法错误'
    });
    return {
      parseError: errorMsg,
      loc: error.loc,
      errorType: ErrorTypes.PARSE_ERROR
    };
  }

  // 收集导入信息
  const importsMap = new Map<string, Set<string>>();
  const localToModule = new Map<string, string>();
  const usageMap = new Map<string, Set<string>>();

  // 辅助函数：获取当前所在的函数/方法名
  function getEnclosingFunctionName(nodePath: NodePath): string | null {
    let current: NodePath | null = nodePath;
    while (current) {
      if (current.node.type === 'FunctionDeclaration') {
        const funcNode = current.node as t.FunctionDeclaration;
        if (funcNode.id) {
          return funcNode.id.name;
        }
      }
      if (current.node.type === 'ClassMethod') {
        const methodNode = current.node as t.ClassMethod;
        const classPath = current.parentPath?.parentPath;
        const classNode = classPath?.node as t.ClassDeclaration | undefined;
        const className = classNode?.id?.name ?? '';
        const methodName = (methodNode.key as t.Identifier)?.name ?? '';
        return className ? `${className}.${methodName}` : methodName;
      }
      if (current.node.type === 'ArrowFunctionExpression' || current.node.type === 'FunctionExpression') {
        const parent = current.parent as t.Node;
        if (parent?.type === 'VariableDeclarator') {
          const varDecl = parent as t.VariableDeclarator;
          const id = varDecl.id as t.Identifier;
          if (id?.name) return id.name;
        }
      }
      current = current.parentPath;
    }
    return null;
  }

  // 第一遍：收集导入信息
  traverse(ast, {
    VariableDeclarator(nodePath: NodePath<t.VariableDeclarator>) {
      const node = nodePath.node;
      if (
        node.init?.type === 'CallExpression' &&
        node.init.callee?.type === 'Identifier' &&
        node.init.callee.name === 'require' &&
        node.init.arguments?.[0]?.type === 'StringLiteral'
      ) {
        const moduleName = node.init.arguments[0].value;
        if (!importsMap.has(moduleName)) {
          importsMap.set(moduleName, new Set());
        }

        if (node.id.type === 'Identifier') {
          const localName = node.id.name;
          importsMap.get(moduleName)!.add(localName);
          localToModule.set(localName, moduleName);
          usageMap.set(localName, new Set());
        } else if (node.id.type === 'ObjectPattern') {
          for (const prop of node.id.properties) {
            if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
              const localName = prop.value.type === 'Identifier' ? prop.value.name : prop.key.name;
              importsMap.get(moduleName)!.add(prop.key.name);
              localToModule.set(localName, moduleName);
              usageMap.set(localName, new Set());
            }
          }
        }
      }
    },

    CallExpression(nodePath: NodePath<t.CallExpression>) {
      const node = nodePath.node;
      if (
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments?.[0]?.type === 'StringLiteral'
      ) {
        const parent = nodePath.parent;
        if (parent?.type === 'MemberExpression' && parent.property?.type === 'Identifier') {
          const moduleName = node.arguments[0].value;
          if (!importsMap.has(moduleName)) {
            importsMap.set(moduleName, new Set());
          }
          importsMap.get(moduleName)!.add(parent.property.name);
          const grandParent = nodePath.parentPath?.parent;
          if (grandParent?.type === 'VariableDeclarator') {
            const varDecl = grandParent as t.VariableDeclarator;
            if (varDecl.id?.type === 'Identifier') {
              localToModule.set(varDecl.id.name, moduleName);
              usageMap.set(varDecl.id.name, new Set());
            }
          }
        }
      }
    },

    ImportDeclaration(nodePath: NodePath<t.ImportDeclaration>) {
      const node = nodePath.node;
      const moduleName = node.source.value;
      if (!importsMap.has(moduleName)) {
        importsMap.set(moduleName, new Set());
      }

      for (const specifier of node.specifiers) {
        let importedName: string | undefined;
        let localName: string | undefined;
        if (specifier.type === 'ImportDefaultSpecifier') {
          importedName = 'default';
          localName = specifier.local.name;
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          importedName = '*';
          localName = specifier.local.name;
        } else if (specifier.type === 'ImportSpecifier') {
          const imported = specifier.imported;
          importedName = imported.type === 'Identifier' ? imported.name : imported.value;
          localName = specifier.local.name;
        }
        if (importedName && localName) {
          importsMap.get(moduleName)!.add(importedName);
          localToModule.set(localName, moduleName);
          usageMap.set(localName, new Set());
        }
      }
    }
  });

  // 第二遍：收集函数/类信息，并追踪导入使用
  traverse(ast, {
    Identifier(nodePath: NodePath<t.Identifier>) {
      const name = nodePath.node.name;
      if (usageMap.has(name)) {
        const parent = nodePath.parent;
        if (parent?.type === 'VariableDeclarator' && (parent as t.VariableDeclarator).id === nodePath.node) return;
        if (parent?.type === 'ImportSpecifier' || parent?.type === 'ImportDefaultSpecifier') return;
        const enclosing = getEnclosingFunctionName(nodePath);
        if (enclosing) {
          usageMap.get(name)!.add(enclosing);
        }
      }
    },

    FunctionDeclaration(nodePath: NodePath<t.FunctionDeclaration>) {
      const node = nodePath.node;
      const name = node.id?.name ?? '[anonymous]';
      const params = node.params.map((p) => {
        if (p.type === 'Identifier') return p.name;
        if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') return p.left.name + '?';
        if (p.type === 'RestElement' && p.argument?.type === 'Identifier') return '...' + p.argument.name;
        return '?';
      });
      const startLine = node.loc?.start?.line ?? 0;
      const endLine = node.loc?.end?.line ?? 0;

      const desc = extractJSDocDescription(getLeadingComment(node, nodePath.parent));

      info.functions.push({
        name,
        params: params.join(','),
        startLine,
        endLine,
        description: desc
      } as FunctionInfo);
    },

    ClassDeclaration(nodePath: NodePath<t.ClassDeclaration>) {
      const node = nodePath.node;
      const name = node.id?.name ?? '[anonymous]';
      const startLine = node.loc?.start?.line ?? 0;
      const endLine = node.loc?.end?.line ?? 0;
      const superClass = node.superClass?.type === 'Identifier' ? node.superClass.name : null;

      const desc = extractJSDocDescription(getLeadingComment(node, nodePath.parent));

      const methods: MethodInfo[] = [];
      if (node.body?.body) {
        for (const member of node.body.body) {
          if (member.type === 'ClassMethod') {
            const methodName = member.key?.type === 'Identifier' ? member.key.name : '[computed]';
            const methodParams = member.params.map((p) => {
              if (p.type === 'Identifier') return p.name;
              if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') return p.left.name + '?';
              return '?';
            });
            const methodLine = member.loc?.start?.line ?? 0;

            let methodDesc = '';
            const methodComments = member.leadingComments;
            if (methodComments && methodComments.length > 0) {
              methodDesc = extractJSDocDescription(methodComments[methodComments.length - 1]);
            }

            methods.push({
              name: methodName,
              params: methodParams.join(','),
              line: methodLine,
              static: member.static,
              kind: member.kind as MethodInfo['kind'],
              description: methodDesc
            });
          }
        }
      }

      info.classes.push({
        name,
        superClass,
        startLine,
        endLine,
        methods,
        description: desc
      } as ClassInfo);
    },

    VariableDeclaration(nodePath: NodePath<t.VariableDeclaration>) {
      // 支持顶层常量和导出常量
      const parentType = nodePath.parent.type;
      if (parentType !== 'Program' && parentType !== 'ExportNamedDeclaration') return;

      const node = nodePath.node;
      const desc = extractJSDocDescription(getLeadingComment(node, nodePath.parent));

      for (const decl of node.declarations) {
        const name = decl.id?.type === 'Identifier' ? decl.id.name : undefined;
        if (!name) continue;

        // 检测箭头函数或函数表达式赋值: const foo = () => {} 或 const foo = function() {}
        if (
          decl.init?.type === 'ArrowFunctionExpression' ||
          decl.init?.type === 'FunctionExpression'
        ) {
          const funcExpr = decl.init as t.ArrowFunctionExpression | t.FunctionExpression;
          const params = funcExpr.params.map((p) => {
            if (p.type === 'Identifier') return p.name;
            if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') return p.left.name + '?';
            if (p.type === 'RestElement' && p.argument?.type === 'Identifier') return '...' + p.argument.name;
            return '?';
          });
          const startLine = node.loc?.start?.line ?? 0;
          const endLine = node.loc?.end?.line ?? 0;

          info.functions.push({
            name,
            params: params.join(','),
            startLine,
            endLine,
            description: desc
          } as FunctionInfo);
          continue;
        }

        // 全大写常量: const MAX_SIZE = 100
        if (node.kind === 'const' && name === name.toUpperCase() && name.length > 2) {
          const startLine = node.loc?.start?.line ?? 0;
          info.constants.push({
            name,
            line: startLine,
            description: desc
          } as ConstantInfo);
        }
      }
    }
  });

  // 转换导入信息
  for (const [moduleName, members] of importsMap) {
    const usedIn = new Set<string>();
    for (const localName of localToModule.keys()) {
      if (localToModule.get(localName) === moduleName && usageMap.has(localName)) {
        for (const fn of usageMap.get(localName)!) {
          usedIn.add(fn);
        }
      }
    }
    info.imports.push({
      module: moduleName,
      members: Array.from(members),
      usedIn: Array.from(usedIn)
    } as ImportInfo);
  }

  // 第三遍：构建函数调用图
  const definedFunctions = new Set<string>();
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

  const callGraph = new Map<string, Set<string>>();

  traverse(ast, {
    CallExpression(nodePath: NodePath<t.CallExpression>) {
      const node = nodePath.node;
      let calleeName: string | null = null;

      // 直接函数调用: funcName()
      if (node.callee.type === 'Identifier') {
        calleeName = node.callee.name;
      }
      // 方法调用: this.method() 或 obj.method()
      else if (node.callee.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') {
        const objName = node.callee.object?.type === 'Identifier' ? node.callee.object.name : undefined;
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
          const isImportedFunc =
            importedNames.has(calleeName) ||
            (calleeName.includes('.') && importedNames.has(calleeName.split('.')[0]!));

          if (isDefinedFunc || isImportedFunc) {
            if (!callGraph.has(caller)) callGraph.set(caller, new Set());
            callGraph.get(caller)!.add(calleeName);
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

  // 检测是否为纯类型文件（只有 type/interface 声明，没有实际运行时代码）
  info.isPureType = isPureTypeFile(ast);

  return info;
}

/**
 * 检测是否为纯类型文件
 * 纯类型文件只包含：type、interface、import type、export type 等类型声明
 * 不包含实际的函数、类、变量定义
 */
function isPureTypeFile(ast: t.File): boolean {
  let hasRuntimeCode = false;

  for (const node of ast.program.body) {
    switch (node.type) {
      // 类型声明 - 允许
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
      case 'TSEnumDeclaration':
        break;

      // 导入声明 - 检查是否为类型导入
      case 'ImportDeclaration':
        if (node.importKind !== 'type') {
          // 检查每个 specifier 是否都是类型导入
          const hasValueImport = node.specifiers.some((spec) => {
            if (spec.type === 'ImportSpecifier') {
              return spec.importKind !== 'type';
            }
            // default 和 namespace 导入可能包含值
            return true;
          });
          if (hasValueImport && node.specifiers.length > 0) {
            hasRuntimeCode = true;
          }
        }
        break;

      // 导出声明 - 检查是否只导出类型
      case 'ExportNamedDeclaration':
        if (node.exportKind === 'type') {
          // export type { ... } - 纯类型导出
          break;
        }
        if (node.declaration) {
          // 检查导出的声明是否为类型
          const declType = node.declaration.type;
          if (declType !== 'TSTypeAliasDeclaration' && declType !== 'TSInterfaceDeclaration') {
            hasRuntimeCode = true;
          }
        } else if (node.specifiers && node.specifiers.length > 0) {
          // export { ... } - 检查每个导出项是否为类型
          const hasValueExport = node.specifiers.some((spec) => {
            if (spec.type === 'ExportSpecifier') {
              return spec.exportKind !== 'type';
            }
            return true;
          });
          if (hasValueExport) {
            hasRuntimeCode = true;
          }
        }
        break;

      case 'ExportDefaultDeclaration':
        // 默认导出通常是值
        hasRuntimeCode = true;
        break;

      case 'ExportAllDeclaration':
        if (node.exportKind !== 'type') {
          hasRuntimeCode = true;
        }
        break;

      // 其他所有声明都是运行时代码
      default:
        hasRuntimeCode = true;
        break;
    }

    if (hasRuntimeCode) break;
  }

  return !hasRuntimeCode;
}

export { extractJSDocDescription };
