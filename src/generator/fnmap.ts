import path from 'path';
import type { FileInfoEntry } from '../types';

/**
 * 生成目录级 .fnmap 索引文件（包含完整信息）
 */
export function generateAiMap(dirPath: string, filesInfo: FileInfoEntry[]): string {
  const lines: string[] = [`@FNMAP ${path.basename(dirPath)}/`];

  for (const { relativePath, info } of filesInfo) {
    const fileName = path.basename(relativePath);
    let fileLine = `#${fileName}`;
    if (info.description) {
      fileLine += ` ${info.description.slice(0, 50)}`;
    }
    lines.push(fileLine);

    // 添加导入信息（不含使用位置，由函数行的调用图提供）
    for (const imp of info.imports) {
      const members = Array.isArray(imp.members) ? imp.members.join(',') : '';
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
        const calls = info.callGraph?.[methodKey] ?? info.callGraph?.[method.name];
        if (Array.isArray(calls) && calls.length > 0) methodLine += ` →${calls.join(',')}`;
        lines.push(methodLine);
      }
    }

    // 添加函数信息
    for (const fn of info.functions) {
      let fnLine = `  ${fn.name}(${fn.params}) ${fn.startLine}-${fn.endLine}`;
      if (fn.description) fnLine += ` ${fn.description}`;
      // 追加调用信息
      const calls = info.callGraph?.[fn.name];
      if (Array.isArray(calls) && calls.length > 0) fnLine += ` →${calls.join(',')}`;
      lines.push(fnLine);
    }

    // 添加常量信息
    for (const c of info.constants) {
      let constLine = `  ${c.name} ${c.line}`;
      if (c.description) constLine += ` ${c.description}`;
      lines.push(constLine);
    }

    // 添加导出信息
    if (info.exports && info.exports.length > 0) {
      const exportNames: string[] = [];
      for (const exp of info.exports) {
        if (exp.kind === 'default') {
          exportNames.push(exp.localName ? `default:${exp.localName}` : 'default');
        } else if (exp.kind === 'type') {
          exportNames.push(`type:${exp.name}`);
        } else {
          exportNames.push(exp.name);
        }
      }
      lines.push(`  >${exportNames.join(',')}`);
    }
  }

  lines.push('@FNMAP');
  return lines.join('\n');
}
