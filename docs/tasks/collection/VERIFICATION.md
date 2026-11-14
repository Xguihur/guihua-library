# 文档交接验证记录

- 版本：v1.0；日期：2026-11-15（Asia/Shanghai）。
- 范围：只验证本次任务合集的结构、原文保真、链接、必要章节和 Git 交付，不验证应用或解除 HSQL-7 审查阻塞。
- 基线：dev / c19e1b5e75102c6530a27f8e2e0f519fba579b8a。
- 目标分支：task/hsql-6-agent-handoff。

## 验证内容

1. 结构化快照恰有 HSQL-7 至 HSQL-15 九项，ID 唯一、顺序与前置无断链。
2. 每份规格的原始描述与平台 task-snapshot.json 一致；快照与本轮读取的平台任务记录一致。
3. 每份规格都有目标/非目标、原始描述、证据/模块、契约、步骤、TDD、验收、风险/回滚、版本章节。
4. README、HANDOFF、EXECUTION、DECISIONS、全部规格、基线 SDD/契约/ADR 和 HSQL-8 原细化均可访问，相对 Markdown 链接指向现存文件。
5. HSQL-8 原细化与下载附件逐字节一致；已批准 SDD、原错误契约和 HSQL-7 历史记录未被本次整理改写。
6. 新增文件无尾随空白/不闭合代码块；git diff --cached --check 无空白错误；提交范围只有 Markdown 与任务 JSON，无应用代码、凭据或生产数据。
7. 推送后以远程 refs/heads/task/hsql-6-agent-handoff 核验提交 SHA，确认 dev 未因本次推送改变。

## 真实结果

以下是本次整理的真实检查结果：

| 检查 | 结果 |
|---|---|
| 本页 Node 只读检查块 | 退出 0：task-collection: PASS (9 tasks, 25 Markdown files, 111 relative links) |
| 快照与本轮 hifox task view HSQL-6 的 9 个子任务逐项比较 | PASS；ID、标题、描述、源更新日期、平台状态一致 |
| cmp HSQL-8 入库细化与下载原附件 | 退出 0，逐字节一致 |
| git diff --exit-code c19e1b5 -- 原三份 SDD、contracts、HSQL-7 历史记录、adr | 退出 0；这些业务基线及历史证据未被本次改写 |
| git diff --cached --check | 退出 0；本次暂存文档无空白错误 |
| 推送前 git ls-remote --heads origin dev task/hsql-6-agent-handoff | 退出 0；dev 为 c19e1b5，任务分支尚未创建 |

首次全文件换行检查在历史 SDD-PLAN-v1.md 无末尾换行处退出 1。该归档不是本次修改对象，故保留原件，将新增文件格式检查限定为根 README 和本合集；全部文档仍检查链接和代码块闭合。随后执行上表检查通过，没有通过改写历史计划取得成功。

应用安装、类型检查、lint、测试、构建、数据库和浏览器验证均未运行，因为仓库只有文档；不能据本页判定 HSQL-7 审查通过。

本文件记录提交前已完成的检查。最终提交 SHA、push 结果与推送后远程核验由交付消息给出，并可用下文命令自行复核，不要求提交自包含其自身 SHA。

本次先尝试 hifox repo checkout，后台 fetch 长时间无返回，取消的是本次 CLI 请求（退出 143），未停止 daemon；随后 Git 后备克隆远程 dev 成功。推送仍优先 hifox repo push，仅其明确失败才 Git 回退；本任务不合并或推送到 dev。

## 复现方式

在仓库根目录执行下面的只读检查；任一断言失败返回非零。它检查导出完整性，不判断历史业务契约或应用实现正确性。

~~~sh
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = 'docs/tasks/collection';
const snapshot = JSON.parse(fs.readFileSync(dir + '/task-snapshot.json', 'utf8'));
assert.equal(snapshot.tasks.length, 9);
assert.equal(new Set(snapshot.tasks.map(t => t.id)).size, 9);
snapshot.tasks.forEach((task, index) => {
  assert.equal(task.identifier, 'HSQL-' + (index + 7));
  assert.equal(task.order, index + 1);
  assert.deepEqual(task.dependsOn, index ? ['HSQL-' + (index + 6)] : []);
  const file = dir + '/' + task.identifier + '.md';
  const text = fs.readFileSync(file, 'utf8');
  const original = text.match(/<!-- BEGIN ORIGINAL TASK DESCRIPTION -->\n([\s\S]*?)\n<!-- END ORIGINAL TASK DESCRIPTION -->/);
  assert.ok(original, file);
  assert.equal(original[1], task.description, 'original: ' + file);
  assert.equal((text.match(/^## \d+\./gm) || []).length, 9, file);
  for (const title of ['目标', '原始描述', '现状证据', '对外契约', '实施步骤', 'TDD', '验收命令', '风险', '版本']) {
    assert.ok(text.includes(title), file + ': ' + title);
  }
  assert.ok(text.includes(task.id), file);
});
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const docs = ['README.md', ...walk('docs').filter(file => file.endsWith('.md'))];
let links = 0;
for (const file of docs) {
  const source = fs.readFileSync(file, 'utf8');
  if (file === 'README.md' || file.startsWith(dir + '/')) {
    assert.ok(source.endsWith('\n'), 'newline: ' + file);
    assert.ok(!/[ \t]+\r?$/m.test(source), 'trailing whitespace: ' + file);
  }
  let fence = null;
  const visible = source.split('\n').filter(line => {
    const mark = line.match(/^\s*(\x60{3,}|~{3,})/);
    if (mark) {
      if (fence === null) fence = mark[1][0];
      else if (fence === mark[1][0]) fence = null;
      return false;
    }
    return fence === null;
  }).join('\n');
  assert.equal(fence, null, 'unclosed fence: ' + file);
  for (const match of visible.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
    const target = decodeURIComponent(href.split('#')[0]);
    assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), file + ' -> ' + href);
    links++;
  }
}
for (const file of ['README.md', 'HANDOFF.md', 'EXECUTION.md', 'DECISIONS.md', 'VERIFICATION.md']) {
  assert.ok(fs.existsSync(dir + '/' + file), file);
}
assert.ok(fs.existsSync('docs/plans/HSQL-8-SDD-v1.0.md'));
assert.ok(fs.readFileSync('docs/plans/SDD-PLAN-v1.2.md', 'utf8').includes('- **状态**：已批准'));
const handoff = fs.readFileSync(dir + '/HANDOFF.md', 'utf8');
assert.ok(handoff.includes('B1') && handoff.includes('B2'));
console.log('task-collection: PASS (9 tasks, ' + docs.length + ' Markdown files, ' + links + ' relative links)');
NODE
~~~

再执行 git diff --check、git show --format= --check HEAD、git ls-remote --heads origin task/hsql-6-agent-handoff，对照交付消息 SHA。本文代码块仅为只读本地检查命令，不创建业务代码或修改文档。

当前文档检查不运行 HSQL-7 已知有盲区的旧检查块，不把旧脚本 PASS 等同于 B1/B2 修复完成。HSQL-7 的反例修复与独立复核仍为接手任务。
