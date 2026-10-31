/**
 * 构建并输出到仓库的 docs/ 目录（GitHub Pages 发布源）
 *
 * 用法: node scripts/build-gh-pages.mjs
 * 产物: ../docs  →  https://2929d.github.io/basketball-injury-analysis/
 *
 * 处理要点:
 *  1. 子路径部署基路径 /basketball-injury-analysis/
 *  2. index.html 里的静态资源引用补上基路径前缀
 *  3. 复制 index.html → 404.html, 让 SPA 深链接(如 /report/xxx)在 Pages 上可直接打开
 *  4. 不输出 15MB 的 cover.gif(封面已改用 cover.mp4 + 海报图)
 *  5. 保留仓库里已有的 demo.html
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(__dirname, '..')
const REPO = resolve(FRONTEND, '..')
const DIST = join(FRONTEND, 'dist-ghp')
const DOCS = join(REPO, 'docs')
const BASE = '/basketball-injury-analysis/'

console.log('▶ 构建前端 (base=' + BASE + ')')
rmSync(DIST, { recursive: true, force: true })
execSync(`./node_modules/.bin/vite build --base=${BASE} --outDir=${DIST}`, {
  cwd: FRONTEND,
  stdio: 'inherit',
})

// 不需要发布的体积大的旧资源
const SKIP = new Set(['cover.gif'])
for (const f of SKIP) {
  const p = join(DIST, f)
  if (existsSync(p)) rmSync(p, { force: true })
}

console.log('▶ 写入 docs/')
mkdirSync(DOCS, { recursive: true })
// 保留 demo.html(独立演示页), 其余旧产物清掉
for (const entry of readdirSync(DOCS)) {
  if (entry === 'demo.html') continue
  rmSync(join(DOCS, entry), { recursive: true, force: true })
}
cpSync(DIST, DOCS, { recursive: true })

/** 给 index.html 里手写的绝对资源路径补上基路径前缀 */
function prefixAssets(file) {
  let html = readFileSync(file, 'utf8')
  for (const asset of ['logo.svg', 'cover.mp4', 'cover-poster.jpg', 'cover.gif']) {
    html = html.split(`"/${asset}"`).join(`"${BASE}${asset}"`)
    html = html.split(`'/${asset}'`).join(`'${BASE}${asset}'`)
  }
  writeFileSync(file, html)
}

prefixAssets(join(DOCS, 'index.html'))
// SPA 深链接回退: GitHub Pages 对未知路径返回 404.html
cpSync(join(DOCS, 'index.html'), join(DOCS, '404.html'))
writeFileSync(
  join(DOCS, '.nojekyll'),
  '',
)

const size = execSync(`du -sh ${DOCS}`).toString().trim()
console.log('✅ 完成:', DOCS, `(${size})`)
console.log('   发布地址: https://2929d.github.io/basketball-injury-analysis/')
