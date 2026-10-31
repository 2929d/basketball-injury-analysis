// 2025-2026 最新球鞋基底（仅含现有库中没有的新型 号）
// year 字段标识发售年份，用于「最新优先」排序和新品标签

export const LATEST_2025 = [
  /* ===== Nike 2025-2026 ===== */
  { key: 'gtfuture', name: 'Nike G.T. Future', brand: 'Nike', retail: 1399, current: 1150, hype: 2, year: 2025,
    tech: '前掌 Air Zoom + 全掌 Zoom Strobel + Cushlon 3.0', weight: '约 410g (US10)', r: [5,5,4,5],
    positions: ['全能'], footType: '全能球员/科技流',
    features: ['一体式无缝未来感鞋面', '2025 冬季重磅发售', 'Nike 篮球尖端科技集大成', '低帮兼具性能和个性'],
    oneLiner: '2025 压轴旗舰，未来科技全家桶' },

  { key: 'gtcut3turbo', name: 'Nike G.T. Cut 3 Turbo', brand: 'Nike', retail: 1499, current: 1080, hype: 2, year: 2025,
    tech: 'ZoomX 超敏回弹中底 + 吸附式抓地', weight: '约 365g (US10)', r: [4,5,5,5],
    positions: ['后卫'], footType: '速度型后卫/变向狂魔',
    features: ['厘米级急停转向', '普尔 PE 配色致敬 Cookies', '2 月发售后撤步神器', 'G.T. Cut 3 升级版'],
    oneLiner: '后撤步神器 Turbo 版' },

  { key: 'gtcut1retro', name: 'Nike G.T. Cut 1 Retro', brand: 'Nike', retail: 1199, current: 850, hype: 1, year: 2025,
    tech: 'React + Zoom Air', weight: '约 380g (US10)', r: [4,5,5,4],
    positions: ['后卫'], footType: '经典复刻后卫首选',
    features: ['经典 G.T. Cut 1 回归复刻', 'Volt/Black Chrome/White Chrome 三配色', '8 月回归', 'React+Zoom 经典缓震组合'],
    oneLiner: '经典 G.T. Cut 1 复刻回归' },

  { key: 'ja3', name: 'Nike Ja 3', brand: 'Nike', retail: 899, current: 680, hype: 1, year: 2025,
    tech: '全掌 Cushlon + 前掌 Zoom Air', weight: '约 395g (US10)', r: [4,5,4,4],
    positions: ['后卫','前锋'], footType: '爆发力型后卫',
    features: ['莫兰特三代签名鞋', 'NY vs NY/EYBL/Max Volume 多配色', '前掌 Zoom 反馈明显', '适合飞扣型后卫'],
    oneLiner: '莫兰特三代，飞天流后卫专属' },

  { key: 'aone', name: "Nike A'One", brand: 'Nike', retail: 799, current: 520, hype: 1, year: 2025,
    tech: '前掌 Zoom Air + Cushlon', weight: '约 375g (US10)', r: [4,5,4,5],
    positions: ['后卫'], footType: '灵活后卫/女生友好',
    features: ['阿贾·威尔逊首款签名鞋', '5 月发售轻量灵活', '女码男码同价友好', '抓地出色评测 8.0'],
    oneLiner: "A'ja Wilson 首款签名鞋" },

  { key: 'freak7', name: 'Nike Giannis Freak 7', brand: 'Nike', retail: 999, current: 680, hype: 0, year: 2025,
    tech: '前掌 Zoom Air + React 泡棉', weight: '约 400g (US10)', r: [4,4,4,4],
    positions: ['前锋','全能'], footType: '飞天流锋线',
    features: ['字母哥七代签名鞋', 'Ignition/Live Wire 配色', '7 月发售性价比飞人首选', '轻量灵活缓震够用'],
    oneLiner: '字母哥七代，性价比飞天流' },

  { key: 'freak6', name: 'Nike Giannis Freak 6', brand: 'Nike', retail: 899, current: 520, hype: 0, year: 2024,
    tech: '前掌 Zoom Air + React', weight: '约 405g (US10)', r: [4,4,4,4],
    positions: ['前锋'], footType: '飞天流锋线',
    features: ['前掌 Zoom Air + React', '轻量灵活缓震够用', '价格已跌至 500 档', '学生党锋线首选'],
    oneLiner: '字母哥六代，500 档飞人鞋' },

  { key: 'kobe3protro', name: 'Nike Kobe 3 Protro', brand: 'Nike', retail: 1499, current: 1780, hype: 3, year: 2025,
    tech: '前掌 Zoom + 后跟 Zoom Air', weight: '约 380g (US10)', r: [5,5,5,5],
    positions: ['后卫','全能'], footType: '科比粉丝/全能得分手',
    features: ['2025 年 8 月最新复刻', 'Halo 全白配色', '高帮设计支撑出色', '前掌+后跟双 Zoom'],
    oneLiner: '科比 3 Protro，2025 最新复刻' },

  { key: 'stflare', name: 'Nike S.T. Flare', brand: 'Nike', retail: 699, current: 450, hype: 0, year: 2025,
    tech: 'React 泡棉 + 耐磨外底', weight: '约 410g (US10)', r: [3,5,4,4],
    positions: ['后卫','全能'], footType: '室外实战/学生党',
    features: ['专为室外球场设计', '耐磨外底橡胶', 'Light Wild Mango/Dark Smoke Grey 配色', '9 月发售入门款'],
    oneLiner: '室外实战利器，耐磨抗造' },

  /* ===== Jordan 2025-2026 ===== */
  { key: 'aj40', name: 'Air Jordan 40', brand: 'Jordan', retail: 1499, current: 1280, hype: 2, year: 2025,
    tech: '全掌 Zoom + 前掌 Zoom Air', weight: '约 430g (US10)', r: [5,5,5,5],
    positions: ['全能'], footType: 'AJ 正代收藏家/全能球员',
    features: ['AJ 正代 40 周年纪念', '2025 年 7 月发售', 'Light Arctic Pink 等配色', '缓震与材质全面升级评测 8.8'],
    oneLiner: 'AJ 四十代，正代 40 周年' },

  { key: 'aj39', name: 'Air Jordan 39', brand: 'Jordan', retail: 1399, current: 850, hype: 1, year: 2024,
    tech: '全掌 Zoom + 前掌 Zoom + Flight Plate', weight: '约 425g (US10)', r: [5,4,5,4],
    positions: ['全能'], footType: 'AJ 正代/全能球员',
    features: ['AJ 正代第 39 代', 'Flight Plate 科技', '全掌+前掌双 Zoom', '价格已跳水真香'],
    oneLiner: 'AJ 三十九代，正代经典延续' },

  { key: 'tatum4', name: 'Jordan Tatum 4', brand: 'Jordan', retail: 999, current: 780, hype: 1, year: 2025,
    tech: 'Formula 23 泡棉 + IsoMotion 鞋面', weight: '约 395g (US10)', r: [4,5,5,4],
    positions: ['前锋','全能'], footType: '飞天流锋线',
    features: ['塔图姆四代最新签名鞋', '2025 冬季核心鞋款', 'Premium PF 迷人红配色', '缓震与支撑全面升级'],
    oneLiner: '塔图姆四代，2025 冬季新作' },

  { key: 'luka77', name: 'Jordan Luka .77', brand: 'Jordan', retail: 699, current: 450, hype: 0, year: 2025,
    tech: '前掌 Zoom Air + 泡棉中底', weight: '约 390g (US10)', r: [3,5,4,4],
    positions: ['后卫'], footType: '室外实战后卫',
    features: ['东契奇首款支线鞋', '专为室外球场设计', '耐磨外底性能出色', '4 月发售学生党入门'],
    oneLiner: '东契奇支线，室外实战入门' },

  /* ===== Adidas 2025-2026 ===== */
  { key: 'harden9', name: 'Adidas Harden Vol. 9', brand: 'Adidas', retail: 1099, current: 820, hype: 1, year: 2025,
    tech: '全掌 Boost + Lightstrike', weight: '约 425g (US10)', r: [5,4,5,4],
    positions: ['后卫','全能'], footType: '后撤步爱好者/节奏单打手',
    features: ['哈登九代最新签名鞋', 'Flamingo Pink 等 2025 配色', '9 月发售后撤步神器', 'Boost 脚感软弹顶级'],
    oneLiner: '哈登九代，后撤步再升级' },

  { key: 'damex', name: 'Adidas Dame X', brand: 'Adidas', retail: 699, current: 420, hype: 0, year: 2025,
    tech: 'Lightstrike + Bounce', weight: '约 385g (US10)', r: [4,4,4,4],
    positions: ['后卫'], footType: '预算后卫/学生党',
    features: ['利拉德十代签名鞋', '6 月发售性价比突出', '预算 400 档后卫首选', '轻量灵活均衡实战'],
    oneLiner: '利拉德十代，400 档后卫首选' },

  { key: 'ae2', name: 'Adidas AE 2', brand: 'Adidas', retail: 1099, current: 820, hype: 2, year: 2025,
    tech: 'Lightstrike + 前掌 LightBoost', weight: '约 400g (US10)', r: [5,5,5,4],
    positions: ['后卫','全能'], footType: '爆发力型后卫/飞天流',
    features: ['爱德华兹二代签名鞋', '轻量 TPU 支撑框架', '10 月发售爆发型球员定制', 'LightBoost 前掌更弹'],
    oneLiner: '爱德华兹二代，爆发力再升级' },

  { key: 'donissue7', name: 'Adidas D.O.N. Issue 7', brand: 'Adidas', retail: 799, current: 480, hype: 0, year: 2025,
    tech: 'Lightstrike 缓震', weight: '约 390g (US10)', r: [4,4,4,4],
    positions: ['前锋','全能'], footType: '弹跳型锋线',
    features: ['米切尔七代签名鞋', 'Spider Web 蛛网鞋面', '性价比锋线首选', '轻量灵活缓震够用'],
    oneLiner: '米切尔七代，性价比锋线' },

  /* ===== UA 2025 ===== */
  { key: 'curry13', name: 'UA Curry 13', brand: 'Under Armour', retail: 1099, current: 820, hype: 1, year: 2025,
    tech: 'UA Flow 全掌一体发泡 + 前足支撑片', weight: '约 350g (US10)', r: [4,5,5,5],
    positions: ['后卫'], footType: '投射型控卫/库里粉丝',
    features: ['库里十三代最新签名鞋', 'Flow 全掌缓震升级', '前足支撑片改良', '适配更宽受众'],
    oneLiner: '库里十三代，Flow 再进化' },

  /* ===== Puma 2025 ===== */
  { key: 'allpronitro2', name: 'Puma All-Pro Nitro 2', brand: 'Puma', retail: 899, current: 580, hype: 0, year: 2025,
    tech: 'Nitro 缓震泡棉', weight: '约 395g (US10)', r: [5,5,4,4],
    positions: ['全能'], footType: '全能球员/均衡型',
    features: ['Nitro 缓震泡棉', '出色抓地力评测 8.4', '7 月发售均衡实战', '性价比全能首选'],
    oneLiner: 'All-Pro Nitro 2，均衡全能之选' },

  { key: 'hali1', name: 'Puma HALI 1', brand: 'Puma', retail: 899, current: 620, hype: 1, year: 2025,
    tech: 'Nitro 泡棉缓震', weight: '约 385g (US10)', r: [4,5,4,5],
    positions: ['后卫'], footType: '速度型控卫',
    features: ['哈利伯顿首款签名鞋', '9 月电光蓝配色发售', '速度型控卫专属', '轻量灵活变向顺滑'],
    oneLiner: '哈利伯顿一代，速度控卫专属' },

  /* ===== New Balance 2025 ===== */
  { key: 'twowxyv5', name: 'New Balance TWO WXY V5', brand: 'New Balance', retail: 899, current: 580, hype: 0, year: 2025,
    tech: 'FuelCell 缓震泡棉 + 稳定支撑鞋面', weight: '约 410g (US10)', r: [4,5,4,4],
    positions: ['全能'], footType: '全能球员/均衡型',
    features: ['FuelCell 缓震泡棉', '稳定支撑鞋面', 'TWO WXY 系列最新代', '2025 全能均衡首选'],
    oneLiner: 'TWO WXY V5，全能均衡新选' },

  { key: 'freshfoambbv3', name: 'New Balance Fresh Foam BB V3', brand: 'New Balance', retail: 899, current: 580, hype: 0, year: 2025,
    tech: 'Fresh Foam 全掌缓震', weight: '约 440g (US10)', r: [5,4,5,4],
    positions: ['中锋','前锋'], footType: '大体重球员/缓震优先',
    features: ['Fresh Foam 最大缓震保护', '6 月发售大体重福音', '评测 8.8 高分', '内线大体重球员首选'],
    oneLiner: 'Fresh Foam BB V3，大体重缓震王' },

  /* ===== 李宁 2025 ===== */
  { key: 'wow12', name: '李宁 韦德之道 12', brand: '李宁', retail: 1599, current: 1280, hype: 2, year: 2025,
    tech: 'Super Boom 超临界 ETPU + 碳板', weight: '约 381g (US10)', r: [5,5,5,5],
    positions: ['全能'], footType: '全能球员/韦德粉丝',
    features: ['Super Boom 超临界 ETPU 泡绵', '碳板支撑仅 381g 超轻', '2025 年度最佳候选评测 8.9', '缓震支撑全面拉满'],
    oneLiner: '韦德之道 12，2025 年度最佳候选' },

  { key: 'wow8085ultra', name: '李宁 Wade 808 5 Ultra', brand: '李宁', retail: 1099, current: 780, hype: 1, year: 2025,
    tech: 'Boom 缓震泡棉', weight: '约 390g (US10)', r: [5,5,4,4],
    positions: ['后卫','全能'], footType: '速度型后卫/爆发型',
    features: ['Boom 缓震弹力十足', '808 系列五代最新', '3 月发售速度型球员首选', '评测 8.9 高分'],
    oneLiner: '808 5 Ultra，速度后卫弹力王' },

  { key: 'wowedlo1', name: '李宁 Wade DLo 1', brand: '李宁', retail: 899, current: 620, hype: 1, year: 2025,
    tech: 'Boom + Light Foam', weight: '约 385g (US10)', r: [4,5,4,4],
    positions: ['后卫'], footType: '灵活后卫',
    features: ['拉塞尔首款签名鞋', '出色抓地力', '6 月发售舒适缓震', '变向灵活的后卫利器'],
    oneLiner: 'DLo 1，拉塞尔首款签名鞋' },

  { key: 'ys17', name: '李宁 驭帅 17', brand: '李宁', retail: 999, current: 620, hype: 0, year: 2025,
    tech: '全掌 䨻 + 碳板', weight: '约 430g (US10)', r: [5,4,5,4],
    positions: ['前锋','全能'], footType: '全能锋线',
    features: ['全掌 䨻 + 碳板', '驭帅系列十七代', '支撑与缓震升级', '锋线全能实战'],
    oneLiner: '驭帅 17，锋线全能旗舰' },

  /* ===== 安踏 2025 ===== */
  { key: 'kai2', name: '安踏 KAI 2', brand: '安踏', retail: 999, current: 720, hype: 1, year: 2025,
    tech: '氮科技 + 前掌 Zoom', weight: '约 395g (US10)', r: [4,5,4,5],
    positions: ['后卫','全能'], footType: '灵活后卫/欧文粉丝',
    features: ['欧文二代签名鞋', '氮科技缓震+前掌 Zoom', '3 月发售均衡实战评测 8.5', '变向型后卫首选'],
    oneLiner: '欧文二代，变向后卫首选' },

  { key: 'kt11', name: '安踏 KT 11', brand: '安踏', retail: 799, current: 489, hype: 0, year: 2025,
    tech: '氮科技缓震', weight: '约 410g (US10)', r: [4,4,5,4],
    positions: ['后卫','全能'], footType: '射手型后卫',
    features: ['汤普森十一代签名鞋', '氮科技缓震', '端午等配色', '500 档射手后卫首选'],
    oneLiner: 'KT 11，射手后卫经典延续' },

  { key: 'gh4', name: '安踏 GH 4', brand: '安踏', retail: 699, current: 420, hype: 0, year: 2025,
    tech: '氮科技缓震', weight: '约 415g (US10)', r: [4,4,4,4],
    positions: ['前锋'], footType: '全能锋线',
    features: ['海沃德四代签名鞋', '氮科技缓震', '均衡锋线实战', '500 档锋线首选'],
    oneLiner: 'GH 4，500 档锋线首选' },

  { key: 'skyline3', name: '安踏 Sky Line 3', brand: '安踏', retail: 599, current: 350, hype: 0, year: 2025,
    tech: '全掌 A-SHOCK PRO / PRO 版前掌氮 90', weight: '约 420g (US10)', r: [4,4,4,4],
    positions: ['前锋','全能'], footType: '弹跳型锋线',
    features: ['全掌 A-SHOCK PRO 缓震', 'PRO 版前掌氮 90 科技', '9 月发售弹跳助力', '场地反馈出色'],
    oneLiner: '天际 3，弹跳型锋利利器' },

  { key: 'kuangchao5', name: '安踏 狂潮 5', brand: '安踏', retail: 599, current: 350, hype: 0, year: 2025,
    tech: '氮科技缓震 + 耐磨外底', weight: '约 420g (US10)', r: [3,5,4,4],
    positions: ['后卫','全能'], footType: '室外实战/耐磨',
    features: ['耐磨外底橡胶', '氮科技缓震', '狂潮系列五代', '室外实战性价比首选'],
    oneLiner: '狂潮 5，室外实战耐磨王' },

  /* ===== 361° 2025 ===== */
  { key: 'zen7', name: '361° Zen 7', brand: '361°', retail: 599, current: 350, hype: 0, year: 2025,
    tech: 'QU!KFOAM 缓震', weight: '约 400g (US10)', r: [4,5,4,4],
    positions: ['后卫','全能'], footType: '预算后卫/性价比',
    features: ['粘性抓地力', '低轮廓缓震响应', '7 月发售预算首选评测 8.6', '性价比隐藏王'],
    oneLiner: '禅 7，预算后卫的隐藏王' },

  { key: 'ag5', name: '361° AG 5', brand: '361°', retail: 799, current: 520, hype: 0, year: 2025,
    tech: 'QU!KFOAM + 碳板', weight: '约 425g (US10)', r: [5,5,5,4],
    positions: ['全能'], footType: '全能球员/性价比',
    features: ['QU!KFOAM + 碳板', '科技堆料性价比之王评测 8.5', '最超值全能实战鞋', '配置远超同价位'],
    oneLiner: 'AG 5，性价比全能科技堆料王' },

  /* ===== 匹克 2024-2025 ===== */
  { key: 'djs2024', name: '匹克 大三角 2024', brand: '匹克', retail: 599, current: 320, hype: 0, year: 2024,
    tech: '自适应科技中底', weight: '约 420g (US10)', r: [4,5,4,4],
    positions: ['前锋','全能'], footType: '全能锋线/性价比',
    features: ['轻量化设计', '自适应科技中底', '大三角 2024 版', '300 档锋线性价比'],
    oneLiner: '大三角 2024，300 档锋线性价比' },

  { key: 'sx5', name: '匹克 闪现 5', brand: '匹克', retail: 599, current: 320, hype: 0, year: 2025,
    tech: 'P-POPUP 科技中底', weight: '约 400g (US10)', r: [4,5,4,4],
    positions: ['后卫'], footType: '速度型后卫',
    features: ['P-POPUP 科技中底', '闪现系列五代', '轻量灵活变向顺滑', '300 档后卫入门'],
    oneLiner: '闪现 5，300 档后卫入门' },

  { key: 'sx4', name: '匹克 闪现 4', brand: '匹克', retail: 499, current: 250, hype: 0, year: 2024,
    tech: 'P-POPUP 科技中底', weight: '约 410g (US10)', r: [3,5,3,4],
    positions: ['后卫'], footType: '预算后卫',
    features: ['P-POPUP 科技中底', '轻量透气', '闪现四代', '250 档入门后卫'],
    oneLiner: '闪现 4，250 档入门后卫' },

  /* ===== Converse 2025 ===== */
  { key: 'shai001', name: 'Converse Shai 001', brand: 'Converse', retail: 899, current: 580, hype: 1, year: 2025,
    tech: '前掌 Zoom Air 气垫', weight: '约 390g (US10)', r: [3,5,5,4],
    positions: ['后卫','全能'], footType: '速度型后卫/SGA 粉丝',
    features: ['亚历山大首款签名鞋', '前掌 Zoom Air 气垫', '7 月发售实战+潮流双修评测 8.1', '速度型球员首选'],
    oneLiner: 'SGA 首款签名鞋，速度后卫新星' },
]
