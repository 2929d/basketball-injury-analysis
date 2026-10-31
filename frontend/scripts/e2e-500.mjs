import puppeteer from 'puppeteer-core'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))

await page.goto('http://localhost:4173/sneakers', { waitUntil: 'networkidle2', timeout: 60000 })
await wait(1500)

const r1 = await page.evaluate(() => {
  const cards = document.querySelectorAll('.snk-card')
  const count = document.querySelector('.snk-count')?.textContent || ''
  const brands = [...document.querySelectorAll('.snk-filter-row .snk-select option, .snk-chip')].length
  return { cards: cards.length, count, brandOptionCount: document.querySelectorAll('select')[0]?.options.length }
})
console.log('初始状态:', JSON.stringify(r1))

// 点加载更多两次
await page.evaluate(() => [...document.querySelectorAll('.snk-load-more .btn')].pop()?.click())
await wait(600)
await page.evaluate(() => [...document.querySelectorAll('.snk-load-more .btn')].pop()?.click())
await wait(600)
const r2 = await page.evaluate(() => ({ cards: document.querySelectorAll('.snk-card').length }))
console.log('加载两次后卡片数:', JSON.stringify(r2))

// 切品牌筛选 → 应重置回 24
await page.select('.snk-filter-row select', '李宁')
await wait(800)
const r3 = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.snk-card')]
  return {
    cards: cards.length,
    count: document.querySelector('.snk-count')?.textContent || '',
    allLiNing: cards.every((c) => c.querySelector('.snk-brand')?.textContent === '李宁'),
  }
})
console.log('筛选李宁后:', JSON.stringify(r3))

// 排序：价格低→高
await page.select('.snk-sort-select', '价格低→高')
await wait(600)
const r4 = await page.evaluate(() =>
  [...document.querySelectorAll('.snk-price')].map((e) => parseInt(e.textContent.replace('¥', '')))
)
console.log('排序后前6价格:', r4.slice(0, 6), '升序:', r4.every((v, i) => i === 0 || v >= r4[i - 1]))

// 打开详情弹窗
await page.evaluate(() => document.querySelectorAll('.snk-card')[0]?.querySelector('.snk-btn-detail')?.click())
await wait(1200)
const r5 = await page.evaluate(() => ({
  modal: !!document.querySelector('.snk-modal, [class*="modal"]'),
  hasChart: !!document.querySelector('.recharts-wrapper'),
}))
console.log('详情弹窗:', JSON.stringify(r5))
await page.screenshot({ path: '/tmp/sneakers_500.png', fullPage: false })

await browser.close()
console.log('✓ 全部检查完成')
