#!/usr/bin/env node
/**
 * 小哲讲大模型 · Agent 知识库 —— 语雀风格单文件文档站构建脚本
 *
 * 用法：node build.mjs
 * 输入：../xiaozhe-agent-notes/（Markdown 导出）
 * 输出：../index.html（单文件站点，可直接双击打开，也可作为 GitHub Pages 入口）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'xiaozhe-agent-notes');
const OUT_FILE = path.join(ROOT, 'index.html');
const CACHE_DIR = path.join(__dirname, '.cache', 'images');
const STYLE = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const RUNTIME = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');

const KB_TITLE = '小哲讲大模型 · Agent 知识库';
const SOURCE_REPO = 'https://github.com/hlwhut225/xiaozhe-agent';
const IMAGE_INLINE_LIMIT = 12 * 1024 * 1024;

/* ---------- 工具 ---------- */
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return { meta, body: raw.slice(m[0].length) };
}
function groupDisplayName(id) {
  if (id === '_根目录') return '根目录';
  return id.replace(/^\d+[._]?\s*/, '');
}
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/* ---------- Markdown 渲染器 ---------- */
const md = new MarkdownIt({ html: true, linkify: true });
const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || '';
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/* ---------- 图片内嵌 ---------- */
fs.mkdirSync(CACHE_DIR, { recursive: true });
let inlinedBytes = 0;
const imgMemo = new Map();

// 大截图先压缩再内嵌：macOS 自带 sips 转 JPEG，避免单文件膨胀到十几 MB
function compressIfLarge(buf, ext) {
  if (process.platform !== 'darwin' || buf.length < 300 * 1024) return null;
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null;
  const tmpIn = path.join(CACHE_DIR, '_tmp-in' + ext);
  const tmpOut = path.join(CACHE_DIR, '_tmp-out.jpg');
  try {
    fs.writeFileSync(tmpIn, buf);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '75', '-Z', '1500', tmpIn, '--out', tmpOut], { stdio: 'ignore' });
    const out = fs.readFileSync(tmpOut);
    return out.length < buf.length ? { buf: out, ext: '.jpg' } : null;
  } catch (e) {
    return null;
  } finally {
    for (const f of [tmpIn, tmpOut]) { try { fs.unlinkSync(f); } catch (e) {} }
  }
}

async function inlineImage(url) {
  if (imgMemo.has(url)) return imgMemo.get(url);
  try {
    let ext = (path.extname(new URL(url).pathname) || '.png').toLowerCase();
    const key = crypto.createHash('md5').update(url).digest('hex');
    let file = path.join(CACHE_DIR, key + ext);
    let buf;
    if (fs.existsSync(file)) {
      buf = fs.readFileSync(file);
    } else {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.yuque.com/' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      buf = Buffer.from(await res.arrayBuffer());
      const compressed = compressIfLarge(buf, ext);
      if (compressed) {
        buf = compressed.buf;
        ext = compressed.ext;
        file = path.join(CACHE_DIR, key + ext);
      }
      fs.writeFileSync(file, buf);
    }
    if (inlinedBytes + buf.length > IMAGE_INLINE_LIMIT) {
      console.warn(`  [图片] 超出内嵌上限，保留远程地址: ${url}`);
      imgMemo.set(url, url);
      return url;
    }
    inlinedBytes += buf.length;
    const uri = `data:${MIME[ext] || 'image/png'};base64,${buf.toString('base64')}`;
    imgMemo.set(url, uri);
    return uri;
  } catch (e) {
    console.warn(`  [图片] 下载失败(${e.message})，保留远程地址: ${url}`);
    imgMemo.set(url, url);
    return url;
  }
}

/* ---------- 目录扫描 ---------- */
const catalogPath = path.join(SRC_DIR, 'catalog.json');
let catalog = { groups: [] };
if (fs.existsSync(catalogPath)) {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}
const dirs = fs
  .readdirSync(SRC_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const groupOrder = [];
for (const g of ['_根目录', ...(catalog.groups || [])]) {
  if (dirs.includes(g) && !groupOrder.includes(g)) groupOrder.push(g);
}
for (const g of dirs.sort()) if (!groupOrder.includes(g)) groupOrder.push(g);

const groupsOut = groupOrder.map((id) => ({ id, name: groupDisplayName(id) }));
console.log(`分组 ${groupsOut.length} 个：${groupsOut.map((g) => g.name).join(' / ')}`);

/* ---------- 逐篇处理 ---------- */
const docs = [];
let imgCount = 0;
for (const gid of groupOrder) {
  const dir = path.join(SRC_DIR, gid);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const env = { toc: [] };
    const tokens = md.parse(body, env);

    // 去掉开头重复的一级标题
    let h1 = '';
    const hi = tokens.findIndex((t) => t.type === 'heading_open' && t.tag === 'h1');
    if (hi !== -1) {
      const inline = tokens[hi + 1];
      h1 = (inline && inline.children ? inline.children.map((c) => c.content).join('') : inline ? inline.content : '').trim();
      tokens.splice(hi, 3);
    }
    // 图片内嵌
    for (const t of tokens) {
      if (!t.children) continue;
      for (const c of t.children) {
        if (c.type !== 'image') continue;
        const src = c.attrGet('src') || '';
        if (/^https?:\/\//.test(src)) {
          imgCount++;
          const nu = await inlineImage(src);
          if (nu !== src) c.attrSet('src', nu);
        }
      }
    }
    // 标题锚点
    let n = 0;
    for (const t of tokens) {
      if (t.type === 'heading_open') t.attrSet('id', 'h' + ++n);
    }
    const html = md.renderer.render(tokens, md.options, env);
    const base = file.replace(/\.md$/, '');
    const title = (meta.title || h1 || base).trim();
    docs.push({
      f: `${gid}/${base}`,
      g: gid,
      t: title,
      u: meta.source || '',
      x: meta.exported_at || '',
      h: html,
    });
  }
  console.log(`  ${gid} → ${files.length} 篇`);
}

/* ---------- 组装单文件 ---------- */
const builtAt = new Date().toISOString().slice(0, 10);
const data = {
  title: KB_TITLE,
  groups: groupsOut,
  docs,
  builtAt,
  kbSource: 'https://www.yuque.com/u28128023/mk3u4m',
};
const dataJson = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const sideFoot =
  `共 ${docs.length} 篇 · 构建于 ${builtAt}<br>` +
  `来源：语雀知识库导出 · <a href="${SOURCE_REPO}" target="_blank" rel="noopener">导出仓库 ↗</a>`;

const favicon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#00b96b"/><path d="M9 8h14v3H9zM9 14h14v2.5H9zM9 19.5h9V22H9z" fill="#fff"/></svg>'
  );

const template = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="__TITLE__ —— 语雀知识库导出，含基础知识、LLM、提示工程、RAG、Agent 架构、系统设计、场景题与面经等 286 篇文档。">
<title>__TITLE__</title>
<link rel="icon" href="__FAVICON__">
<style>
__STYLE__
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="kb-head">
      <div class="kb-title">__TITLE__</div>
      <div class="kb-sub">语雀导出 · 共 __COUNT__ 篇</div>
    </div>
    <div class="search-wrap">
      <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
      <input id="search-input" class="search-input" type="text" placeholder="搜索全文…（按 / 聚焦）" autocomplete="off">
    </div>
    <div id="search-results" class="search-results"></div>
    <nav id="nav-scroll" class="nav-scroll"><div id="tree"></div></nav>
    <div class="side-foot">__FOOT__</div>
  </aside>
  <main class="main">
    <div class="topbar">
      <button id="menu-btn" class="menu-btn" aria-label="菜单"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"></path></svg></button>
      <div id="crumb" class="crumb"></div>
    </div>
    <div class="content-wrap">
      <article class="doc">
        <h1 id="doc-title" class="doc-title"></h1>
        <div id="doc-meta" class="doc-meta"></div>
        <div id="doc-body" class="doc-body"></div>
        <div id="pager" class="pager"></div>
      </article>
      <aside id="outline" class="outline"></aside>
    </div>
  </main>
</div>
<div id="mask" class="mask"></div>
<div id="lightbox" class="lightbox"></div>
<script>window.__DOCS_DATA__ = __DATA__;</script>
<script>
__RUNTIME__
</script>
</body>
</html>`;

const output = template
  .split('__TITLE__').join(escHtml(KB_TITLE))
  .split('__FAVICON__').join(favicon)
  .split('__COUNT__').join(String(docs.length))
  .split('__FOOT__').join(sideFoot)
  .split('__STYLE__').join(STYLE)
  .split('__DATA__').join(dataJson)
  .split('__RUNTIME__').join(RUNTIME);

fs.writeFileSync(OUT_FILE, output);
const mb = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
console.log(`\n完成：${OUT_FILE}`);
console.log(`文档 ${docs.length} 篇 · 图片引用 ${imgCount} 处（内嵌 ${(inlinedBytes / 1024).toFixed(0)} KB） · 产物 ${mb} MB`);
