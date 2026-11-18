/**
 * Starts a same-site GitHub login. The API answers either with a 302 (a
 * cross-origin redirect the browser follows) or a masked 503 when GitHub is not
 * configured. We probe with redirect:'manual' so an unavailable entry yields a
 * fixed message instead of a raw JSON error page; then navigate for real.
 */
export async function startGithubLogin(): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/oauth/github/authorization', {
      redirect: 'manual',
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('网络连接失败，请稍后重试。');
  }
  if (response.status === 503) {
    throw new Error('GitHub 登录暂不可用，请联系管理员。');
  }
  window.location.assign('/api/oauth/github/authorization');
}
