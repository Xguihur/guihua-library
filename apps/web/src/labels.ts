import type { BookStatus } from '@guihua/contracts';

export function statusLabel(status: BookStatus): string {
  return status === 'reading' ? '正在读' : '已读完';
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

/** Fixed, server-controlled OAuth result states. Unknown values stay generic. */
export const OAUTH_RESULT_MESSAGES: Record<string, string> = {
  'login-success': '已通过 GitHub 登录。',
  'link-success': 'GitHub 已绑定到当前账号。',
  'reauth-success': '身份复核已通过，请再次确认操作。',
  'already-logged-in': '您已登录。请在账号设置中使用独立入口绑定 GitHub，登录入口不会切换或绑定账号。',
  conflict: '该 GitHub 账号已被其他账号绑定，或当前账号已绑定其他 GitHub。',
  cancelled: 'GitHub 授权已取消，未做任何更改。',
  expired: '授权请求已过期，请重新发起。',
  replayed: '该授权链接已被使用，请重新发起。',
  'session-mismatch': '授权未完成于原浏览器或原会话，请返回原浏览器重试。',
  upstream: 'GitHub 授权暂不可用，请稍后重试。',
  unavailable: 'GitHub 登录暂不可用，请联系管理员。',
  invalid: '授权回调无效，请重新发起。',
};

export function oauthResultMessage(status: unknown): string {
  return typeof status === 'string' ? (OAUTH_RESULT_MESSAGES[status] ?? '登录流程未能完成，请重试。') : '登录流程未能完成，请重试。';
}
