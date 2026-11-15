<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <header class="site-header">
    <RouterLink class="site-title" to="/books">桂花图书馆</RouterLink>
    <nav class="site-nav" aria-label="主导航">
      <RouterLink to="/books">书库</RouterLink>
    </nav>
  </header>
  <main id="main" class="site-main">
    <RouterView />
  </main>
  <footer class="site-footer">
    <p>公开阅读记录 · 目前只支持浏览</p>
  </footer>
</template>
