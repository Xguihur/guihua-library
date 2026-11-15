import type { BookStatus } from '@guihua/contracts';

export function statusLabel(status: BookStatus): string {
  return status === 'reading' ? '正在读' : '已读完';
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}
