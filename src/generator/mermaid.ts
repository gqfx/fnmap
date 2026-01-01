import path from 'path';
import type { FileInfo, FileInfoEntry } from '../types';

/**
 * 生成单文件的mermaid调用图
 */
export function generateFileMermaid(fileName: string, info: FileInfo): string | null {
  const lines: string[] = ['flowchart TD'];
  // 使用更安全的ID生成策略以避免冲突
  const safeId = (name: string): string =>
    'id_' +
    name.replace(/[^a-zA-Z0-9]/g, (c) => `_${c.charCodeAt(0)}_`);
  const escapeLabel = (text: string): string => text.replace(/"/g, '#quot;');

  // 收集所有函数节点
  const functions = info.functions.map((fn) => fn.name);
  const classMethods: string[] = [];
  for (const cls of info.classes) {
    for (const method of cls.methods) {
      classMethods.push(`${cls.name}.${method.name}`);
    }
  }
  const allFunctions = [...functions, ...classMethods];

  if (allFunctions.length === 0) {
    return null; // 没有函数，跳过
  }

  // 添加子图标题
  const baseName = path.basename(fileName, path.extname(fileName));
  lines.push(`  subgraph ${safeId(baseName)}["${baseName}"]`);

  // 添加函数节点
  for (const fn of allFunctions) {
    lines.push(`    ${safeId(fn)}["${escapeLabel(fn)}"]`);
  }
  lines.push('  end');

  // 添加调用关系边
  const callGraph = info.callGraph ?? {};
  for (const [caller, callees] of Object.entries(callGraph)) {
    if (!Array.isArray(callees)) continue;
    for (const callee of callees) {
      // 只显示文件内部的调用关系
      if (allFunctions.includes(callee) || callee.includes('.')) {
        const calleeName = allFunctions.includes(callee) ? callee : callee.split('.').pop()!;
        if (allFunctions.includes(callee) || allFunctions.some((f) => f.endsWith(calleeName))) {
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
export function generateProjectMermaid(_projectDir: string, allFilesInfo: FileInfoEntry[]): string {
  const lines: string[] = ['flowchart TD'];

  const safeId = (name: string): string =>
    'id_' +
    name.replace(/[^a-zA-Z0-9]/g, (c) => `_${c.charCodeAt(0)}_`);
  const escapeLabel = (text: string): string => text.replace(/"/g, '#quot;');

  // 收集所有文件的函数和它们的调用关系
  const fileToFunctions = new Map<string, { fileName: string; functions: string[] }>();
  const allCallEdges: Array<{ file: string; fileName: string; caller: string; callee: string }> = [];

  for (const { relativePath, info } of allFilesInfo) {
    const fileName = path.basename(relativePath, path.extname(relativePath));
    const functions = info.functions.map((fn) => fn.name);
    const classMethods: string[] = [];
    for (const cls of info.classes) {
      for (const method of cls.methods) {
        classMethods.push(`${cls.name}.${method.name}`);
      }
    }
    const allFunctions = [...functions, ...classMethods];
    fileToFunctions.set(relativePath, { fileName, functions: allFunctions });

    // 收集调用边
    const callGraph = info.callGraph ?? {};
    for (const [caller, callees] of Object.entries(callGraph)) {
      if (!Array.isArray(callees)) continue;
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
  for (const [, { fileName, functions }] of fileToFunctions) {
    if (functions.length === 0) continue;

    lines.push(`  subgraph ${safeId(fileName)}["${escapeLabel(fileName)}"]`);
    for (const fn of functions) {
      lines.push(`    ${safeId(fileName)}_${safeId(fn)}["${escapeLabel(fn)}"]`);
    }
    lines.push('  end');
  }

  // 添加调用关系边
  const addedEdges = new Set<string>();
  for (const { fileName, caller, callee } of allCallEdges) {
    const callerId = `${safeId(fileName)}_${safeId(caller)}`;

    // 查找callee所在的文件
    let calleeId: string | null = null;
    for (const [, { fileName: fn, functions }] of fileToFunctions) {
      if (functions.includes(callee)) {
        calleeId = `${safeId(fn)}_${safeId(callee)}`;
        break;
      }
    }

    // 如果没找到，可能是同文件内调用或外部调用
    if (!calleeId) {
      const matchingKey = [...fileToFunctions.keys()].find((k) => fileToFunctions.get(k)?.fileName === fileName);
      if (matchingKey) {
        const fileData = fileToFunctions.get(matchingKey);
        if (fileData?.functions.includes(callee)) {
          calleeId = `${safeId(fileName)}_${safeId(callee)}`;
        }
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
