# study

在线文档站：**小哲讲大模型 · Agent 知识库**（语雀知识库 Markdown 导出，286 篇）。

- 线上地址：https://zkr-1211.github.io/study/
- 本地打开：直接用浏览器打开根目录 `index.html`（单文件、离线可用、图片已内嵌）

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | 构建产物：单文件文档站（GitHub Pages 入口） |
| `xiaozhe-agent-notes/` | Markdown 源文档（286 篇 + `catalog.json` 目录元数据） |
| `tools/build.mjs` | 构建脚本（markdown-it 预渲染；大图经 macOS `sips` 压缩后 base64 内嵌） |
| `tools/style.css` `tools/runtime.js` | 站点样式与交互（树导航 / 路由 / 全文搜索 / 大纲 / 上下篇） |
| `scripts/yuque-md-converter.mjs` | 语雀导出转换脚本（来源于导出仓库，保留参考） |

## 重新构建

```bash
cd tools
npm install
node build.mjs   # 生成 ../index.html
```

> 更新知识库：替换 `xiaozhe-agent-notes/` 下的 Markdown 后重新构建即可。

## 功能

- 左侧分组树导航（折叠状态本地记忆）、`/` 快捷聚焦搜索
- 全文搜索（标题优先，正文命中显示上下文摘要）
- 每篇右侧大纲（滚动跟随高亮）、上一篇/下一篇
- 代码块一键复制、图片点击放大
- 移动端抽屉式侧边栏

## 来源

- 语雀知识库：https://www.yuque.com/u28128023/mk3u4m
- Markdown 导出仓库：https://github.com/hlwhut225/xiaozhe-agent

内容仅供个人学习参考。
