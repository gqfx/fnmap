import type { FileInfo } from '../types';

/**
 * 生成紧凑格式AI注释头
 */
export function generateHeader(info: FileInfo, fileName: string): string {
  const lines: string[] = [];

  let headerLine = `/*@AI ${fileName}`;
  if (info.description) {
    headerLine += ` - ${info.description.slice(0, 50)}`;
  }
  lines.push(headerLine);

  // 导入信息
  for (const imp of info.imports) {
    const members = Array.isArray(imp.members) ? imp.members.join(',') : '';
    let line = `<${imp.module}:${members}`;
    if (Array.isArray(imp.usedIn) && imp.usedIn.length > 0) {
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
export function removeExistingHeaders(code: string): string {
  let result = code;
  result = result.replace(/\/\*@AI[\s\S]*?@AI\*\/\s*/g, '');
  result = result.replace(/\/\*\*[\s\S]*?@ai-context-end[\s\S]*?\*\/\s*/g, '');
  result = result.replace(/^\/\*\*[\s\S]*?\*\/\s*\n?/, '');
  return result;
}
