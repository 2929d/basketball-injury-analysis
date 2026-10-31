// 球鞋数据库生成器：真实型号基底 × 每型号最多 2 个配色 = 500 款
// 运行：node scripts/gen-sneakers.mjs  → 输出 src/data/sneakerData.ts
// 规则：同一型号最多 2 个配色 SKU，扩充靠增加型号（基底文件拆分在 bases-*.mjs）
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import BASES_NIKE_A from './bases-nike-a.mjs'
import BASES_NIKE_B from './bases-nike-b.mjs'
import BASES_JORDAN from './bases-jordan.mjs'
import BASES_ADIDAS from './bases-adidas.mjs'
import BASES_UA_PUMA_NB from './bases-ua-puma-nb.mjs'
import BASES_LINING from './bases-lining.mjs'
import BASES_ANTA from './bases-anta-peak-361.mjs'
import { LATEST_2025 } from './bases-latest-2025.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/sneakerData.ts')
const TARGET = 500

/* ---------- 确定性随机（mulberry32，种子固定，结果可复现） ---------- */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20260823)

/* ---------- 型号基底（真实型号，价格/评分为市场参考估算） ---------- */
// r: [缓震, 抓地, 支撑, 包裹]  hype: 联名/稀缺溢价倾向 0-3
const BASES_MAIN = [
  // ---- Nike ----
  { key: 'kd18', name: 'Nike KD 18', brand: 'Nike', retail: 1099, current: 880, hype: 2,
    tech: '全掌 Zoom Air Strobel + 前掌 Zoom 气垫', weight: '约 405g (US10)', r: [5, 5, 4, 4],
    positions: ['前锋', '全能'], footType: '中等偏大体重的锋线玩家',
    features: ['双层 Zoom 缓震脚感澎湃', '宽楦设计对宽脚友好', '鱼骨纹外底抓地极强', '抗扭片提升稳定性'],
    oneLiner: '杜兰特大杀器，缓震天花板级别' },
  { key: 'kd17', name: 'Nike KD 17', brand: 'Nike', retail: 1099, current: 760, hype: 1,
    tech: '全掌 Zoom Air Strobel + Cushlon', weight: '约 400g (US10)', r: [5, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '锋线球员',
    features: ['全掌 Strobel 气垫脚感软弹', '前代价格回落后性价比高', '鞋面透气性好', '适配大体重锋线'],
    oneLiner: 'KD 十七代，折扣后性价比之选' },
  { key: 'gtcut3', name: 'Nike G.T. Cut 3', brand: 'Nike', retail: 1099, current: 940, hype: 2,
    tech: 'ZoomX 泡棉 + 全掌 Zoom Air Strobel', weight: '约 370g (US10)', r: [4, 5, 3, 4],
    positions: ['后卫'], footType: '追求极限速度的后卫',
    features: ['场地感极佳，启动迅猛', 'ZoomX 回弹直接', '鞋身偏窄，宽脚需大半码', '为变向和急停而生'],
    oneLiner: '后卫速度型首选，贴地飞行' },
  { key: 'gtcut2', name: 'Nike G.T. Cut 2', brand: 'Nike', retail: 999, current: 700, hype: 1,
    tech: 'ZoomX + 前掌 Zoom Air', weight: '约 375g (US10)', r: [4, 5, 3, 4],
    positions: ['后卫'], footType: '速度型后卫',
    features: ['前代旗舰折扣明显', '启动反馈快', '保护性一般', '颜值配色众多'],
    oneLiner: '上代 Cut 旗舰，折扣真香' },
  { key: 'gtacademy', name: 'Nike G.T. Cut Academy', brand: 'Nike', retail: 749, current: 480, hype: 0,
    tech: '全掌 React 泡棉 + 前掌 Zoom Air', weight: '约 390g (US10)', r: [3, 4, 3, 4],
    positions: ['后卫'], footType: '预算 500 左右的速度型后卫',
    features: ['G.T. Cut 平价替代款', '前掌 Zoom 反馈直接', '轻量灵活变向顺滑', '学生党入门首选'],
    oneLiner: '500 元价位的 G.T. Cut 平替' },
  { key: 'gthustle3', name: 'Nike G.T. Hustle 3', brand: 'Nike', retail: 1099, current: 830, hype: 1,
    tech: 'Cushlon 3.0 + 后掌 Zoom Air', weight: '约 420g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '全能型球员',
    features: ['缓震保护均衡', '后掌 Zoom 落地稳', '鞋面支撑扎实', '水泥地耐用度中上'],
    oneLiner: 'Hustle 系列均衡款，六边形战士' },
  { key: 'kobe8p', name: 'Nike Kobe 8 Protro', brand: 'Nike', retail: 1399, current: 1560, hype: 3,
    tech: 'Lunarlon 中底 + 前掌 Zoom', weight: '约 350g (US10)', r: [4, 5, 3, 5],
    positions: ['后卫'], footType: '灵活型后卫 / 曼巴门徒',
    features: ['低帮灵活度顶级', '复刻版有情怀溢价', '包裹贴合如穿袜子', '保护性一般，大体重慎选'],
    oneLiner: '曼巴精神续命，情怀与实战并存' },
  { key: 'kobe6p', name: 'Nike Kobe 6 Protro', brand: 'Nike', retail: 1399, current: 1690, hype: 3,
    tech: '前掌 Zoom Air + 碳板', weight: '约 365g (US10)', r: [4, 5, 4, 5],
    positions: ['后卫', '全能'], footType: '曼巴门徒 / 收藏向玩家',
    features: ['经典蛇鳞鞋面', '前掌 Zoom 启动迅速', '二级市场持续溢价', '实战收藏两相宜'],
    oneLiner: '黑曼巴经典，一鞋难求' },
  { key: 'lj22', name: 'Nike LeBron 22', brand: 'Nike', retail: 1599, current: 1180, hype: 1,
    tech: '双气室 Zoom Turbo + Cushlon 3.0', weight: '约 470g (US10)', r: [5, 4, 5, 4],
    positions: ['前锋', '中锋'], footType: '大体重力量型球员',
    features: ['缓震极限高，膝盖友好', '保护性全包围', '偏重，小体重会觉得拖沓', '耐久度高适合水泥地'],
    oneLiner: '坦克级保护，大体重膝盖救星' },
  { key: 'lj21', name: 'Nike LeBron 21', brand: 'Nike', retail: 1599, current: 1050, hype: 1,
    tech: '全掌 Zoom Turbo + Cushlon', weight: '约 480g (US10)', r: [5, 4, 5, 4],
    positions: ['前锋', '中锋'], footType: '大体重内线/锋线',
    features: ['缓震堆料十足', '上代旗舰折扣大', '鞋身偏重', '耐磨适合外场'],
    oneLiner: '詹皇廿一代，折扣后的护膝神器' },
  { key: 'book1', name: 'Nike Book 1', brand: 'Nike', retail: 899, current: 730, hype: 1,
    tech: 'Cushlon 3.0 + 前掌 Zoom', weight: '约 395g (US10)', r: [4, 4, 4, 4],
    positions: ['后卫', '全能'], footType: '节奏型技巧流球员',
    features: ['均衡无短板', '中帮保护与灵活兼顾', '造型百搭可出街', '性价比在 Nike 线里突出'],
    oneLiner: '布克一代，均衡型万金油' },
  { key: 'ja2', name: 'Nike Ja 2', brand: 'Nike', retail: 899, current: 690, hype: 1,
    tech: '全掌 Cushlon + 前掌 Zoom Air', weight: '约 400g (US10)', r: [4, 5, 4, 4],
    positions: ['后卫', '前锋'], footType: '爆发型突破手',
    features: ['前掌反馈明显适合突破', '抓地纹路防滑一流', '宽楦舒适', '配色多价格友好'],
    oneLiner: '莫兰特战靴，暴力突破流' },
  { key: 'ja1', name: 'Nike Ja 1', brand: 'Nike', retail: 799, current: 560, hype: 0,
    tech: '全掌 Cushlon + 前掌 Zoom', weight: '约 405g (US10)', r: [4, 4, 4, 4],
    positions: ['后卫', '前锋'], footType: '预算型突破手',
    features: ['上代价格更低', '配置不打折', '适合学生党', '外场耐磨'],
    oneLiner: '莫兰特初代，折扣价宝藏' },
  { key: 'sabrina2', name: 'Nike Sabrina 2', brand: 'Nike', retail: 1099, current: 820, hype: 1,
    tech: 'Cushlon 3.0 + 全掌 Zoom Air Strobel', weight: '约 370g (US10)', r: [4, 5, 4, 4],
    positions: ['后卫', '全能'], footType: '技巧流全能后卫',
    features: ['性价比超过签名鞋水准', '贴地场地感 + Zoom 回弹', '女码男码同价友好', '约内斯库同款'],
    oneLiner: '约内斯库二代，后卫性价比黑马' },
  { key: 'sabrina1', name: 'Nike Sabrina 1', brand: 'Nike', retail: 999, current: 700, hype: 1,
    tech: '全掌 React + 前掌 Zoom', weight: '约 380g (US10)', r: [4, 4, 4, 4],
    positions: ['后卫'], footType: '技巧流后卫',
    features: ['上代折扣可观', '轻量灵活', '配色丰富', '实战口碑扎实'],
    oneLiner: 'Sabrina 初代，折扣后超值' },
  { key: 'giannis4', name: 'Nike Giannis Immortality 4', brand: 'Nike', retail: 899, current: 620, hype: 0,
    tech: '全掌 React + 后掌 Zoom Air', weight: '约 420g (US10)', r: [4, 4, 4, 3],
    positions: ['前锋', '中锋'], footType: '字母哥打法 / 锋线',
    features: ['欧洲步变向友好', '后掌缓震落地稳', '价格亲民', '耐造适合外场'],
    oneLiner: '字母哥四代，锋线实惠之选' },

  // ---- Jordan ----
  { key: 'luka3', name: 'Jordan Luka 3', brand: 'Jordan', retail: 899, current: 640, hype: 1,
    tech: '全掌 Formula 23 泡棉 + IsoMotion', weight: '约 420g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '节奏变化型全能锋卫',
    features: ['中底缓震软糯', '后跟稳定块加持', '适合欧洲步等节奏打法', '颜值在线'],
    oneLiner: '东契奇战靴，节奏大师之选' },
  { key: 'luka4', name: 'Jordan Luka 4', brand: 'Jordan', retail: 999, current: 800, hype: 1,
    tech: '全掌 Formula 23 泡棉 + 中足稳定片', weight: '约 425g (US10)', r: [4, 5, 5, 4],
    positions: ['前锋', '全能'], footType: '节奏变化型全能锋卫',
    features: ['缓震软糯一步到位', '后跟稳定块防侧翻', '大体重后卫也扛得住', '颜值实战双在线'],
    oneLiner: '东契奇四代，全能锋卫万金油' },
  { key: 'luka2', name: 'Jordan Luka 2', brand: 'Jordan', retail: 899, current: 560, hype: 0,
    tech: 'Formula 23 泡棉 + IsoMotion', weight: '约 415g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '全能锋卫',
    features: ['上代价格实惠', '缓震脚感软', '耐用度高', '适合外场'],
    oneLiner: '东契奇二代，低价高配' },
  { key: 'tatum3', name: 'Jordan Tatum 3', brand: 'Jordan', retail: 899, current: 690, hype: 1,
    tech: '全掌 Formula 23 泡棉 + 鞋面 IsoMotion', weight: '约 395g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '飞天流锋线/全能摇摆人',
    features: ['起跳落地缓震扎实', '鞋身轻弹适合锋线飞人', '配色多且价格友好', '塔图姆冠军款热度高'],
    oneLiner: '塔图姆三代，锋线飞天流' },
  { key: 'tatum2', name: 'Jordan Tatum 2', brand: 'Jordan', retail: 899, current: 580, hype: 0,
    tech: 'Formula 23 泡棉', weight: '约 400g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '锋线/摇摆人',
    features: ['上代折扣大', '轻量灵活', '配置均衡', '适合学生党'],
    oneLiner: '塔图姆二代，折扣价友好' },
  { key: 'tatum1', name: 'Jordan Tatum 1', brand: 'Jordan', retail: 899, current: 540, hype: 0,
    tech: 'Formula 23 泡棉 + 前掌 Zoom Air', weight: '约 390g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋'], footType: '锋线',
    features: ['初代签名鞋', '前掌反馈直接', '价格触底', '外场耐用'],
    oneLiner: '塔图姆初代，价格洼地' },
  { key: 'zion4', name: 'Jordan Zion 4', brand: 'Jordan', retail: 1099, current: 780, hype: 2,
    tech: 'Formula 23 泡棉 + 前掌 Zoom Air', weight: '约 440g (US10)', r: [5, 4, 5, 4],
    positions: ['前锋'], footType: '暴力扣将/大体重锋线',
    features: ['缓震堆料为暴力打法定制', '落地滤震膝盖友好', '鞋身坚固耐造', '配色联名款收藏价值高'],
    oneLiner: '锡安四代，暴力美学的盔甲' },
  { key: 'zion3', name: 'Jordan Zion 3', brand: 'Jordan', retail: 1099, current: 650, hype: 1,
    tech: 'Formula 23 + 前掌 Zoom Air', weight: '约 445g (US10)', r: [5, 4, 4, 4],
    positions: ['前锋'], footType: '力量型锋线',
    features: ['缓震极限高', '上代折扣明显', '鞋身坚固', '适合内线对抗'],
    oneLiner: '锡安三代，折扣后的肉搏神器' },
  { key: 'zion2', name: 'Jordan Zion 2', brand: 'Jordan', retail: 999, current: 520, hype: 0,
    tech: 'Formula 23 + 前掌 Zoom Air', weight: '约 450g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋'], footType: '力量型锋线',
    features: ['价格触底', '缓震保护扎实', '偏重适合大体重', '外场耐造'],
    oneLiner: '锡安二代，白菜价坦克鞋' },
  { key: 'onetake5', name: 'Jordan One Take 5', brand: 'Jordan', retail: 749, current: 470, hype: 0,
    tech: '前掌 Zoom Air + Formula 23', weight: '约 390g (US10)', r: [3, 5, 3, 4],
    positions: ['后卫', '前锋'], footType: '预算型爆发后卫',
    features: ['One Take 系列性价比线', '抓地顶级', '轻快灵活', '500 内值得考虑'],
    oneLiner: '威少支线，穷快灵代表' },
  { key: 'onetake4', name: 'Jordan One Take 4', brand: 'Jordan', retail: 699, current: 380, hype: 0,
    tech: '前掌 Zoom Air + 泡棉中底', weight: '约 395g (US10)', r: [3, 4, 3, 4],
    positions: ['后卫'], footType: '预算敏感型后卫',
    features: ['400 内价位能打', '前掌 Zoom 意外惊喜', '轻便灵活', '耐久度一般'],
    oneLiner: 'One Take 四代，学生党口粮鞋' },

  // ---- Adidas ----
  { key: 'ae1', name: 'Adidas AE 1', brand: 'Adidas', retail: 899, current: 680, hype: 2,
    tech: 'Jet Boost 全掌缓震', weight: '约 410g (US10)', r: [4, 4, 4, 5],
    positions: ['前锋', '全能'], footType: '对抗型锋线',
    features: ['鞋面锁定感极强', 'Boost 脚感软弹', '蜂窝鞋面辨识度高', '断码较快需趁早'],
    oneLiner: '爱德华兹一代，锁定感怪兽' },
  { key: 'ae1low', name: 'Adidas AE 1 Low', brand: 'Adidas', retail: 849, current: 620, hype: 1,
    tech: 'Jet Boost 全掌缓震', weight: '约 395g (US10)', r: [4, 4, 3, 4],
    positions: ['后卫', '前锋'], footType: '灵活型锋卫',
    features: ['低帮版本更灵活', 'Boost 脚感延续', '夏季透气更好', '价格低于高帮'],
    oneLiner: 'AE 1 低帮，灵活版锁定怪兽' },
  { key: 'don6', name: 'Adidas D.O.N. Issue 6', brand: 'Adidas', retail: 699, current: 470, hype: 0,
    tech: 'Lightstrike + 后掌 Boost', weight: '约 385g (US10)', r: [3, 4, 3, 4],
    positions: ['后卫'], footType: '预算有限的后卫',
    features: ['400+ 价位性价比之王', '轻快灵活', '缓震偏薄适合轻体重', '耐磨性中规中矩'],
    oneLiner: '白菜价实战鞋，学生党福音' },
  { key: 'harden8', name: 'Adidas Harden Vol. 8', brand: 'Adidas', retail: 1099, current: 750, hype: 1,
    tech: '全掌 Boost + 前 Lightstrike', weight: '约 430g (US10)', r: [5, 4, 4, 4],
    positions: ['后卫', '全能'], footType: '后撤步爱好者/节奏单打手',
    features: ['Boost 脚感软弹顶级', '后撤步落地稳', '宽楦对宽脚友好', '价格跳水后期真香'],
    oneLiner: '哈登八代，后撤步神器' },
  { key: 'harden7', name: 'Adidas Harden Vol. 7', brand: 'Adidas', retail: 1099, current: 650, hype: 0,
    tech: '全掌 Boost + Lightstrike', weight: '约 440g (US10)', r: [5, 4, 4, 4],
    positions: ['后卫', '全能'], footType: '节奏单打手',
    features: ['上代旗舰价格触底', 'Boost 软弹不减配', '重量偏大', '适合地板流'],
    oneLiner: '哈登七代，跳水价捡漏' },
  { key: 'ty3', name: 'Adidas Trae Young 3', brand: 'Adidas', retail: 899, current: 560, hype: 0,
    tech: 'Lightstrike + Boost 后掌', weight: '约 390g (US10)', r: [3, 4, 3, 4],
    positions: ['后卫'], footType: '投射型控卫',
    features: ['轻量灵活', '变向顺滑', '缓震偏场地感', '价格友好'],
    oneLiner: '吹杨三代，射手控卫之选' },
  { key: 'ty2', name: 'Adidas Trae Young 2', brand: 'Adidas', retail: 849, current: 460, hype: 0,
    tech: 'Lightstrike 中底', weight: '约 385g (US10)', r: [3, 4, 3, 4],
    positions: ['后卫'], footType: '预算型控卫',
    features: ['上代价格更低', '启动轻快', '适合小体重', '配色选择多'],
    oneLiner: '吹杨二代，低价轻后卫鞋' },

  // ---- Under Armour ----
  { key: 'curry12', name: 'UA Curry 12', brand: 'Under Armour', retail: 1099, current: 850, hype: 1,
    tech: 'UA Flow 全掌一体发泡', weight: '约 355g (US10)', r: [3, 5, 3, 4],
    positions: ['后卫'], footType: '投射型轻量后卫',
    features: ['重量轻启动快', 'Flow 材质自带粘性抓地', '缓震偏硬场地感强', '为无球跑动优化'],
    oneLiner: '库里同款，跑不累的轻炮' },
  { key: 'curry11', name: 'UA Curry 11', brand: 'Under Armour', retail: 1099, current: 600, hype: 0,
    tech: 'UA Flow 全掌发泡', weight: '约 360g (US10)', r: [3, 5, 3, 4],
    positions: ['后卫'], footType: '轻量后卫',
    features: ['上代折扣大', 'Flow 抓地依旧顶级', '重量轻', '适合跑动型打法'],
    oneLiner: '库里十一代，折扣价轻快鞋' },
  { key: 'curry10', name: 'UA Curry Flow 10', brand: 'Under Armour', retail: 999, current: 500, hype: 0,
    tech: 'UA Flow 全掌发泡', weight: '约 365g (US10)', r: [3, 5, 3, 4],
    positions: ['后卫'], footType: '预算型后卫',
    features: ['价格触底', 'Flow 抓地体验不打折', '轻量灵活', '缓震偏薄'],
    oneLiner: '库里十代，低价 Flow 入门票' },
  { key: 'embiid1', name: 'UA Embiid 1', brand: 'Under Armour', retail: 999, current: 520, hype: 0,
    tech: 'HOVR + 后掌 Micro G', weight: '约 450g (US10)', r: [4, 3, 5, 4],
    positions: ['中锋'], footType: '大体重内线',
    features: ['缓震保护为内线定制', '鞋身坚固', '价格亲民', '偏重适合大体重'],
    oneLiner: '恩比德一代，内线实惠之选' },

  // ---- Puma ----
  { key: 'mb02', name: 'Puma MB.02', brand: 'Puma', retail: 899, current: 520, hype: 0,
    tech: '全掌 Nitro 泡棉', weight: '约 385g (US10)', r: [3, 4, 3, 4],
    positions: ['后卫'], footType: '花活型后卫',
    features: ['配色天马行空', 'Nitro 轻弹', '价格友好', '包裹偏松需系紧'],
    oneLiner: '三球二代，配色玩家的最爱' },
  { key: 'mb03', name: 'Puma MB.03', brand: 'Puma', retail: 899, current: 600, hype: 1,
    tech: '全掌 Nitro 泡棉 + 后掌 Nitro Max', weight: '约 390g (US10)', r: [4, 4, 4, 4],
    positions: ['后卫'], footType: '创造型后卫',
    features: ['后掌加厚缓震提升', '鞋面包裹改良', '颜值高配色多', '价格适中'],
    oneLiner: '三球三代，渐入佳境' },
  { key: 'mb04', name: 'Puma MB.04', brand: 'Puma', retail: 899, current: 620, hype: 1,
    tech: '全掌 Nitro 泡棉', weight: '约 380g (US10)', r: [4, 4, 4, 4],
    positions: ['后卫'], footType: '创造型后卫',
    features: ['轻量灵活', '启动迅速', '配色延续花活传统', '性价比不错'],
    oneLiner: '三球四代，轻快花活流' },
  { key: 'stewie3', name: 'Puma Stewie 3', brand: 'Puma', retail: 899, current: 560, hype: 0,
    tech: '全掌 Nitro 泡棉', weight: '约 400g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '全能锋线',
    features: ['女篮签名鞋代表作', '配置不输男款', '缓震均衡', '折扣可观'],
    oneLiner: '斯图尔特三代，女篮实战标杆' },

  // ---- New Balance ----
  { key: 'kawhi4', name: 'New Balance Kawhi 4', brand: 'New Balance', retail: 1099, current: 760, hype: 1,
    tech: 'FuelCell 全掌泡棉', weight: '约 410g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋'], footType: '沉稳型锋线',
    features: ['FuelCell 软弹兼顾稳定', '做工用料扎实', '配色低调耐看', '适配中大体重的锋线'],
    oneLiner: '卡哇伊四代，低调实力派' },
  { key: 'kawhi3', name: 'New Balance Kawhi 3', brand: 'New Balance', retail: 999, current: 600, hype: 0,
    tech: 'FuelCell 泡棉', weight: '约 415g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋'], footType: '锋线',
    features: ['上代价格回落', '配置均衡', '适合中体重', '做工在线'],
    oneLiner: '卡哇伊三代，折扣价稳健鞋' },
  { key: 'twowxy4', name: 'New Balance TWO WXY v4', brand: 'New Balance', retail: 899, current: 620, hype: 0,
    tech: 'FuelCell + 中足稳定片', weight: '约 405g (US10)', r: [4, 4, 4, 4],
    positions: ['全能'], footType: '全能型球员',
    features: ['团队旗舰款', '双向缓震设计', '价格适中', '适配多位置'],
    oneLiner: 'NB 团队旗舰，全能不挑人' },

  // ---- 李宁 ----
  { key: 'wow11', name: '李宁 韦德之道 11', brand: '李宁', retail: 1299, current: 1050, hype: 3,
    tech: '全掌 䨻 + 碳板', weight: '约 440g (US10)', r: [5, 4, 5, 5],
    positions: ['前锋', '全能'], footType: '旗舰配置追求者',
    features: ['䨻+碳板国产顶级配置', '韦德之道情怀加成', '热门配色秒空', '实战收藏两相宜'],
    oneLiner: '韦德之道十一，国产信仰之巅' },
  { key: 'wow10', name: '李宁 韦德之道 10', brand: '李宁', retail: 1299, current: 880, hype: 2,
    tech: '全掌 䨻 + 碳板', weight: '约 445g (US10)', r: [5, 4, 5, 4],
    positions: ['前锋', '全能'], footType: '旗舰配置追求者',
    features: ['上代旗舰折扣可观', '配置几乎不打折', '䨻脚感顶级', '适合中大体重'],
    oneLiner: '韦德之道十，折扣后的旗舰' },
  { key: 'qc11', name: '李宁 全城 11', brand: '李宁', retail: 649, current: 470, hype: 0,
    tech: '前掌 䨻 + 全掌 Light Foam', weight: '约 425g (US10)', r: [4, 4, 4, 4],
    positions: ['全能'], footType: '全位置球员',
    features: ['全城系列性价比担当', '前掌䨻回弹明显', '保护性到位', '外场耐用'],
    oneLiner: '全城十一，老牌性价比战靴' },
  { key: 'qc12', name: '李宁 全城 12', brand: '李宁', retail: 699, current: 560, hype: 1,
    tech: '前掌 䨻 + 全掌 Light Foam', weight: '约 430g (US10)', r: [4, 4, 5, 4],
    positions: ['前锋', '全能'], footType: '注重保护的全位置球员',
    features: ['国产实战口碑标杆', '䨻科技回弹出色', '保护性堆料十足', '国货价格厚道'],
    oneLiner: '国产实战一哥，闭眼入不亏' },
  { key: 'qc13', name: '李宁 全城 13', brand: '李宁', retail: 749, current: 620, hype: 1,
    tech: '全掌 䨻 超临界 + Light Foam', weight: '约 420g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '全位置球员',
    features: ['䨻用量升级', '重量下降灵活性提升', '首发价格略涨', '配色更新颖'],
    oneLiner: '全城十三，新代进化款' },
  { key: 'ysultra', name: '李宁 驭帅 Ultra', brand: '李宁', retail: 1099, current: 860, hype: 2,
    tech: '全掌 䨻 + 碳板', weight: '约 445g (US10)', r: [5, 4, 5, 4],
    positions: ['前锋', '中锋'], footType: '大体重高强度对抗',
    features: ['䨻+碳板旗舰配置', '缓震保护双在线', '适合内线卡位肉搏', '重量偏大'],
    oneLiner: '国产旗舰，内线大体重专属' },
  { key: 'sj10', name: '李宁 闪击 10', brand: '李宁', retail: 699, current: 500, hype: 0,
    tech: '前掌 䨻 + Light Foam', weight: '约 395g (US10)', r: [4, 5, 3, 4],
    positions: ['后卫'], footType: '速度型后卫',
    features: ['闪击系列主打轻快', '前掌䨻启动迅速', '抓地纹路扎实', '包裹贴合'],
    oneLiner: '闪击十代，轻后卫快攻利器' },
  { key: 'sj9', name: '李宁 闪击 9', brand: '李宁', retail: 599, current: 400, hype: 0,
    tech: '前掌 䨻 + Light Foam', weight: '约 400g (US10)', r: [4, 4, 3, 4],
    positions: ['后卫'], footType: '预算型后卫',
    features: ['上代价格触底', '轻快灵活', '400 价位良心', '适合小体重'],
    oneLiner: '闪击九代，低价轻量好鞋' },

  // ---- 安踏 ----
  { key: 'kt10', name: '安踏 KT10', brand: '安踏', retail: 799, current: 620, hype: 1,
    tech: '全掌氮科技 + 前掌铲形碳板', weight: '约 415g (US10)', r: [4, 5, 4, 4],
    positions: ['后卫', '前锋'], footType: '射手型技巧流球员',
    features: ['氮科技轻弹', '铲形碳板推进感明显', '抓地纹路顶级', '克莱射手鞋血统'],
    oneLiner: '汤普森十代，射手定制级' },
  { key: 'kt9', name: '安踏 KT9', brand: '安踏', retail: 699, current: 480, hype: 0,
    tech: '全掌氮科技 + 碳板', weight: '约 420g (US10)', r: [4, 4, 4, 4],
    positions: ['后卫', '前锋'], footType: '射手型球员',
    features: ['上代折扣大', '氮科技配置不减', '射手友好', '外场耐用'],
    oneLiner: 'KT 九代，折扣后的射手鞋' },
  { key: 'kt8', name: '安踏 KT8', brand: '安踏', retail: 699, current: 430, hype: 0,
    tech: '全掌氮科技', weight: '约 425g (US10)', r: [4, 4, 4, 4],
    positions: ['后卫', '全能'], footType: '预算型球员',
    features: ['价格触底', '配置均衡', '做工扎实', '适合学生党'],
    oneLiner: 'KT 八代，白菜价氮科技' },
  { key: 'kai1', name: '安踏 KAI 1 (欧文1代)', brand: '安踏', retail: 799, current: 710, hype: 2,
    tech: '全掌氮科技 + 全掌碳板', weight: '约 400g (US10)', r: [4, 5, 4, 4],
    positions: ['后卫'], footType: '变向流脚踝艺术家',
    features: ['欧文亲自参与设计', '抓地包裹为变向优化', '热度高配色常断码', '性价比高于 Nike 同级'],
    oneLiner: '欧文转投安踏首作，控球手挚爱' },
  { key: 'gh3', name: '安踏 GH 3 (海沃德3代)', brand: '安踏', retail: 599, current: 420, hype: 0,
    tech: '氮科技 + 中足抗扭片', weight: '约 410g (US10)', r: [4, 4, 4, 4],
    positions: ['前锋', '全能'], footType: '技巧型锋线',
    features: ['海沃德系列性价比', '缓震均衡', '价格友好', '外场耐造'],
    oneLiner: '海沃德三代，低调性价比' },

  // ---- 匹克 ----
  { key: 'bigtriangle3', name: '匹克 大三角 3.0', brand: '匹克', retail: 599, current: 450, hype: 0,
    tech: '态极 3.0 Plus + 超临界发泡', weight: '约 420g (US10)', r: [4, 4, 4, 3],
    positions: ['前锋', '全能'], footType: '预算 500 以内的全能选手',
    features: ['态极软弹脚感好', '500 元内性价比拉满', '鞋面包裹一般需系紧', '水泥地耐用'],
    oneLiner: '态极脚感，4xx 拿下超值' },
  { key: 'bigtriangle2', name: '匹克 大三角 2.0', brand: '匹克', retail: 499, current: 340, hype: 0,
    tech: '态极 2.0 中底', weight: '约 425g (US10)', r: [4, 4, 3, 3],
    positions: ['全能'], footType: '预算敏感型球员',
    features: ['价格触底', '态极软弹不减', '适合学生党', '重量偏大'],
    oneLiner: '大三角二代，300 价位真香' },
  { key: 'parker7', name: '匹克 帕克 7 代', brand: '匹克', retail: 599, current: 320, hype: 0,
    tech: '态极 + 三级缓震', weight: '约 430g (US10)', r: [3, 4, 4, 3],
    positions: ['后卫'], footType: '预算型后卫',
    features: ['帕克系列经典续作', '缓震滤震不错', '价格亲民', '外观经典'],
    oneLiner: '帕克七代，情怀性价比双在线' },

  // ---- 361° ----
  { key: 'ag4', name: '361° AG4 (戈登4代)', brand: '361°', retail: 599, current: 440, hype: 0,
    tech: 'QU!KBALANCE + 碳临界科技', weight: '约 430g (US10)', r: [4, 4, 5, 4],
    positions: ['前锋', '中锋'], footType: '大体重高性价比需求',
    features: ['支撑稳定同级最强', '缓震滤震能力好', '锋线大体重口碑款', '400+ 价位无敌'],
    oneLiner: '大体重性价比之选，稳如老狗' },
  { key: 'ag3', name: '361° AG3 (戈登3代)', brand: '361°', retail: 469, current: 330, hype: 0,
    tech: 'QU!KFOAM+ 缓震', weight: '约 435g (US10)', r: [4, 4, 4, 3],
    positions: ['前锋'], footType: '预算型锋线',
    features: ['上代价格更低', '缓震够用', '适合大体重', '外场之王'],
    oneLiner: '戈登三代，300 价位外场神器' },
  { key: 'joker1', name: "361° JOKER 1 (约基奇1代)", brand: '361°', retail: 599, current: 450, hype: 1,
    tech: 'QU!KBALANCE + 碳临界', weight: '约 440g (US10)', r: [4, 4, 5, 4],
    positions: ['中锋'], footType: '内线核心型中锋',
    features: ['约基奇首款签名鞋', '为内线脚步设计', '缓震支撑扎实', '热度稳定'],
    oneLiner: '约基奇一代，中锋新选择' },

  // ---- 中乔 ----
  { key: 'fengci', name: '中乔 锋刺 RISE', brand: '中乔', retail: 499, current: 330, hype: 0,
    tech: '巭弹科技中底', weight: '约 400g (US10)', r: [3, 4, 3, 4],
    positions: ['后卫', '前锋'], footType: '预算敏感型球员',
    features: ['300 价位实战能打', '巭弹回弹不错', '轻量灵活', '学生党口粮鞋'],
    oneLiner: '锋刺 RISE，低价不摆烂' },
  { key: 'poying', name: '中乔 破影 PRO', brand: '中乔', retail: 429, current: 300, hype: 0,
    tech: '巭弹 + 中足抗扭片', weight: '约 405g (US10)', r: [3, 4, 3, 3],
    positions: ['全能'], footType: '入门预算型球员',
    features: ['入门价位配置在线', '缓震够用', '适合新手', '耐造'],
    oneLiner: '破影 PRO，入门实战靠谱' },
]

/* ---------- 合并全部型号基底 ---------- */
const BASES = [
  ...LATEST_2025, ...BASES_MAIN, ...BASES_NIKE_A, ...BASES_NIKE_B, ...BASES_JORDAN,
  ...BASES_ADIDAS, ...BASES_UA_PUMA_NB, ...BASES_LINING, ...BASES_ANTA,
]
// key / name 查重
const seenKeys = new Set(), seenNames = new Set()
for (const b of BASES) {
  if (seenKeys.has(b.key)) throw new Error(`重复 key: ${b.key}`)
  if (seenNames.has(b.name)) throw new Error(`重复 name: ${b.name}`)
  seenKeys.add(b.key); seenNames.add(b.name)
}

/* ---------- 配色池 ---------- */
const COLORWAYS = [
  '黑武士', '纯白', '黑白熊猫', '黑金', '紫金', '北卡蓝', '黑红 Bred', '皇家蓝 Royal',
  '芝加哥', '荧光绿', '黑紫', '白红', '灰白', '奥运配色', '冠军之路', '主场配色',
  '客场配色', '全明星', '曼巴配色', '暗夜黑', '日出橙', '深海蓝', '熔岩红', '极光绿',
  '暮光紫', '闪电路', '虎纹', '迷彩', '白蓝', '灰紫', '粉白', '橙黑',
  '青铜', '白银', '星空', '银河', '风暴灰', '烈焰红', '寒冰蓝', '沙漠黄',
  '丛林绿', 'Halo', 'Court Vision', 'Gamma Blue', 'Phoenix', 'Opening Night', 'All-Star', 'Away Game',
  'Home Game', 'Black Cat', '紫金王朝', '白曼巴', '黑曼巴', '鸳鸯', '初代复刻', '城市限定',
]

/* ---------- 每个型号分配配色数量：最多 2 个，靠型号数撑总量 ---------- */
if (BASES.length > TARGET) throw new Error(`型号数 ${BASES.length} 超过目标 ${TARGET}，无法满足“每型号最多 2 配色”`)
const need = TARGET - BASES.length      // 需要 2 配色的型号数量
const counts = BASES.map((_, i) => (i < need ? 2 : 1))

/* ---------- 价格走势生成 ---------- */
function genHistory(retail, current, pattern) {
  const pts = []
  if (pattern === 'decline') {
    const start = Math.round(retail * (1 + rng() * 0.08))
    for (let i = 0; i < 12; i++) {
      const t = i / 11
      const v = start + (current - start) * Math.pow(t, 0.9) + (rng() - 0.5) * start * 0.02
      pts.push(Math.max(150, Math.round(v)))
    }
  } else if (pattern === 'rise') {
    const start = Math.round(Math.min(current * (0.78 + rng() * 0.1), retail * 1.05))
    for (let i = 0; i < 12; i++) {
      const t = i / 11
      const v = start + (current - start) * Math.pow(t, 1.15) + (rng() - 0.5) * current * 0.02
      pts.push(Math.max(150, Math.round(v)))
    }
  } else if (pattern === 'spike') {
    // 长期低位 → 后段暴涨（稀缺款典型走势）
    const low = Math.round(current * (0.5 + rng() * 0.12))
    const jumpMonth = 7 + Math.floor(rng() * 3)
    for (let i = 0; i < 12; i++) {
      let v
      if (i < jumpMonth) v = low + (rng() - 0.5) * low * 0.08
      else v = current * (0.97 + rng() * 0.06)
      pts.push(Math.max(150, Math.round(v)))
    }
  } else {
    // stable：小幅波动
    const base = Math.round(current * (0.97 + rng() * 0.06))
    for (let i = 0; i < 12; i++) {
      const v = base + (rng() - 0.5) * base * 0.05 + (i / 11) * (current - base)
      pts.push(Math.max(150, Math.round(v)))
    }
  }
  pts[11] = current
  return pts
}

/* ---------- 生成 500 条 ---------- */
const out = []
let cwCursor = 0
BASES.forEach((b, bi) => {
  // 为每个基底做一次配色池轮转 + 随机打乱起始位，保证配色分布均匀
  cwCursor = (cwCursor + 3 + Math.floor(rng() * 5)) % COLORWAYS.length
  const used = new Set()
  for (let ci = 0; ci < counts[bi]; ci++) {
    let cw
    let guard = 0
    do {
      cw = COLORWAYS[(cwCursor + ci * 7 + guard) % COLORWAYS.length]
      guard++
    } while (used.has(cw) && guard < COLORWAYS.length)
    used.add(cw)

    // 配色价格倍率：常规折扣为主，少量溢价/稀缺款
    const roll = rng()
    let mult
    if (roll < 0.6) mult = 0.72 + rng() * 0.33
    else if (roll < 0.82) mult = 1.05 + rng() * 0.25
    else if (roll < 0.94) mult = 1.3 + rng() * 0.6
    else if (roll < 0.985) mult = 1.9 + rng() * 1.1
    else mult = b.hype >= 2 ? 3 + rng() * 1.5 : 2 + rng() * 0.5

    const current = Math.max(150, Math.round((b.current * mult) / 10) * 10)
    const pattern = mult > 2.5 ? 'spike' : mult > 1.2 ? 'rise' : mult > 0.95 ? 'stable' : 'decline'
    const history = genHistory(b.retail, current, pattern)

    out.push({
      id: `${b.key}-${ci + 1}`,
      name: `${b.name}「${cw}」`,
      brand: b.brand,
      retail: b.retail,
      current,
      history,
      year: b.year || 2022,
      cushioning: b.tech,
      weight: b.weight,
      ratings: [
        { label: '缓震', score: b.r[0] },
        { label: '抓地', score: b.r[1] },
        { label: '支撑', score: b.r[2] },
        { label: '包裹', score: b.r[3] },
      ],
      positions: b.positions,
      footType: b.footType,
      features: b.features,
      oneLiner: b.oneLiner,
      searchKey: b.name,
    })
  }
})

/* ---------- 写出 TS 文件 ---------- */
const header = `// ⚠️ 此文件由 scripts/gen-sneakers.mjs 自动生成，请勿手改
// 数据说明：以 ${BASES.length} 个真实型号为基底，每型号最多 2 个配色 SKU，共 ${out.length} 款
// 价格/评分为市场参考估算，购买时请以得物/识货实时行情为准

export interface Sneaker {
  id: string
  name: string
  brand: string
  retail: number          // 发售价 ¥
  current: number         // 当前参考价 ¥
  history: number[]       // 近12个月参考价走势
  year: number            // 发售年份
  cushioning: string      // 缓震科技
  weight: string          // 单只重量
  ratings: { label: string; score: number }[]
  positions: string[]     // 适合位置
  footType: string        // 适合脚型/体重
  features: string[]      // 特点
  oneLiner: string
  searchKey: string       // 得物/识货搜索词
}

`

const body = out
  .map((s) => {
    const hist = s.history.join(', ')
    const ratings = s.ratings.map((r) => `{ label: '${r.label}', score: ${r.score} }`).join(', ')
    const feats = s.features.map((f) => `'${f}'`).join(', ')
    const poss = s.positions.map((p) => `'${p}'`).join(', ')
    return `  {
    id: '${s.id}', name: ${JSON.stringify(s.name)}, brand: '${s.brand}', retail: ${s.retail}, current: ${s.current},
    history: [${hist}], year: ${s.year},
    cushioning: ${JSON.stringify(s.cushioning)}, weight: ${JSON.stringify(s.weight)},
    ratings: [${ratings}],
    positions: [${poss}],
    footType: ${JSON.stringify(s.footType)},
    features: [${feats}],
    oneLiner: ${JSON.stringify(s.oneLiner)},
    searchKey: ${JSON.stringify(s.searchKey)},
  },`
  })
  .join('\n')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, header + 'export const SNEAKERS: Sneaker[] = [\n' + body + '\n]\n')

console.log(`✓ 生成 ${out.length} 款球鞋 → ${OUT}`)
console.log(`  型号基底 ${BASES.length} 个（每型号最多 2 配色）| 配色池 ${COLORWAYS.length} 个`)
const brands = [...new Set(out.map((s) => s.brand))]
console.log(`  品牌：${brands.join(' / ')}`)
const priceMin = Math.min(...out.map((s) => s.current))
const priceMax = Math.max(...out.map((s) => s.current))
console.log(`  当前价区间：¥${priceMin} - ¥${priceMax}`)
