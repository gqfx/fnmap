import type { Comment } from '@babel/types';

/**
 * 从JSDoc注释中提取描述
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
