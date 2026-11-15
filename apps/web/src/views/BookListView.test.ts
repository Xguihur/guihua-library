import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory } from 'vue-router';
import type { BookListResponse, BookStatus } from '@guihua/contracts';
import BookListView from './BookListView.vue';
import { createAppRouter } from '../router';
import { BOOKS_API_KEY } from '../api/injection';
import { ApiClientError } from '../api/client';
import { makeBook, pageOf } from '../testing/fixtures';

interface FakeApi {
  listBooks: ReturnType<typeof vi.fn>;
  getBook: ReturnType<typeof vi.fn>;
  listComments: ReturnType<typeof vi.fn>;
}

function createFakeApi(): FakeApi {
  return { listBooks: vi.fn(), getBook: vi.fn(), listComments: vi.fn() };
}

async function mountView(api: FakeApi) {
  const router = createAppRouter(createMemoryHistory());
  await router.push('/books');
  await router.isReady();
  const wrapper = mount(BookListView, {
    global: { plugins: [router], provide: { [BOOKS_API_KEY]: api } },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('book list view', () => {
  it('renders cards from the API on first load', async () => {
    const api = createFakeApi();
    const books = [makeBook({ title: '悬崖' }), makeBook({ title: '河边的城镇' })];
    api.listBooks.mockResolvedValue(pageOf(books, 2));

    const { wrapper } = await mountView(api);

    expect(api.listBooks).toHaveBeenCalledWith({ status: undefined, page: 1 });
    expect(wrapper.findAll('[data-testid="book-card"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('悬崖');
    expect(wrapper.get('[data-testid="result-meta"]').text()).toContain('共 2 条记录');
    const links = wrapper.findAll('a.card__link');
    expect(links[0]?.attributes('href')).toBe(`/books/${books[0]?.id}`);
  });

  it('resets to page 1 when the status filter changes', async () => {
    const api = createFakeApi();
    api.listBooks.mockResolvedValue(pageOf([makeBook()], 45));

    const { wrapper } = await mountView(api);
    await wrapper.get('[data-testid="next-page"]').trigger('click');
    await flushPromises();
    expect(api.listBooks).toHaveBeenLastCalledWith({ status: undefined, page: 2 });

    await wrapper.get('[data-testid="filter-finished"]').trigger('click');
    await flushPromises();

    expect(api.listBooks).toHaveBeenLastCalledWith({ status: 'finished', page: 1 });
    expect(wrapper.get('[data-testid="filter-finished"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="filter-all"]').attributes('aria-pressed')).toBe('false');
  });

  it('never lets a slow response overwrite a newer filter result', async () => {
    const api = createFakeApi();
    let resolveFirst: (value: BookListResponse) => void = () => undefined;
    const first = new Promise<BookListResponse>((resolve) => {
      resolveFirst = resolve;
    });
    api.listBooks
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(pageOf([makeBook({ title: '新结果' })], 1));

    const { wrapper } = await mountView(api);
    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true);

    await wrapper.get('[data-testid="filter-reading"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('新结果');

    resolveFirst(pageOf([makeBook({ title: '旧结果' })], 1));
    await flushPromises();

    expect(wrapper.text()).not.toContain('旧结果');
    expect(wrapper.text()).toContain('新结果');
  });

  it('shows an error state and retries the same request', async () => {
    const api = createFakeApi();
    api.listBooks
      .mockRejectedValueOnce(new ApiClientError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用。'))
      .mockResolvedValueOnce(pageOf([makeBook({ title: '恢复后的书' })], 1));

    const { wrapper } = await mountView(api);
    expect(wrapper.get('[data-testid="error-state"]').text()).toContain('加载失败');
    expect(wrapper.get('[data-testid="error-state"]').attributes('role')).toBe('alert');

    await wrapper.get('[data-testid="retry-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('恢复后的书');
    expect(api.listBooks).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state when a filter matches nothing', async () => {
    const api = createFakeApi();
    api.listBooks.mockResolvedValue(pageOf([], 0));

    const { wrapper } = await mountView(api);

    expect(wrapper.get('[data-testid="empty-state"]').text()).toContain('暂无符合条件的记录');
    expect(wrapper.findAll('[data-testid="book-card"]')).toHaveLength(0);
  });

  it('exposes the filters as pressed-state buttons for keyboard and screen readers', async () => {
    const api = createFakeApi();
    api.listBooks.mockResolvedValue(pageOf([makeBook()], 1));

    const { wrapper } = await mountView(api);
    const group = wrapper.get('[role="group"]');

    expect(group.attributes('aria-label')).toBe('按阅读状态筛选');
    const buttons = group.findAll('button');
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => button.attributes('type') === 'button')).toBe(true);

    await wrapper.get('[data-testid="filter-reading"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="filter-reading"]').attributes('aria-pressed')).toBe('true');
    expect(api.listBooks).toHaveBeenLastCalledWith({ status: 'reading' as BookStatus, page: 1 });
  });

  it('keeps the next-page control disabled on a single page', async () => {
    const api = createFakeApi();
    api.listBooks.mockResolvedValue(pageOf([makeBook()], 1));

    const { wrapper } = await mountView(api);

    expect(wrapper.get('[data-testid="next-page"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="prev-page"]').attributes('disabled')).toBeDefined();
  });
});
