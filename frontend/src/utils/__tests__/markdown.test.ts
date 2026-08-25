/**
 * Markdown 转 HTML 转换函数测试
 * 重点验证表格、列表等 GFM 元素的正确渲染
 */
import { convertMarkdownToHtml, processInlineMarkdown } from '../markdown'
import { getErrorMessage } from '../helpers'

// ── 辅助函数 ──
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`)
  }
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`FAIL: ${message}\n  Expected to contain: ${needle}\n  Actual: ${haystack.substring(0, 200)}...`)
  }
}

function assertNotContains(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    throw new Error(`FAIL: ${message}\n  Should not contain: ${needle}\n  Actual: ${haystack.substring(0, 200)}...`)
  }
}

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (e: unknown) {
    failed++
    console.log(`✗ ${name}`)
    console.log(`    ${getErrorMessage(e)}`)
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. 表格渲染测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 1. 表格渲染测试 ═══')

test('简单表格应正确转换为 HTML table', () => {
  const md = `| 列1 | 列2 |
| --- | --- |
| 数据1 | 数据2 |`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<table>', '应包含 <table> 标签')
  assertContains(html, '</table>', '应包含 </table> 标签')
  assertContains(html, '<th>列1</th>', '应包含表头单元格')
  assertContains(html, '<th>列2</th>', '应包含表头单元格')
  assertContains(html, '<td>数据1</td>', '应包含数据单元格')
  assertContains(html, '<td>数据2</td>', '应包含数据单元格')
})

test('表格不应保留原始 Markdown 管道符', () => {
  const md = `| 列1 | 列2 |
| --- | --- |
| 数据1 | 数据2 |`
  const html = convertMarkdownToHtml(md)
  // 转换后不应出现连续的 | 数据 | 形式
  assertNotContains(html, '| 数据1 |', '不应保留原始 Markdown 表格语法')
})

test('多行表格应正确渲染所有行', () => {
  const md = `| 姓名 | 年龄 | 职业 |
| --- | --- | --- |
| 张三 | 25 | 工程师 |
| 李四 | 30 | 设计师 |
| 王五 | 28 | 产品经理 |`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<th>姓名</th>', '应包含表头"姓名"')
  assertContains(html, '<th>年龄</th>', '应包含表头"年龄"')
  assertContains(html, '<th>职业</th>', '应包含表头"职业"')
  assertContains(html, '<td>张三</td>', '应包含数据"张三"')
  assertContains(html, '<td>李四</td>', '应包含数据"李四"')
  assertContains(html, '<td>王五</td>', '应包含数据"王五"')
  // 应有 3 行数据行 + 1 行表头
  const trCount = (html.match(/<tr>/g) || []).length
  assert(trCount === 4, `应有4个<tr>标签(1表头+3数据)，实际: ${trCount}`)
})

test('表格单元格中的行内格式应正确处理', () => {
  const md = `| 标题 | 内容 |
| --- | --- |
| **粗体** | *斜体* |`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<th>标题</th>', '表头应正确渲染')
  assertContains(html, '<td><strong>粗体</strong></td>', '单元格中粗体应正确渲染')
  assertContains(html, '<td><em>斜体</em></td>', '单元格中斜体应正确渲染')
})

test('表格前后内容应正确分段', () => {
  const md = `# 标题

这是一段文字。

| 列1 | 列2 |
| --- | --- |
| 数据1 | 数据2 |

表格后的文字。`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<h1>标题</h1>', '标题应正确渲染')
  assertContains(html, '<table>', '表格应正确渲染')
  assertContains(html, '这是一段文字', '表格前文字应保留')
  assertContains(html, '表格后的文字', '表格后文字应保留')
})

test('多个表格应分别正确渲染', () => {
  const md = `| 表1列1 | 表1列2 |
| --- | --- |
| 数据1 | 数据2 |

中间文字

| 表2列1 | 表2列2 |
| --- | --- |
| 数据3 | 数据4 |`
  const html = convertMarkdownToHtml(md)
  const tableCount = (html.match(/<table>/g) || []).length
  assert(tableCount === 2, `应有2个表格，实际: ${tableCount}`)
  assertContains(html, '<td>数据1</td>', '第一个表格数据应存在')
  assertContains(html, '<td>数据4</td>', '第二个表格数据应存在')
})

test('带对齐语法的表格应正确解析', () => {
  const md = `| 左对齐 | 右对齐 | 居中 |
| :--- | ---: | :---: |
| 左 | 右 | 中 |`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<table>', '带对齐语法的表格应正确渲染')
  assertContains(html, '<td>左</td>', '数据单元格应存在')
  assertContains(html, '<td>右</td>', '数据单元格应存在')
  assertContains(html, '<td>中</td>', '数据单元格应存在')
})

test('表格中空单元格应正确处理', () => {
  const md = `| 列1 | 列2 | 列3 |
| --- | --- | --- |
| 有 |  | 也有 |`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<table>', '含空单元格的表格应正确渲染')
  assertContains(html, '<td>有</td>', '第一个单元格应存在')
  assertContains(html, '<td>也有</td>', '第三个单元格应存在')
})

// ═══════════════════════════════════════════════════════════════
// 2. 列表渲染测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 2. 列表渲染测试 ═══')

test('无序列表应正确渲染', () => {
  const md = `- 项目1
- 项目2
- 项目3`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<ul>', '应包含 <ul> 标签')
  assertContains(html, '</ul>', '应包含 </ul> 标签')
  assertContains(html, '<li>项目1</li>', '应包含列表项1')
  assertContains(html, '<li>项目2</li>', '应包含列表项2')
  assertContains(html, '<li>项目3</li>', '应包含列表项3')
})

test('有序列表应正确渲染', () => {
  const md = `1. 第一步
2. 第二步
3. 第三步`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<ol>', '应包含 <ol> 标签')
  assertContains(html, '</ol>', '应包含 </ol> 标签')
  assertContains(html, '<li>第一步</li>', '应包含列表项1')
  assertContains(html, '<li>第二步</li>', '应包含列表项2')
  assertContains(html, '<li>第三步</li>', '应包含列表项3')
})

// ═══════════════════════════════════════════════════════════════
// 3. 标题和块级元素测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 3. 标题和块级元素测试 ═══')

test('各级标题应正确渲染', () => {
  const md = `# 一级标题
## 二级标题
### 三级标题
#### 四级标题`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<h1>一级标题</h1>', '一级标题应正确渲染')
  assertContains(html, '<h2>二级标题</h2>', '二级标题应正确渲染')
  assertContains(html, '<h3>三级标题</h3>', '三级标题应正确渲染')
  assertContains(html, '<h4>四级标题</h4>', '四级标题应正确渲染')
})

test('引用块应正确渲染', () => {
  const md = `> 这是引用的文字`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<blockquote>这是引用的文字</blockquote>', '引用块应正确渲染')
})

test('分隔线应正确渲染', () => {
  const md = `上面的文字

---

下面的文字`
  const html = convertMarkdownToHtml(md)
  assertContains(html, '<hr/>', '分隔线应正确渲染')
})

// ═══════════════════════════════════════════════════════════════
// 4. 行内格式测试
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 4. 行内格式测试 ═══')

test('行内格式函数应正确处理加粗', () => {
  const result = processInlineMarkdown('这是**加粗**的文字')
  assertEqual(result, '这是<strong>加粗</strong>的文字', '加粗应正确转换')
})

test('行内格式函数应正确处理斜体', () => {
  const result = processInlineMarkdown('这是*斜体*的文字')
  assertEqual(result, '这是<em>斜体</em>的文字', '斜体应正确转换')
})

test('行内格式函数应正确处理行内代码', () => {
  const result = processInlineMarkdown('这是`代码`的文字')
  assertEqual(result, '这是<code>代码</code>的文字', '行内代码应正确转换')
})

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`)
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. 综合测试（模拟真实报告内容）
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ 5. 综合测试 ═══')

test('综合报告内容应正确渲染', () => {
  const md = `# 八字命理分析报告

## 一、命主基本信息

命主：张三
性别：男

## 二、四柱八字

| 柱位 | 天干 | 地支 | 藏干 |
| --- | --- | --- | --- |
| 年柱 | 甲 | 子 | 癸 |
| 月柱 | 丙 | 寅 | 甲丙戊 |
| 日柱 | 戊 | 辰 | 戊乙癸 |
| 时柱 | 庚 | 申 | 庚壬戊 |

## 三、五行分析

1. **木**：偏旺
2. **火**：中和
3. **土**：偏弱

> 注意：以上分析仅供参考

---

## 四、大运排列

| 大运 | 年龄 | 天干地支 |
| --- | --- | --- |
| 第一运 | 1-10 | 丁卯 |
| 第二运 | 11-20 | 戊辰 |`
  const html = convertMarkdownToHtml(md)

  // 标题
  assertContains(html, '<h1>八字命理分析报告</h1>', '一级标题应存在')
  assertContains(html, '<h2>一、命主基本信息</h2>', '二级标题应存在')

  // 表格
  assertContains(html, '<table>', '表格应存在')
  assertContains(html, '<th>柱位</th>', '表头应存在')
  assertContains(html, '<td>甲</td>', '表格数据应存在')

  // 列表
  assertContains(html, '<ol>', '有序列表应存在')
  assertContains(html, '<li><strong>木</strong>：偏旺</li>', '列表项含加粗应正确')

  // 引用
  assertContains(html, '<blockquote>', '引用块应存在')

  // 分隔线
  assertContains(html, '<hr/>', '分隔线应存在')
})

// ═══════════════════════════════════════════════════════════════
// 测试结果汇总
// ═══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════')
console.log(`测试结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`)
console.log('════════════════════════════════════════')

if (failed > 0) {
  throw new Error(`${failed} tests failed`)
}
