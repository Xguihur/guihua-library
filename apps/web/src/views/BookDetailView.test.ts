import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import BookDetailView from './BookDetailView.vue';
import { createAppRouter } from '../router';
import { BOOKS_API_KEY } from '../api/injection';
import { ApiClientError } from '../api/client';
import { makeComment, makeDetail, pageOf } from '../testing/fixtures';

interface FakeApi {
  listBooks: ReturnType<typeof vi.fn>;
  getBook: ReturnType<typeof vi.fn>;
  listComments: ReturnType<typeof vi.fn>;
}

function createFakeApi(): FakeApi {
  return { listBooks: vi.fn(), getBook: vi.fn(), listComments: vi.fn() };
}

async function mountDetail(api: FakeApi, bookId = '64b000000000000000000010') {
  const router = createAppRouter(createMemoryHistory());
  await router.push(`/books/${bookId}`);
  await router.isReady();
  const wrapper = mount(BookDetailView, {
    global: { plugins: [router], provide: { [BOOKS_API_KEY]: api } },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('book detail view', () => {
  it('renders the record, review and first page of comments', async () => {
    const api = createFakeApi();
    api.getBook.mockResolvedValue(makeDetail({ title: '悬崖', review: '读得很慢，但值得。' }));
    api.listComments.mockResolvedValue(pageOf([makeComment({ content: '写得真好' })], 1));

    const { wrapper } = await mountDetail(api);

    expect(wrapper.get('[data-testid="detail-title"]').text()).toBe('悬崖');
    expect(wrapper.get('[data-testid="detail-review"]').text()).toContain('读得很慢');
    expect(wrapper.findAll('[data-testid="comment-item"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('写得真好');
    expect(wrapper.get('[data-testid="back-link"]').attributes('href')).toBe('/books');
  });

  it('shows a not-found state without loading comments', async () => {
    const api = createFakeApi();
    api.getBook.mockRejectedValue(new ApiClientError(404, 'NOT_FOUND', 'Resource not found.'));

    const { wrapper } = await mountDetail(api);

    expect(wrapper.get('[data-testid="not-found-state"]').text()).toContain('找不到这本书');
    expect(wrapper.find('[data-testid="back-link"]').exists()).toBe(true);
    expect(api.listComments).not.toHaveBeenCalled();
  });

  it('paginates comments independently of the book', async () => {
    const api = createFakeApi();
    api.getBook.mockResolvedValue(makeDetail());
    api.listComments.mockResolvedValue(pageOf([makeComment()], 25));

    const { wrapper } = await mountDetail(api);
    expect(api.listComments).toHaveBeenCalledWith('64b000000000000000000010', { page: 1 });

    await wrapper.get('[data-testid="next-page"]').trigger('click');
    await flushPromises();

    expect(api.listComments).toHaveBeenLastCalledWith('64b000000000000000000010', { page: 2 });
    expect(wrapper.get('[data-testid="page-indicator"]').text()).toContain('第 2 / 2 页');
  });

  it('shows an empty comment state', async () => {
    const api = createFakeApi();
    api.getBook.mockResolvedValue(makeDetail());
    api.listComments.mockResolvedValue(pageOf([], 0));

    const { wrapper } = await mountDetail(api);

    expect(wrapper.get('[data-testid="comments-empty"]').text()).toContain('还没有评论');
  });

  it('renders comment content as text, never as HTML', async () => {
    const api = createFakeApi();
    api.getBook.mockResolvedValue(makeDetail());
    api.listComments.mockResolvedValue(pageOf([makeComment({ content: '<b>hi</b><script>x</script>' })], 1));

    const { wrapper } = await mountDetail(api);
    const html = wrapper.html();

    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>hi</b>');
    expect(html).not.toContain('<script>x</script>');
  });

  it('retries a failed book request', async () => {
    const api = createFakeApi();
    api.getBook
      .mockRejectedValueOnce(new ApiClientError(500, 'INTERNAL_ERROR', '服务暂时不可用。'))
      .mockResolvedValueOnce(makeDetail({ title: '重试成功' }));
    api.listComments.mockResolvedValue(pageOf([], 0));

    const { wrapper } = await mountDetail(api);
    expect(wrapper.get('[data-testid="error-state"]').text()).toContain('加载失败');

    await wrapper.get('[data-testid="retry-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="detail-title"]').text()).toBe('重试成功');
    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
  });
});
