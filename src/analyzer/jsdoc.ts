import type { Comment, Node } from '@babel/types';

/**
 * 从JSDoc注释中提取描述
 * 优先级: @description标签 > 第一行非标签内容
 */
export function extractJSDocDescription(comment: Comment | null | undefined): string {
  if (!comment) return '';

  const text = comment.value;
  const lines = text.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim());

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
 * 从节点获取leadingComments，支持导出声明
 * 当节点本身没有注释时，检查父节点（ExportNamedDeclaration/ExportDefaultDeclaration）
 */
export function getLeadingComment(node: Node, parent: Node | null | undefined): Comment | null {
  // 优先从节点本身获取
  if (node.leadingComments && node.leadingComments.length > 0) {
    return node.leadingComments[node.leadingComments.length - 1] ?? null;
  }

  // 检查父节点是否为导出声明
  if (parent && (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportDefaultDeclaration')) {
    const parentNode = parent as Node & { leadingComments?: Comment[] };
    if (parentNode.leadingComments && parentNode.leadingComments.length > 0) {
      return parentNode.leadingComments[parentNode.leadingComments.length - 1] ?? null;
    }
  }

  return null;
}
