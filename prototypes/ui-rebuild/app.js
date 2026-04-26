const workbenchDocs = {
  baseline: {
    chip: '需求基线.md',
    title: '需求基线.md',
    subtitle: '围绕当前文档工作，不再用巨大的介绍区占掉编辑面积。',
    summary: '当前是需求层基线文档，用来定义目标、边界和成功标准。',
    editor: [
      { type: 'title', text: '# 需求基线' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'medium' },
      { type: 'line', width: 'short' },
      { type: 'callout', title: '当前目标', text: '重构 UI 的信息架构，先保证原型对齐，再回写到产品。' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'medium' }
    ]
  },
  scope: {
    chip: '功能范围.md',
    title: '功能范围.md',
    subtitle: '把本轮要做和不做的 UI 重构范围明确下来，避免再次跑偏。',
    summary: '当前整理的是功能边界、页面边界和需要推迟的事项。',
    editor: [
      { type: 'title', text: '# 功能范围' },
      { type: 'callout', title: '本轮只做', text: '欢迎页、主工作台、编排页、节点配置、角色创建弹层。' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'medium' },
      { type: 'callout', title: '暂不进入', text: '设置页细化、真实运行调试面板、安装器级壳层优化。' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'short' }
    ]
  },
  plan: {
    chip: '实施计划.md',
    title: '实施计划.md',
    subtitle: '先做网页原型，再回写运行时，实现和设计在同一份基线之上推进。',
    summary: '当前阶段先验证页面逻辑、可点击路径和信息密度。',
    editor: [
      { type: 'title', text: '# 实施计划' },
      { type: 'callout', title: '阶段一', text: '网页原型：欢迎页 / 主工作台 / 编排页 / 节点配置。' },
      { type: 'callout', title: '阶段二', text: '评审通过后回写 Electron，并跑页面级回归。' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'medium' },
      { type: 'line', width: 'short' }
    ]
  },
  review: {
    chip: 'review.md',
    title: 'review.md',
    subtitle: '把不合理的布局、点击路径和信息重复明确标出来。',
    summary: '这是当前 UI 审查记录，包含结构问题和修正优先级。',
    editor: [
      { type: 'title', text: '# UI Review' },
      { type: 'callout', title: '关键问题', text: '主工作台像换皮，AI 侧栏像独立页面，编排节点配置不支持真实约束配置。' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'medium' }
    ]
  },
  mapping: {
    chip: 'export-map.md',
    title: 'export-map.md',
    subtitle: '输出映射不应藏在深层逻辑中，而要能从编排配置中直接理解。',
    summary: '当前文档描述输出目录、文件类型和导出 manifest 的关系。',
    editor: [
      { type: 'title', text: '# Export Mapping' },
      { type: 'callout', title: '核心要求', text: '输出目录、文件结构、manifest 字段和命名约束都来自 Flow，不允许硬编码。' },
      { type: 'line', width: 'long' },
      { type: 'line', width: 'medium' },
      { type: 'line', width: 'short' }
    ]
  }
};

const workbenchSessions = {
  requirements: {
    chip: '需求主会话',
    title: '需求主会话',
    subtitle: '围绕 01-需求基线.md 自动切换上下文，而不是跳去单独会话页。',
    stage: '需求',
    messages: [
      { role: 'user', text: '先把 UI 方向收回到网页原型阶段，不再直接改产品。' },
      { role: 'ai', text: '收到。先收敛主工作台与编排页的层级、点击路径和输入输出配置方式。' }
    ]
  },
  requirementsScope: {
    chip: '功能范围会话',
    title: '功能范围会话',
    subtitle: '围绕功能范围.md 的取舍、边界和阶段拆分继续推进。',
    stage: '需求',
    messages: [
      { role: 'user', text: '功能范围这页要不要继续保留阶段二和阶段三？' },
      { role: 'ai', text: '建议先固定阶段一要交付的页面，再把阶段二放进后续回写计划，避免主工作台继续混杂。' }
    ]
  },
  review: {
    chip: '审查会话',
    title: '审查会话',
    subtitle: '聚焦当前页面结构问题、反模式和需要移除的噪音。',
    stage: '审查',
    messages: [
      { role: 'user', text: '现在的界面为什么看起来还是旧布局？' },
      { role: 'ai', text: '因为主工作台没有从信息架构层重做，只是换了皮肤与局部排版。' }
    ]
  },
  delivery: {
    chip: '交付会话',
    title: '交付会话',
    subtitle: '围绕原型定稿、实现顺序和交付物清单推进。',
    stage: '交付',
    messages: [
      { role: 'user', text: '原型通过后下一步怎么落地？' },
      { role: 'ai', text: '先回写主工作台和编排页，再补节点配置与角色创建路径，最后打包验证。' }
    ]
  }
};

const workbenchPaneModes = {
  files: {
    chip: '文件树',
    query: 'docs/',
    sections: [
      {
        title: 'docs / 6',
        items: [
          { doc: 'baseline', title: '01-需求基线.md' },
          { doc: 'scope', title: '02-功能范围.md' },
          { doc: 'plan', title: '03-实施计划.md' },
          { doc: 'review', title: 'review.md' }
        ]
      },
      {
        title: 'assets / 2',
        items: [
          { doc: 'mapping', title: 'export-map.md' },
          { title: 'schema.json' }
        ]
      },
      {
        title: 'images / 1',
        items: [
          { title: 'ui-note.png' }
        ]
      }
    ]
  },
  recent: {
    chip: '最近',
    query: '最近打开 / 最近改动',
    items: [
      { doc: 'baseline', title: '01-需求基线.md', meta: '2 分钟前 · 当前主文档', note: '最近写入：页面层级与入口规则' },
      { doc: 'review', title: 'review.md', meta: '18 分钟前 · 审查记录', note: '最近写入：工作台像换皮而不是重做' },
      { doc: 'plan', title: '03-实施计划.md', meta: '26 分钟前 · 实施计划', note: '最近写入：先补原型整套页面，再回写运行时' }
    ]
  },
  search: {
    chip: '搜索',
    query: 'UI / 规则 / 输出 / 思路',
    items: [
      { doc: 'baseline', title: '需求基线：主入口与系统页边界', meta: '01-需求基线.md · 第 12 行', note: '命中：欢迎页、主工作台、思路地图、资源中心、规则中心、设置、编排页' },
      { doc: 'plan', title: '实施计划：网页原型先行', meta: '03-实施计划.md · 第 4 行', note: '命中：原型通过后再回写 Electron 运行时' },
      { doc: 'mapping', title: '输出映射：不要把目录契约写死', meta: 'export-map.md · 第 7 行', note: '命中：输出目录、manifest 字段和命名约束来自 Flow' }
    ]
  }
};

const thinkingNodes = {
  core: {
    title: '先把网页原型补成整套设计基线',
    summary: '停止在运行时里边改边猜，先统一可点击页面与关键入口。',
    detailText: '这条核心命题规定了当前 UI 调整的实施顺序：先把网页原型补成完整产品基线，再按原型复刻真实运行时页面。原型阶段负责统一页面层级、入口位置、跨页回跳和信息结构，避免继续在运行时里边改边猜。',
    type: '核心命题',
    stage: '需求',
    status: '已采用',
    source: '需求主会话',
    thoughtText: '思路是先把分歧收束到可见页面骨架上，再进入真实 UI 复刻。只要原型已经覆盖所有主路径，后续运行时实现就能围绕同一套结构落地，而不是继续叠加历史例外。',
    reasonTitle: '为什么先做原型',
    reasonText: '当前运行时和原型层级已经分叉，先统一原型，后续复刻才有稳定基线。',
    evidence: [
      { title: '01-需求基线.md', text: '当前主文档，描述页面范围与交付边界。', context: '需求基线限定了这次原型补齐的对象不是单一页面，而是整套可点击主路径和关键入口，因此需要先在原型上完成页面边界与入口层级的统一。', screenTarget: 'workbench' },
      { title: '主工作台', text: '回到文档工作面，查看当前文档与 AI 会话。', context: '主工作台是运行时里最核心的编辑器式对象页，只有它和其他页面共享同一套壳层，后续复刻真实 UI 才不会出现导航断裂和入口漂移。', screenTarget: 'workbench' },
      { title: '规则与知识网络', text: '查看规则命中、知识路径和提升入口。', context: '规则与知识网络证明这次补齐不是只改首屏，而是要把深层支撑页和跨页回跳路径也一起纳入统一设计基线。', screenTarget: 'rules-center', rulesViewTarget: 'graph', rulesScopeTarget: 'project' }
    ]
  },
  'premise-project': {
    title: '欢迎页 / 主工作台只是起点',
    summary: '其他用户可触达页面也需要补齐，否则设计基线仍然不完整。',
    detailText: '这条前提把设计范围从“只补欢迎页和主工作台”扩大到“所有用户可触达页面一起对齐”。欢迎页和主工作台只是入口，资源中心、规则与沉淀中心、设置页、思路地图和编排页都必须回到同一套页面骨架、导航顺序和信息层级里。',
    type: '前提',
    stage: '需求',
    status: '已采用',
    source: '需求主会话',
    thoughtText: '思路不是给零散页面单独补入口，而是先建立一套系统壳层语言，再让所有页面按这套语言落位。这样后面新增入口、新增页面或新增状态，不会再次制造“只在某页例外”的 UI 漂移。',
    reasonTitle: '为什么扩大范围',
    reasonText: '如果只补两个页面，资源中心、规则中心、设置、思路地图与编排页仍会和新基线断裂。',
    evidence: [
      { title: '资源中心', text: '模板 / Skill 入口仍然会影响欢迎页与编排页路径。', kicker: '页面证据', context: '资源中心不是独立装饰页，而是模板、外部 Skill 与未来扩展资源进入系统的统一入口。如果这页仍停留在旧结构，欢迎页里的模板入口、资源中心按钮和编排页的承接关系会立刻失配。', screenTarget: 'resource-center' },
      { title: '规则与沉淀中心', text: '命中栈和知识路径是工作台、思路地图与编排页的共同回跳入口。', kicker: '深层回跳证据', context: '规则与沉淀中心承担规则命中、个人沉淀和知识网络的承接职责，是多个页面共享的深层支撑页。如果这页不一起收敛，主工作台、思路地图和编排页新增的规则入口会在深层路径上直接断开。', screenTarget: 'rules-center', rulesViewTarget: 'rules', rulesScopeTarget: 'project' }
    ]
  },
  'premise-rule': {
    title: '保持编辑器式壳层，不退回展示页',
    summary: '主对象始终是文档、画布或关系图，而不是说明卡片。',
    detailText: '这条约束限定了所有页面的构图方式：欢迎页负责进入，工作台负责编辑文档，思路地图负责展示关系，编排页负责操作流程，资源中心和规则中心负责支撑对象。任何说明块都只能退到次级层，不能重新占据主对象区域。',
    type: '约束',
    stage: '需求',
    status: '已采用',
    source: '审查会话',
    thoughtText: '思路是统一“对象优先”的编辑器视觉纪律。用户进入任何页面，第一眼看到的都应该是当前对象和下一步动作，而不是解释产品是什么。',
    reasonTitle: '视觉纪律',
    reasonText: '所有页面都要优先服务当前对象，解释性内容只能退到次级层或抽屉。',
    evidence: [
      { title: '主工作台', text: '文档面必须压过 AI 和状态块。', screenTarget: 'workbench' },
      { title: '编排页', text: '画布是主对象，节点配置与菜单不能抢占首屏。', screenTarget: 'orchestration' }
    ]
  },
  'adopt-workbench': {
    title: '补左栏模式、文档更多动作、AI 上下文入口',
    summary: '把新增能力收回到编辑器级层级，不破坏主体文档面。',
    detailText: '工作台页采用“左栏模式切换 + 中央文档对象 + 右侧 AI 上下文 + 细会话轨”的编辑器壳层。新增能力不再靠新增大片说明区承接，而是分别落入左栏模式、文档更多动作和 AI 上下文入口。',
    type: '采用方案',
    stage: '规划',
    status: '进行中',
    source: '功能范围会话',
    thoughtText: '这里的思路是把功能分回对象层级：文件、最近、搜索属于左栏模式；文档保护、工件链接和检查属于文档对象动作；AI 继续推进属于右侧上下文区，而不是平铺新卡片。',
    reasonTitle: '为什么这样摆',
    reasonText: '文件、最近、搜索属于工作台左栏模式；文档保护、工件插入、外部变更检查属于文档对象的更多动作。',
    evidence: [
      { title: '主工作台', text: '查看左栏模式、AI 上下文和文档更多动作。', screenTarget: 'workbench' },
      { title: '文档更多动作', text: '从同一对象发起文档保护、工件链接和外部变更检查。', openDrawer: 'document-actions-drawer' }
    ]
  },
  'adopt-thinking': {
    title: '新增思路地图页承接思路关系与文档落点',
    summary: '只负责展示与回跳，不直接编辑思路内容。',
    detailText: '思路地图页承担的是结构展示与证据回跳，而不是直接修改文档或会话。它把核心命题、前提、采用方案、探索分支和文档落点组织成可读关系图，并且允许用户从节点回到主工作台、规则中心或具体文档。',
    type: '采用方案',
    stage: '规划',
    status: '进行中',
    source: '功能范围会话',
    thoughtText: '思路地图的存在，是为了把分散在会话和文档里的结构化判断抽出来统一查看。它是系统级结构页，不是聊天侧栏的放大版，也不是另一种文档页。',
    reasonTitle: '系统页边界',
    reasonText: '思路地图是系统级展示页，负责把思路结构、探索分支和文档落点连起来，而不是变成聊天页或文档页。',
    evidence: [
      { title: '思路地图', text: '查看层级结构、隐藏已废弃和证据回跳。', screenTarget: 'thinking-chain' },
      { title: '主工作台', text: '从文档与会话回跳到思路地图。', screenTarget: 'workbench' }
    ]
  },
  'explore-search': {
    title: '把搜索做成工作台左栏模式',
    summary: '不再额外制造独立 pseudo-page。',
    detailText: '搜索结果仍然服务当前工程和当前文档对象，所以它应该落在工作台左栏模式里，而不是升级成新的平级页面。这样用户可以在同一工作面里完成搜索、定位、切换文档和继续编辑。',
    type: '探索分支',
    stage: '规划',
    status: '保留探索',
    source: '审查会话',
    thoughtText: '这条分支保留为探索，是因为搜索确实有独立信息密度，但它仍然依赖当前工程上下文和文件树对象，拆成页面会让壳层层级变乱。',
    reasonTitle: '为什么不独立成页',
    reasonText: '搜索结果最终仍然服务当前文档对象，放在工作台左栏比拉出平级页面更稳定。',
    evidence: [
      { title: '工作台搜索', text: '查看左栏搜索模式和命中结果。', screenTarget: 'workbench' }
    ]
  },
  'rejected-hero': {
    title: '继续用解释型 hero 覆盖首屏',
    summary: '会把高频动作推到折线以下，已经否决。',
    detailText: '这个废弃分支代表一种被明确排除的方向：继续让大段说明性 hero 侵占首屏，把继续项目、开始编排、最近草稿和模板入口压到更下面的位置。它会让编辑器式产品重新变成展示型页面。',
    type: '已废弃分支',
    stage: '审查',
    status: '已否决',
    source: '审查会话',
    thoughtText: '保留这个废弃分支，是为了说明哪些方案已经被系统性否决。它提醒后续设计不要再用解释块替代对象入口，也不要回到“先介绍产品再让用户开始”的展示页思路。',
    reasonTitle: '为什么否决',
    reasonText: '解释型 hero 会压掉继续项目、开始编排和最近草稿等高频入口，不符合编辑器首屏纪律。',
    evidence: [
      { title: '欢迎页', text: '首屏只保留高频入口与直接可点击列表。', screenTarget: 'welcome' }
    ]
  },
  'doc-plan': {
    title: '03-实施计划.md',
    summary: '记录“原型先行，再回写真实 UI”的实施顺序。',
    detailText: '这份文档是当前采用方案落地后的正式文档落点，用来明确原型补齐、结构确认、再回写真实 UI 的顺序。它把决策从会话转成可持续维护的实施基线。',
    type: '文档落点',
    stage: '规划',
    status: '已落地',
    source: '实施计划',
    thoughtText: '思路是把结构性决定沉淀成文档，不让它只停留在会话里。只要后续还有页面要补、还有运行时要复刻，这份计划文档就是串起动作顺序的稳定锚点。',
    reasonTitle: '文档为什么挂在这里',
    reasonText: '这份文档来自“先补整套原型，再回写运行时”的采用方案，而不是从核心命题直接跳出。',
    evidence: [
      { title: '03-实施计划.md', text: '回到工作台并打开计划文档。', screenTarget: 'workbench' }
    ]
  },
  'doc-review': {
    title: 'review.md',
    summary: '沉淀信息架构缺口、反模式和需要回写的页面。',
    detailText: '这份审查文档用于记录结构缺口、被否决的做法、页面间不一致点，以及需要回写到原型和真实 UI 的项目。它不是普通页面说明，而是设计基线收敛过程的审查证据。',
    type: '文档落点',
    stage: '审查',
    status: '已落地',
    source: '审查记录',
    thoughtText: '思路是把“看起来哪里不对”转成可追踪的审查条目和反模式清单。只有这些问题被明确写下来，后续原型和真实 UI 才能按同一套问题清单收敛。',
    reasonTitle: '文档为什么挂在这里',
    reasonText: '这份文档源于对结构问题的整理与否决，不是普通页面说明卡。',
    evidence: [
      { title: 'review.md', text: '回到工作台并打开审查文档。', screenTarget: 'workbench' }
    ]
  }
};

const settingsViews = {
  provider: {
    kicker: '当前菜单',
    title: 'Provider Profiles',
    summary: '管理多个 Provider Profile。每个 Provider 作为独立卡片纵向排列，右侧只编辑当前选中配置。',
    secondary: { label: '模型诊断', type: 'drawer', target: 'settings-diagnostics-drawer' },
    primaryLabel: '新增配置',
    cards: [
      { label: '配置名称', title: 'Ollama · qwen3', text: '本地模型，适合结构化文档与审查任务。' },
      { label: 'Provider', title: 'Ollama', text: 'Base URL: http://127.0.0.1:11434' },
      { label: '默认模型', title: 'qwen3:8b', text: '命中能力：chat / review / structured output' },
      { label: '状态', title: '连接正常', text: '最近测试：120ms / 响应成功' }
    ],
    fields: [
      { label: 'Base URL', value: 'http://127.0.0.1:11434' },
      { label: 'Model', value: 'qwen3:8b' },
      { label: 'API Key', value: '••••••••••••••••' },
      { label: '能力标签', value: '长上下文 / 审查 / 中文优先' }
    ],
    formActions: {
      first: { label: '测试连接', type: 'drawer', target: 'settings-diagnostics-drawer' },
      second: { label: '删除配置', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存更改'
    },
    footnotes: [
      { label: '快捷键提示', title: 'Windows: Ctrl+K / macOS: Cmd+K', text: '设置页要明确展示平台差异，避免把快捷键文案写死。' },
      { label: '高级入口', title: '日志 / 诊断 / 安全与证据', text: '这些内容进入高级菜单，不与 Provider 配置争抢主区域。' }
    ]
  },
  editor: {
    kicker: '当前菜单',
    title: '编辑器',
    summary: '控制阅读、编辑、源码、分屏、标签页和文档工作面的密度。',
    secondary: { label: '查看帮助', type: 'drawer', target: 'settings-help-drawer' },
    primaryLabel: '保存编辑器设置',
    cards: [
      { label: '默认视图', title: '编辑', text: '阅读 / 编辑 / 源码必须在同一份文档上保持一致。' },
      { label: '分屏策略', title: '允许双栏与多标签', text: '文档工作面必须更像编辑器，不像介绍页。' },
      { label: '文档字体', title: 'Noto Sans SC', text: '界面与正文统一走克制、清晰、易辨认的无衬线方向。' },
      { label: '辅助显示', title: '引用 / 反链 / 待办', text: '低频信息进入底部托盘或右侧区，不盖住主文档。' }
    ],
    fields: [
      { label: '默认模式', value: '编辑' },
      { label: '标签栏策略', value: '多标签 / 可关闭 / 可恢复' },
      { label: '分屏上限', value: '2 栏' },
      { label: 'Markdown 辅助', value: 'Mermaid / Mindmap / 图片粘贴' }
    ],
    formActions: {
      first: { label: '查看日志', type: 'drawer', target: 'settings-help-drawer' },
      second: { label: '恢复默认', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存编辑器设置'
    },
    footnotes: [
      { label: '编辑器原则', title: '当前文档必须是第一视觉', text: '标题、工具条和右侧 AI 不能抢过正文工作面。' },
      { label: '一致性', title: '图标优先，文字补充', text: '高频工具优先走图标，小标按钮尽量不再使用汉字长条。' }
    ]
  },
  appearance: {
    kicker: '当前菜单',
    title: '外观与布局',
    summary: '控制主题、色板、三栏宽度、紧凑密度和界面视觉权重。',
    secondary: { label: '布局诊断', type: 'drawer', target: 'settings-diagnostics-drawer' },
    primaryLabel: '保存外观设置',
    cards: [
      { label: '主题', title: '浅色专业版', text: '颜色保持克制，避免暖米色和高饱和强调色。' },
      { label: '强调色', title: '低饱和钢蓝', text: '动作色统一，不再混入绿、紫、琥珀等多强调。' },
      { label: '宽度记忆', title: '三栏独立记忆', text: '工作台与编排页都必须记住用户调整后的栏宽。' },
      { label: '密度', title: '标准 / 高密度', text: '不同密度必须仍然保持点击可达和层级稳定。' }
    ],
    fields: [
      { label: '主题模式', value: 'Light' },
      { label: '强调色', value: 'Steel Blue' },
      { label: '默认密度', value: 'Standard' },
      { label: '圆角策略', value: '小圆角 / 薄边线 / 低阴影' }
    ],
    formActions: {
      first: { label: '预览主题', type: 'drawer', target: 'settings-help-drawer' },
      second: { label: '恢复默认', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存外观设置'
    },
    footnotes: [
      { label: '眯眼测试', title: '画布和文档必须先被看到', text: '右侧 AI、顶栏按钮和状态块不应压过工作主对象。' },
      { label: '布局纪律', title: '靠对齐和留白做层级', text: '少用卡片堆叠，优先使用线性分区和轻描边。' }
    ]
  },
  shortcut: {
    kicker: '当前菜单',
    title: '快捷键',
    summary: '集中展示工作台、资源中心、编排页和命令面板的高频快捷键。',
    secondary: { label: '查看帮助', type: 'drawer', target: 'settings-help-drawer' },
    primaryLabel: '保存快捷键方案',
    cards: [
      { label: '命令面板', title: 'Ctrl+K / Cmd+K', text: '用于全局跳转、打开抽屉、打开弹窗和触发深层动作。' },
      { label: '搜索', title: 'Ctrl+Shift+F', text: '全局搜索入口必须和文档区搜索区分明确。' },
      { label: '编排', title: 'Ctrl+Alt+O', text: '快速进入编排页，并保留当前保存上下文。' },
      { label: '资源中心', title: 'Ctrl+Alt+R', text: '统一打开资源中心，不再跳到多个平级资源页。' }
    ],
    fields: [
      { label: '命令面板', value: 'Ctrl+K' },
      { label: '资源中心', value: 'Ctrl+Alt+R' },
      { label: '编排页', value: 'Ctrl+Alt+O' },
      { label: '保存', value: 'Ctrl+S' }
    ],
    formActions: {
      first: { label: '导出清单', type: 'drawer', target: 'settings-help-drawer' },
      second: { label: '恢复默认', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存快捷键方案'
    },
    footnotes: [
      { label: '平台差异', title: 'Windows / macOS 分开展示', text: '不能把平台差异藏在脚注里。' },
      { label: '交互原则', title: '命令面板是高手入口，不是首屏噪音', text: '欢迎页和工作台都应保留轻量深层入口，但不抢主路径。' }
    ]
  },
  advanced: {
    kicker: '当前菜单',
    title: '高级',
    summary: '集中放置日志、诊断、实验开关、证据导出和安全相关操作。',
    secondary: { label: '打开帮助', type: 'drawer', target: 'settings-help-drawer' },
    primaryLabel: '保存高级设置',
    cards: [
      { label: '运行诊断', title: 'Provider / 连接 / Flow 保存链路', text: '用于定位配置异常、模型不可用和导出失败。' },
      { label: '证据导出', title: 'trace / logs / screenshots', text: '支持评审、闭环测试和问题复现。' },
      { label: '实验开关', title: '原型能力 / Beta 功能', text: '必须明确标注风险和影响范围。' },
      { label: '安全与清理', title: '缓存 / 最近项 / 权限记录', text: '高级动作必须进入单独确认路径。' }
    ],
    fields: [
      { label: '日志级别', value: 'Info' },
      { label: '证据保留', value: '最近 30 次运行' },
      { label: '实验特性', value: '关闭' },
      { label: '最近项清理', value: '手动触发' }
    ],
    formActions: {
      first: { label: '打开诊断', type: 'drawer', target: 'settings-diagnostics-drawer' },
      second: { label: '清理最近项', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存高级设置'
    },
    footnotes: [
      { label: '证据原则', title: '用户可见路径必须能导出证据', text: '截图、trace 和日志应对齐到同一条用户旅程。' },
      { label: '风险控制', title: '删除、清理、实验开关都要确认', text: '这些动作不能做成看似轻量的一键按钮。' }
    ]
  }
};

const providerProfiles = [
  {
    id: 'ollama-qwen3',
    label: '本地默认',
    title: 'Ollama · qwen3',
    note: '本地模型，适合结构化文档与审查任务。',
    status: '连接正常',
    cards: [
      { label: '配置名称', title: 'Ollama · qwen3', text: '本地模型，适合结构化文档与审查任务。' },
      { label: 'Provider', title: 'Ollama', text: 'Base URL: http://127.0.0.1:11434' },
      { label: '默认模型', title: 'qwen3:8b', text: '命中能力：chat / review / structured output' },
      { label: '状态', title: '连接正常', text: '最近测试：120ms / 响应成功' }
    ],
    fields: [
      { label: 'Base URL', value: 'http://127.0.0.1:11434' },
      { label: 'Model', value: 'qwen3:8b' },
      { label: 'API Key', value: '••••••••••••••••' },
      { label: '能力标签', value: '长上下文 / 审查 / 中文优先' }
    ],
    formActions: {
      first: { label: '测试连接', type: 'drawer', target: 'settings-diagnostics-drawer' },
      second: { label: '删除配置', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存更改'
    },
    footnotes: [
      { label: '快捷键提示', title: 'Windows: Ctrl+K / macOS: Cmd+K', text: '设置页要明确展示平台差异，避免把快捷键文案写死。' },
      { label: '高级入口', title: '日志 / 诊断 / 安全与证据', text: '这些内容进入高级菜单，不与 Provider 配置争抢主区域。' }
    ]
  },
  {
    id: 'deepseek-openai',
    label: '团队共享',
    title: 'DeepSeek Compatible',
    note: 'OpenAI Compatible 接口，适合联网研究与长文本整理。',
    status: '待校验',
    cards: [
      { label: '配置名称', title: 'DeepSeek Compatible', text: '团队共享 Provider，用于联网研究与长文本整理。' },
      { label: 'Provider', title: 'OpenAI Compatible', text: 'Base URL: https://api.deepseek.com' },
      { label: '默认模型', title: 'deepseek-chat', text: '命中能力：chat / reasoning / retrieval' },
      { label: '状态', title: '待校验', text: '最近测试：未执行 / 需要复核 API Key' }
    ],
    fields: [
      { label: 'Base URL', value: 'https://api.deepseek.com' },
      { label: 'Model', value: 'deepseek-chat' },
      { label: 'API Key', value: '••••••••••••ABCD' },
      { label: '能力标签', value: '联网 / 推理 / 长文本' }
    ],
    formActions: {
      first: { label: '测试连接', type: 'drawer', target: 'settings-diagnostics-drawer' },
      second: { label: '停用配置', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存更改'
    },
    footnotes: [
      { label: '接入范围', title: '建议绑定研究类工程', text: '不要默认全局启用，避免普通写作会话误命中联网模型。' },
      { label: '安全提醒', title: '外部 Provider 必须保留来源证据', text: '联网结果需要同时保留时间、来源和引用路径。' }
    ]
  },
  {
    id: 'openai-backup',
    label: '备用',
    title: 'OpenAI Compatible · gpt-4.1-mini',
    note: '备用配置，适合快速补写和轻量总结。',
    status: '空闲',
    cards: [
      { label: '配置名称', title: 'OpenAI Compatible · gpt-4.1-mini', text: '备用配置，适合快速补写和轻量总结。' },
      { label: 'Provider', title: 'OpenAI Compatible', text: 'Base URL: https://api.openai.com/v1' },
      { label: '默认模型', title: 'gpt-4.1-mini', text: '命中能力：chat / summary / lightweight review' },
      { label: '状态', title: '空闲', text: '最近测试：9 天前 / 可重新验证' }
    ],
    fields: [
      { label: 'Base URL', value: 'https://api.openai.com/v1' },
      { label: 'Model', value: 'gpt-4.1-mini' },
      { label: 'API Key', value: '••••••••••••WXYZ' },
      { label: '能力标签', value: '快速总结 / 补写 / 轻审查' }
    ],
    formActions: {
      first: { label: '测试连接', type: 'drawer', target: 'settings-diagnostics-drawer' },
      second: { label: '删除配置', type: 'modal', target: 'settings-delete-modal' },
      primaryLabel: '保存更改'
    },
    footnotes: [
      { label: '使用建议', title: '适合草稿和低成本补写', text: '不建议承接最终交付审查，除非再挂证据与规则守卫。' },
      { label: '维护原则', title: '备用配置也要可测试、可删除', text: 'Provider 只是低频配置，不应占用设置首页的整屏主体。' }
    ]
  }
];

const settingsState = {
  viewId: 'provider',
  providerId: 'ollama-qwen3'
};

const shellState = {
  hasProject: false,
  stage: '需求',
  unsaved: '1'
};

const workbenchState = {
  pane: 'files',
  docId: 'baseline'
};

const thinkingChainState = {
  nodeId: 'premise-project',
  hideRejected: true,
  zoom: 100,
  dragMode: false
};

const resourceCenterData = {
  template: {
    topbarState: '当前类型：外部模板',
    searchHint: '软件工厂 / GStack / 小说创作 / 旅行攻略',
    listKicker: '当前类型',
    listTitle: '外部模板',
    listCount: '4 个模板',
    detailKicker: '当前选中模板',
    context: {
      kicker: '当前动作带',
      title: '模板驱动',
      text: '当前选中模板时，一级动作只保留“开始编排”和“从模板创建工程”；Skill 安装和诊断仍在同一页面，但不抢占主路径。'
    },
    actions: {
      secondary: { label: '查看详情', type: 'drawer', target: 'template-detail-drawer' },
      path: { label: '开始编排', type: 'screen', target: 'orchestration', flowContext: 'project', autoProject: 'draft' },
      main: { label: '从模板创建工程', type: 'screen', target: 'workbench', autoProject: 'create' },
      import: { label: '从目录导入模板', type: 'modal', target: 'resource-transfer-modal' },
      download: { label: '下载模板', type: 'modal', target: 'resource-transfer-modal' },
      contextPath: { label: '开始编排', type: 'screen', target: 'orchestration', flowContext: 'project', autoProject: 'draft' },
      contextMain: { label: '从模板创建工程', type: 'screen', target: 'workbench', autoProject: 'create' }
    },
    items: [
      {
        id: 'software-factory',
        title: '软件工厂',
        summary: '官方模板 · 含流程骨架、输出映射与默认交付结构。',
        detail: {
          title: '软件工厂',
          summary: '把需求输入、规划、编排、输出映射和交付目录组织在同一条默认工作流里，用于快速启动一个结构完整的真实项目。',
          meta: { origin: '官方目录', version: 'v0.9', trust: '已校验', compat: 'Windows / macOS' },
          sections: [
            { label: '默认 Flow', title: '需求输入 → 规划 → 编排 → 导出映射', text: '默认包含主流程、审查回环、输出映射和交付目录约束。' },
            { label: '输出结构', title: 'docs / assets / openspec / exports', text: '输出包包含 Markdown、manifest、目录结构与后续导出映射。' },
            { label: '适合场景', title: '软件需求、方案设计、交付打包', text: '适合需要完整文档链路和可交付目录结构的工作流。' },
            { label: '建议搭配 Skill', title: 'Requirements Review / docs-writer', text: '模板与 Skill 在同一个资源中心完成安装、查看与后续接入，不再分裂为两类主页面。' }
          ]
        }
      },
      {
        id: 'gstack-delivery',
        title: 'GStack 软件交付',
        summary: '外部模板 · 偏交付闭环，附带 manifest 与评审路径。',
        detail: {
          title: 'GStack 软件交付',
          summary: '更偏向真实交付节奏，适合先明确范围、再形成交付目录、最后导出包的工作方式。',
          meta: { origin: '外部模板库', version: 'v0.7', trust: '待复核', compat: 'Windows / macOS' },
          sections: [
            { label: '默认 Flow', title: '需求校准 → 方案细化 → 交付打包', text: '默认减少探索节点，强调清单、风险和交付产物。' },
            { label: '输出结构', title: 'manifest / exports / review-log', text: '更强调 manifest、审查记录和输出包完整性。' },
            { label: '适合场景', title: '项目交付、评审闭环、验收包准备', text: '适合已知道目标，重点是把交付组织完整的项目。' },
            { label: '建议搭配 Skill', title: 'Scope Check / Delivery Review', text: '建议与范围检查和交付审查类 Skill 一起使用。' }
          ]
        }
      },
      {
        id: 'novel-studio',
        title: '小说创作',
        summary: '外部模板 · 章节推进、风格控制与素材管理。',
        detail: {
          title: '小说创作',
          summary: '适合长期内容创作，强调角色设定、章节推进、风格约束和素材积累。',
          meta: { origin: '社区共享', version: 'v0.5', trust: '已校验', compat: 'Windows / macOS' },
          sections: [
            { label: '默认 Flow', title: '设定 → 大纲 → 分章 → 润色', text: '默认将设定和正文推进拆分成多步，便于长期迭代。' },
            { label: '输出结构', title: 'chapters / lore / assets', text: '输出章节、世界观资料和角色设定资产。' },
            { label: '适合场景', title: '长篇创作、系列创作、风格管理', text: '适合需要长期推进内容并维持风格一致性的场景。' },
            { label: '建议搭配 Skill', title: 'Style Guard / Continuity Review', text: '推荐与风格守卫和连续性审查类 Skill 搭配。' }
          ]
        }
      },
      {
        id: 'travel-guide',
        title: '旅行攻略',
        summary: '外部模板 · 采集信息、结构整理与多格式输出。',
        detail: {
          title: '旅行攻略',
          summary: '适合快速整理公开信息、路线方案和注意事项，并生成清晰的输出文档。',
          meta: { origin: '社区共享', version: 'v0.4', trust: '待复核', compat: 'Windows / macOS' },
          sections: [
            { label: '默认 Flow', title: '收集 → 整理 → 比较 → 输出', text: '默认把采集、整理和决策建议拆开，保证输出更清楚。' },
            { label: '输出结构', title: 'itinerary / notes / checklist', text: '输出行程、重点笔记和准备清单。' },
            { label: '适合场景', title: '路线整理、攻略对比、出发准备', text: '适合需要把零散信息汇总成结构化结果的轻项目。' },
            { label: '建议搭配 Skill', title: 'Checklist Review / Docs Writer', text: '建议搭配清单审查和文档写作类 Skill。' }
          ]
        }
      }
    ]
  },
  skill: {
    topbarState: '当前类型：外部 Skill',
    searchHint: 'requirements review / docs-writer / scope-check',
    listKicker: '当前类型',
    listTitle: '外部 Skill',
    listCount: '3 个 Skill',
    detailKicker: '当前选中 Skill',
    context: {
      kicker: '当前动作带',
      title: '能力接入',
      text: '当前选中 Skill 时，一级动作切到“安装并启用”和“查看启用范围”；模板相关路径仍保留在同一页面，但不占主视觉。'
    },
    actions: {
      secondary: { label: '查看接入范围', type: 'drawer', target: 'resource-scope-drawer' },
      path: { label: '查看健康状态', type: 'drawer', target: 'resource-health-drawer' },
      main: { label: '安装并启用', type: 'modal', target: 'resource-transfer-modal' },
      import: { label: '从目录安装 Skill', type: 'modal', target: 'resource-transfer-modal' },
      download: { label: '下载 Skill', type: 'modal', target: 'resource-transfer-modal' },
      contextPath: { label: '查看启用范围', type: 'drawer', target: 'resource-scope-drawer' },
      contextMain: { label: '安装并启用', type: 'modal', target: 'resource-transfer-modal' }
    },
    items: [
      {
        id: 'requirements-review',
        title: 'Requirements Review',
        summary: '官方 Skill · 审查需求边界、遗漏项与验收标准。',
        detail: {
          title: 'Requirements Review',
          summary: '用于在需求阶段扫描缺口、边界模糊项和验收不完整项，帮助把需求从“有想法”推进到“可判断”。',
          meta: { origin: '官方市场', version: 'v1.2', trust: '已校验', compat: '全局 / 工程 / 会话' },
          sections: [
            { label: '适用场景', title: '需求审查 / 缺口扫描 / 验收梳理', text: '适合需求早期收敛，尤其适合需要快速发现遗漏点的项目。' },
            { label: '接入方式', title: '全局 / 工程 / 会话', text: '可在全局启用，也可只绑定到某个工程或某个会话。' },
            { label: '依赖输入', title: '需求文档 / 边界说明 / 约束清单', text: '输入越明确，审查结论越稳定。' },
            { label: '建议搭配模板', title: '软件工厂 / GStack 软件交付', text: '与以需求和交付为核心的模板组合时最有价值。' }
          ]
        }
      },
      {
        id: 'docs-writer',
        title: 'docs-writer',
        summary: '外部 Skill · 帮助稳定生成结构化 Markdown 文档。',
        detail: {
          title: 'docs-writer',
          summary: '用于把分散上下文组织成结构清晰的 Markdown，适合在工作台和编排页都作为写作辅助能力使用。',
          meta: { origin: '外部 Skill 仓库', version: 'v0.8', trust: '已校验', compat: '工程 / 会话' },
          sections: [
            { label: '适用场景', title: '方案写作 / 汇总整理 / 交付文档', text: '适合需要稳定文档结构和标题层级的输出场景。' },
            { label: '接入方式', title: '工程 / 会话', text: '建议只在相关工程或写作会话中启用，避免全局抢上下文。' },
            { label: '依赖输入', title: '笔记 / 规划 / 既有输出', text: '更适合在已有资料的基础上整合，而不是完全从零生成。' },
            { label: '建议搭配模板', title: '软件工厂 / 旅行攻略', text: '适合对文档结构要求明确的模板。' }
          ]
        }
      },
      {
        id: 'scope-check',
        title: 'Scope Check',
        summary: '外部 Skill · 检查本轮范围是否漂移、是否混入低优先事项。',
        detail: {
          title: 'Scope Check',
          summary: '用于在迭代过程中持续检查当前范围、优先级和未完成项，避免工作再次偏离主目标。',
          meta: { origin: '社区仓库', version: 'v0.6', trust: '待复核', compat: '工程 / 会话' },
          sections: [
            { label: '适用场景', title: '范围控制 / 迭代拆分 / 评审准备', text: '适合需要持续回到主线的中长期工作流。' },
            { label: '接入方式', title: '工程 / 会话', text: '建议在评审会话或迭代规划会话中启用。' },
            { label: '依赖输入', title: '当前计划 / 未完成项 / 约束', text: '依赖当前边界和剩余任务的结构化输入。' },
            { label: '建议搭配模板', title: '软件工厂 / 小说创作', text: '适合边做边收敛的大型模板。' }
          ]
        }
      }
    ]
  },
  expansion: {
    topbarState: '当前类型：扩展位',
    searchHint: '外部文档 / 外部角色 / 未来资源类型',
    listKicker: '当前类型',
    listTitle: '扩展位',
    listCount: '2 个预留类型',
    detailKicker: '统一接入原则',
    context: {
      kicker: '当前动作带',
      title: '保持统一骨架',
      text: '当前版本不把外部文档、外部角色抬成首层入口。只有当频率足够高、动作路径稳定时，才会从扩展位升级为主类型。'
    },
    actions: {
      secondary: { label: '查看接入规则', type: 'drawer', target: 'resource-scope-drawer' },
      path: { label: '查看统一骨架', type: 'drawer', target: 'resource-scope-drawer' },
      main: { label: '记录候选类型', type: 'drawer', target: 'resource-scope-drawer' },
      import: { label: '记录资源需求', type: 'drawer', target: 'resource-scope-drawer' },
      download: { label: '查看扩展原则', type: 'drawer', target: 'resource-scope-drawer' },
      contextPath: { label: '统一接入规则', type: 'drawer', target: 'resource-scope-drawer' },
      contextMain: { label: '保持扩展位', type: 'drawer', target: 'resource-scope-drawer' }
    },
    items: [
      {
        id: 'external-docs',
        title: '外部文档',
        summary: '未来可接入文档包、知识快照、参考资料集。',
        detail: {
          title: '外部文档',
          summary: '未来可把外部知识包、文档集和快照作为一种资源接入，但仍应沿用同一搜索、列表、详情和动作带骨架。',
          meta: { origin: '未来扩展', version: '未开放', trust: '待定义', compat: '统一资源中心' },
          sections: [
            { label: '预期作用', title: '补充参考资料与知识上下文', text: '主要用于给工程和编排提供更稳定的外部文档输入。' },
            { label: '接入方式', title: '仍使用统一列表与详情区', text: '不新增“文档中心”平级页面，只在资源中心升级类型。' },
            { label: '升级条件', title: '频率高 / 路径稳定 / 约束明确', text: '只有满足高频和稳定路径后才进入首层。' },
            { label: '当前状态', title: '预留扩展位', text: '当前版本不开放安装与启用动作。' }
          ]
        }
      },
      {
        id: 'external-roles',
        title: '外部角色',
        summary: '未来可接入角色包、权限边界、角色设定。',
        detail: {
          title: '外部角色',
          summary: '未来可把角色包作为外部资源接入，但仍应复用统一资源中心的搜索、列表、详情和接入规则。',
          meta: { origin: '未来扩展', version: '未开放', trust: '待定义', compat: '统一资源中心' },
          sections: [
            { label: '预期作用', title: '补充角色定义和边界约束', text: '主要为编排页和 AI 会话提供可复用角色资产。' },
            { label: '接入方式', title: '不再新增角色中心页', text: '如果开放，也应在同一骨架内出现。' },
            { label: '升级条件', title: '形成稳定主路径后再升级', text: '只有角色包成为高频入口时才进入首层。' },
            { label: '当前状态', title: '预留扩展位', text: '当前版本先保留，不开放为首层资源。' }
          ]
        }
      }
    ]
  }
};

const rulesCenterData = {
  rules: {
    topbarState: '当前视图：规则',
    searchHint: '引用守卫 / 输出契约 / 节点规则 / 命中顺序',
    paneTitle: '三层规则',
    paneCopy: '规则分为全局、工程、节点三层。它们是独立对象，不再散落在文档正文、流程说明和会话备注里。',
    context: {
      kicker: '当前动作带',
      title: '先做结构化治理，再把结果回写到运行页',
      text: '规则中心只负责建模、覆盖、命中和解释；真正的写作、编排和导出仍发生在工作台与编排页。'
    },
    actions: {
      secondary: { label: '查看命中栈', type: 'drawer', target: 'rule-hit-drawer' },
      path: { label: '知识路径', type: 'drawer', target: 'knowledge-path-drawer' },
      main: { label: '导入 / 新建', type: 'modal', target: 'governance-transfer-modal' },
      import: { label: '导入本地规则', type: 'modal', target: 'governance-transfer-modal' },
      export: { label: '导出当前规则', type: 'modal', target: 'governance-transfer-modal' },
      contextPath: { label: '查看知识网络', type: 'screen', target: 'rules-center', rulesView: 'graph', rulesScope: 'project' },
      contextMain: { label: '打开节点规则', type: 'screen', target: 'rules-center', rulesView: 'rules', rulesScope: 'node' }
    },
    scopes: {
      global: {
        topbarLabel: '当前层级：全局',
        listKicker: '当前层级',
        listTitle: '全局规则',
        listCount: '1 条',
        menuTitle: '全局规则',
        menuNote: '独立于工程，对所有项目和会话生效。',
        summaryTitle: '全局规则是所有输出的底线',
        summaryText: '适合安全、引用、基础格式和通用边界，不应混入项目私有语义。',
        items: [
          {
            id: 'global-citation-guard',
            title: '引用与证据守卫',
            summary: '要求 AI 输出能回溯到原文、链接或运行记录。',
            detail: {
              kicker: '当前规则',
              title: '引用与证据守卫',
              summary: '这是跨工程的全局规则，用于压制“只给结论不给证据”的输出习惯，确保审查与导出阶段都能回溯来源。',
              meta: [
                { label: '作用域', value: '全局' },
                { label: '命中方式', value: '文档 / AI 会话 / 导出' },
                { label: '落盘位置', value: '本地全局规则库' },
                { label: '关联对象', value: '文档 / 运行记录' }
              ],
              sections: [
                { label: '触发来源', title: '来自长期复发的“无引用结论”问题', text: '把这类问题沉淀成全局规则后，就不再需要每个工程重复写一遍提示词。' },
                { label: '命中边界', title: '约束所有输出，但不替代项目私有要求', text: '全局规则只提供底线，不应吞掉工程自己的格式、目录和交付语义。' },
                { label: '冲突策略', title: '只允许下层追加，不允许抹掉证据链', text: '节点可以要求更多字段，但不能关闭来源引用、证据标注和可追溯性。' },
                { label: '回写动作', title: '可以被工程继承，也可被节点显式引用', text: '在工作台、编排页和导出链路中，这条规则都应作为默认命中项出现。' }
              ],
              preview: {
                kicker: '作用路径',
                title: '全局规则 → 当前文档 → AI 会话 → 交付输出',
                text: '先保证证据链稳定，再允许工程和节点在其上追加更细的约束。',
                nodes: ['全局规则', '当前文档', 'AI 会话', '交付输出']
              }
            }
          }
        ]
      },
      project: {
        topbarLabel: '当前层级：工程内',
        listKicker: '当前层级',
        listTitle: '工程规则',
        listCount: '1 条',
        menuTitle: '工程规则',
        menuNote: '跟随当前工程保存，约束项目边界、输出和知识底座。',
        summaryTitle: '工程规则服务项目私有边界',
        summaryText: '适合目录结构、RAG 来源边界、输出契约和交付标准，不应该挤进全局设置。',
        items: [
          {
            id: 'project-delivery-contract',
            title: 'AI 知识底座升级交付契约',
            summary: '统一该工程的输出结构、引用要求和导出目录。',
            detail: {
              kicker: '当前规则',
              title: 'AI 知识底座升级交付契约',
              summary: '把该工程的输出结构、引用要求、RAG 来源边界和交付目录约束统一收进工程规则，不再散落在文档正文里。',
              meta: [
                { label: '作用域', value: '工程内' },
                { label: '命中方式', value: '编排 / 工作台 / AI 会话' },
                { label: '落盘位置', value: '项目规则库' },
                { label: '关联对象', value: '文档 / Flow / 沉淀' }
              ],
              sections: [
                { label: '来源', title: '来自当前工程的交付边界整理', text: '把目录命名、输出格式、引用和清单结构从文档正文抽出来，统一变成可命中的规则对象。' },
                { label: '覆盖', title: '作用于主工作台、编排页和导出阶段', text: '同一工程下的文档工作、AI 会话和编排输出都会继承这组规则。' },
                { label: '冲突', title: '节点规则只覆盖同维度约束', text: '节点可以额外限制输出格式，但不会无提示地抹掉全局安全和引用守卫。' },
                { label: '下一步', title: '可以补挂 Skill 与知识网络路径', text: '规则对象不是终点，还需要与 Skill、沉淀和图谱节点建立可解释的链接。' }
              ],
              preview: {
                kicker: '作用路径',
                title: '工程规则 → 当前文档 → AI 会话 → 输出目录',
                text: '优先服务当前工程的交付边界，再向下作用到节点与导出结果。',
                nodes: ['工程规则', '当前文档', 'AI 会话', '输出目录']
              }
            }
          }
        ]
      },
      node: {
        topbarLabel: '当前层级：节点级',
        listKicker: '当前层级',
        listTitle: '节点规则',
        listCount: '1 条',
        menuTitle: '节点规则',
        menuNote: '只绑定某个流程节点，覆盖更上层同维度约束。',
        summaryTitle: '节点规则只解决当前节点的差异',
        summaryText: '这里最适合输出字段、格式、工件要求和运行时约束，不要把工程边界也塞进来。',
        items: [
          {
            id: 'node-analysis-output',
            title: '需求分析员输出要求',
            summary: '要求输出 PRD 草稿、风险清单和待确认问题，且必须带来源。',
            detail: {
              kicker: '当前规则',
              title: '需求分析员输出要求',
              summary: '该规则只绑定在“需求分析员”节点上，用来收紧该节点的输出字段、Markdown 结构和引用格式。',
              meta: [
                { label: '作用域', value: '节点级' },
                { label: '命中方式', value: '当前节点运行时' },
                { label: '落盘位置', value: 'Flow 节点规则段' },
                { label: '关联对象', value: '角色 / Skill / 工件要求' }
              ],
              sections: [
                { label: '输入约束', title: '绑定需求说明、访谈记录和边界清单', text: '节点规则不仅规定输出，也限制这个节点能读取哪些上游材料。' },
                { label: '输出约束', title: '固定为 PRD 草稿 + 风险清单 + 待确认问题', text: '比工程规则更细，直接服务这个节点的结果质量和后续可审查性。' },
                { label: '覆盖关系', title: '覆盖工程级的同类输出格式，不覆盖全局安全规则', text: '节点级可以更严格，但不能把全局引用守卫或工程目录契约关掉。' },
                { label: '回写动作', title: '可提升为工程规则，也可保留为节点私有', text: '如果多个节点反复出现同类约束，才考虑上升到工程规则。' }
              ],
              preview: {
                kicker: '作用路径',
                title: '节点规则 → 角色绑定 → 当前节点 → 输出工件',
                text: '节点级约束只在局部生效，但它的命中结果需要被解释给用户看。',
                nodes: ['节点规则', '角色绑定', '当前节点', '输出工件']
              }
            }
          }
        ]
      }
    }
  },
  distillation: {
    topbarState: '当前视图：个人沉淀',
    searchHint: '问题记录 / 解决方案 / 提升为规则 / 提升为 Skill',
    paneTitle: '个人沉淀',
    paneCopy: '把处理过程中遇到的问题、解决方案和可复用方法整理成沉淀条目，再决定提升成规则、Skill 或工程知识文档。',
    context: {
      kicker: '当前动作带',
      title: '沉淀先独立管理，再决定要不要升级',
      text: '沉淀条目不是杂乱笔记，它们应独立于主文档管理，可本地保存、导入导出，并可回写成规则、Skill 或知识文档。'
    },
    actions: {
      secondary: { label: '查看来源证据', type: 'drawer', target: 'knowledge-path-drawer' },
      path: { label: '提升为规则 / Skill', type: 'modal', target: 'distillation-promote-modal' },
      main: { label: '新建沉淀', type: 'modal', target: 'distillation-promote-modal' },
      import: { label: '导入本地沉淀', type: 'modal', target: 'governance-transfer-modal' },
      export: { label: '导出当前条目', type: 'modal', target: 'governance-transfer-modal' },
      contextPath: { label: '查看知识网络', type: 'screen', target: 'rules-center', rulesView: 'graph', rulesScope: 'project' },
      contextMain: { label: '回到工程规则', type: 'screen', target: 'rules-center', rulesView: 'rules', rulesScope: 'project' }
    },
    scopes: {
      global: {
        topbarLabel: '当前层级：个人库',
        listKicker: '当前层级',
        listTitle: '个人库',
        listCount: '1 条',
        menuTitle: '个人库',
        menuNote: '独立于工程保存，用于长期积累与复用。',
        summaryTitle: '个人库不等于全局规则库',
        summaryText: '只有经过验证、作用域明确的沉淀才应该上升为全局规则，其他先保留在个人库。',
        items: [
          {
            id: 'global-rag-recall-fix',
            title: 'RAG 误召回修复记录',
            summary: '记录大工程里误召回、重复块和来源漂移的修复方式。',
            detail: {
              kicker: '当前沉淀',
              title: 'RAG 误召回修复记录',
              summary: '这是长期积累的个人方法条目，用来沉淀大型工程下 RAG 误召回、块粒度不稳和路径解释不足的处理方式。',
              meta: [
                { label: '作用域', value: '个人库' },
                { label: '来源', value: '多工程复发问题' },
                { label: '可提升', value: '规则 / Skill' },
                { label: '落档位置', value: '本地沉淀库' }
              ],
              sections: [
                { label: '问题模式', title: '误召回通常来自块粒度与路径丢失', text: '沉淀里会记录误召回出现在哪种图谱结构下，以及最小修复动作。' },
                { label: '解决动作', title: '先修路径解释，再调整切块和索引', text: '不是所有问题都靠换模型解决，很多时候要先补链接网络和证据路径。' },
                { label: '提升判断', title: '跨工程复发后再考虑上升为全局规则', text: '如果只是某一个项目的数据脏问题，不应直接升成全局限制。' },
                { label: '落地方式', title: '可导出为本地文件，也可回写到规则中心', text: '沉淀条目应允许用户独立导出和导入，而不是强绑在某个工程里。' }
              ],
              preview: {
                kicker: '沉淀路径',
                title: '问题 → 证据 → 修复动作 → 可复用方法',
                text: '个人库中的条目先证明自己可复用，再决定是否升级。',
                nodes: ['问题', '证据', '修复动作', '可复用方法']
              }
            }
          }
        ]
      },
      project: {
        topbarLabel: '当前层级：工程沉淀',
        listKicker: '当前层级',
        listTitle: '工程沉淀',
        listCount: '1 条',
        menuTitle: '工程沉淀',
        menuNote: '归档到当前工程，但独立于主文档管理。',
        summaryTitle: '工程沉淀应该和主文档分开',
        summaryText: '它是工程内部的经验库，不应挤占需求、方案、计划等主文档的编辑空间。',
        items: [
          {
            id: 'project-flow-decouple',
            title: 'Flow 与工程解绑调整',
            summary: '记录“编排独立于工程”的问题、决策和回写结果。',
            detail: {
              kicker: '当前沉淀',
              title: 'Flow 与工程解绑调整',
              summary: '把“编排页与工程解绑，只在保存时决定是否跟随工程落盘”这一轮调整沉淀成工程内条目，供后续产品和实现继续对齐。',
              meta: [
                { label: '作用域', value: '工程内' },
                { label: '来源', value: '本项目产品调整' },
                { label: '可提升', value: '工程规则 / 设计文档' },
                { label: '落档位置', value: '工程沉淀库' }
              ],
              sections: [
                { label: '问题', title: '原有原型把无工程编排做成独立页面', text: '这会误导实现层，把“保存语义不同”错误地做成“页面不同”。' },
                { label: '决策', title: '保留同一个编排页，无工程入口自动补齐上下文', text: '无工程入口也进入同一编排页，只是在进入前自动创建草稿工程上下文，而不是再做一张独立页面。' },
                { label: '回写', title: '同步需求、功能与 UI 文档', text: '沉淀条目记录的不只是结论，还记录它已经影响了哪些文档和页面。' },
                { label: '下一步', title: '可提升为工程规则，约束后续 UI 与实现', text: '如果后续开发仍可能偏离，就应该把这条沉淀提升成正式工程规则。' }
              ],
              preview: {
                kicker: '沉淀路径',
                title: '产品调整 → 工程沉淀 → 工程规则 → 编排页',
                text: '工程沉淀是项目演化记录，不等于散落在会话里的聊天历史。',
                nodes: ['产品调整', '工程沉淀', '工程规则', '编排页']
              }
            }
          }
        ]
      },
      node: {
        topbarLabel: '当前层级：节点摘录',
        listKicker: '当前层级',
        listTitle: '节点摘录',
        listCount: '1 条',
        menuTitle: '节点摘录',
        menuNote: '从节点会话、规则命中和调试记录中沉淀。',
        summaryTitle: '节点摘录适合局部问题和临时经验',
        summaryText: '先收敛在节点级，复发后再升级；不要一开始就推成全局规则。',
        items: [
          {
            id: 'node-manifest-gap',
            title: '交付节点 manifest 缺口',
            summary: '记录交付导出节点经常遗漏 manifest 字段的修复方式。',
            detail: {
              kicker: '当前沉淀',
              title: '交付节点 manifest 缺口',
              summary: '这是从交付节点的运行记录里提取出的局部问题沉淀，用于指导后续是否把它升级为节点规则或工程规则。',
              meta: [
                { label: '作用域', value: '节点级' },
                { label: '来源', value: '交付节点运行记录' },
                { label: '可提升', value: '节点规则 / 工程规则' },
                { label: '落档位置', value: '节点沉淀区' }
              ],
              sections: [
                { label: '缺口', title: 'manifest 容易遗漏目录映射与命名规则', text: '问题集中在导出节点，先不必扩大到整个工程。' },
                { label: '证据', title: '来自最近三次交付导出失败记录', text: '沉淀条目保留问题样本和修复前后的差异，便于回溯。' },
                { label: '处理', title: '先补节点规则，再观察是否工程级复发', text: '如果只在交付节点出现，就不该把它抬成全局限制。' },
                { label: '后续', title: '可与导出 Skill 和目录映射规则绑定', text: '一旦稳定，可以把这条经验升级为规则或导出 Skill 的一部分。' }
              ],
              preview: {
                kicker: '沉淀路径',
                title: '节点问题 → 运行证据 → 修复动作 → 节点规则',
                text: '节点级沉淀主要服务局部迭代，不应该反过来污染全局规则库。',
                nodes: ['节点问题', '运行证据', '修复动作', '节点规则']
              }
            }
          }
        ]
      }
    }
  },
  graph: {
    topbarState: '当前视图：知识网络',
    searchHint: '文档 / Flow / Rule / Skill / 沉淀 / 运行记录',
    paneTitle: '链接网络',
    paneCopy: '针对大规模工程，把文档、Flow、规则、Skill、沉淀和运行记录编成可导航网络，用于 RAG 召回、路径解释和冲突定位。',
    context: {
      kicker: '当前动作带',
      title: '图谱不只是检索，它还要解释为什么命中',
      text: '大工程知识网络的目标不是再造一个资料树，而是把召回路径、规则命中、沉淀来源和 Flow 节点统一解释出来。'
    },
    actions: {
      secondary: { label: '查看知识路径', type: 'drawer', target: 'knowledge-path-drawer' },
      path: { label: '查看规则命中', type: 'drawer', target: 'rule-hit-drawer' },
      main: { label: '导出网络快照', type: 'modal', target: 'governance-transfer-modal' },
      import: { label: '导入外部材料', type: 'modal', target: 'governance-transfer-modal' },
      export: { label: '导出当前快照', type: 'modal', target: 'governance-transfer-modal' },
      contextPath: { label: '回到工程规则', type: 'screen', target: 'rules-center', rulesView: 'rules', rulesScope: 'project' },
      contextMain: { label: '查看工程沉淀', type: 'screen', target: 'rules-center', rulesView: 'distillation', rulesScope: 'project' }
    },
    scopes: {
      global: {
        topbarLabel: '当前层级：全局网络',
        listKicker: '当前层级',
        listTitle: '全局网络',
        listCount: '1 张',
        menuTitle: '全局网络',
        menuNote: '跨项目复用的规则、Skill 与问题模式关系。',
        summaryTitle: '全局网络只保留稳定的共性关系',
        summaryText: '不要把项目噪声直接塞进全局图谱，全局图谱更适合沉淀长期稳定的模式和连接。',
        items: [
          {
            id: 'graph-global-governance',
            title: '全局规则网络',
            summary: '查看规则、Skill 和常见问题模式之间的长期连接。',
            detail: {
              kicker: '当前图谱',
              title: '全局规则网络',
              summary: '聚合全局规则、常用 Skill 和跨工程复发问题，用于解释“为什么某种问题会持续出现、该优先命中哪类规则”。',
              meta: [
                { label: '范围', value: '全局' },
                { label: '节点类型', value: 'Rule / Skill / Pattern' },
                { label: '更新时间', value: '2026-04-13 16:20' },
                { label: '用途', value: '长期 RAG 与模式解释' }
              ],
              sections: [
                { label: '节点', title: '规则、Skill 与问题模式', text: '全局网络不以具体文档为中心，而以长期稳定的治理对象为中心。' },
                { label: '边', title: '命中、依赖、升级与替代关系', text: '边不只是“引用”，还要表达规则覆盖、Skill 依赖和沉淀升级。' },
                { label: '召回', title: '先通过模式定位，再回到具体工程', text: '大工程 RAG 不能只返回片段，还需要告诉用户命中的是哪条路径。' },
                { label: '限制', title: '不承载项目私有噪声', text: '项目级脏数据和一次性例外不应直接上升到全局网络。' }
              ],
              preview: {
                kicker: '网络示意',
                title: 'Problem Pattern → Rule → Skill → Review Action',
                text: '全局图谱偏向长期模式，而不是单个项目的即时状态。',
                nodes: ['Pattern', 'Rule', 'Skill', 'Review']
              }
            }
          }
        ]
      },
      project: {
        topbarLabel: '当前层级：工程网络',
        listKicker: '当前层级',
        listTitle: '工程网络',
        listCount: '1 张',
        menuTitle: '工程网络',
        menuNote: '围绕当前工程，把文档、Flow、规则和沉淀连成网络。',
        summaryTitle: '工程网络是大工程 RAG 的主战场',
        summaryText: '它应该帮助用户在文档、Flow、规则、Skill、沉淀和运行记录之间快速定位路径。',
        items: [
          {
            id: 'graph-project-upgrade',
            title: 'AI 知识底座升级工程图',
            summary: '连接当前工程文档、Flow、规则、Skill 和沉淀条目。',
            detail: {
              kicker: '当前图谱',
              title: 'AI 知识底座升级工程图',
              summary: '这是当前工程的知识网络总览，用来解释文档段落、流程节点、规则命中和沉淀来源之间的关系，并服务大工程 RAG。',
              meta: [
                { label: '范围', value: '工程内' },
                { label: '节点类型', value: 'Doc / Flow / Rule / Skill / Note' },
                { label: '更新时间', value: '2026-04-13 16:20' },
                { label: '用途', value: '工程内 RAG / 路径导航' }
              ],
              sections: [
                { label: '文档层', title: '需求、范围、计划、审查与映射文档', text: '工程网络要先把文档主链串起来，再把其他对象挂接到主链上。' },
                { label: '流程层', title: '主流程、子流程、节点规则与输出节点', text: '编排页中的节点不应孤立存在，需要成为图谱中的一等对象。' },
                { label: '治理层', title: '工程规则、沉淀条目、启用 Skill', text: '这三类对象决定为什么某个上下文会被召回、为什么某个输出会被限制。' },
                { label: '运行层', title: '最近会话、命中栈和交付记录', text: '没有运行层，图谱就只能做静态浏览，无法解释当前状态。' }
              ],
              preview: {
                kicker: '网络示意',
                title: 'Doc → Flow → Rule → Skill → Distillation',
                text: '工程网络是连接运行态与知识态的桥，不是另一棵文件树。',
                nodes: ['Doc', 'Flow', 'Rule', 'Skill']
              }
            }
          }
        ]
      },
      node: {
        topbarLabel: '当前层级：节点路径',
        listKicker: '当前层级',
        listTitle: '节点路径',
        listCount: '1 条',
        menuTitle: '节点路径',
        menuNote: '围绕当前节点查看命中的上下文链与证据路径。',
        summaryTitle: '节点路径解释当前节点为什么这样输出',
        summaryText: '节点路径把上游文档、命中规则、角色绑定和输出工件连成一条线，方便调试和审查。',
        items: [
          {
            id: 'graph-node-analysis',
            title: '需求分析员命中链',
            summary: '查看该节点从文档到规则再到输出工件的完整路径。',
            detail: {
              kicker: '当前图谱',
              title: '需求分析员命中链',
              summary: '围绕“需求分析员”节点，把上游文档、命中规则、沉淀证据、角色绑定和输出工件组织成可解释路径，用于节点级调试。',
              meta: [
                { label: '范围', value: '节点级' },
                { label: '节点类型', value: 'Doc / Rule / Role / Artifact' },
                { label: '更新时间', value: '2026-04-13 16:20' },
                { label: '用途', value: '节点调试 / 路径解释' }
              ],
              sections: [
                { label: '上游', title: '需求基线、功能范围与审查记录', text: '节点路径首先要告诉用户，这个节点到底读了哪些文档和上下文。' },
                { label: '命中', title: '全局引用守卫 + 工程交付契约 + 节点输出要求', text: '节点路径需要显示命中顺序和覆盖关系，而不是只说“命中了规则”。' },
                { label: '绑定', title: '角色、Skill 和工件要求', text: '节点不是只有一个 prompt，它还受角色绑定、Skill 能力和输出工件结构影响。' },
                { label: '结果', title: 'PRD 草稿、风险清单和待确认问题', text: '最终路径要回到用户真正关心的输出，而不是停留在中间技术概念上。' }
              ],
              preview: {
                kicker: '网络示意',
                title: '上游文档 → 命中规则 → 角色绑定 → 输出工件',
                text: '节点路径的价值，在于让用户一眼看懂“为什么会这样输出”。',
                nodes: ['上游文档', '命中规则', '角色绑定', '输出工件']
              }
            }
          }
        ]
      }
    }
  }
};

const rulesCenterState = {
  viewId: 'rules',
  scopeId: 'project',
  selectedItems: {}
};

const flowSessions = {
  'flow-main': {
    title: '主流程会话',
    subtitle: '聚焦当前流程、当前节点和最近一次结构调整。',
    currentFlow: '主流程',
    currentNode: '未选中',
    composerContext: '主流程',
    messages: [
      { role: 'ai', text: '建议先把“需求分析员”的输入要求和输出工件格式补完整，再继续加下游节点。' }
    ]
  },
  'flow-review': {
    title: '审查子流程会话',
    subtitle: '聚焦审查子流程的输入边界、角色职责和输出问题单。',
    currentFlow: '审查子流程',
    currentNode: '审查子流程',
    composerContext: '审查子流程',
    messages: [
      { role: 'ai', text: '当前子流程需要明确：谁负责汇总问题、谁负责裁决、问题如何回写主流程。' }
    ]
  },
  'flow-output': {
    title: '交付输出会话',
    subtitle: '聚焦输出目录、manifest、命名规范和导出格式。',
    currentFlow: '交付包导出',
    currentNode: '交付包导出',
    composerContext: '交付包导出',
    messages: [
      { role: 'ai', text: '输出节点建议拆成“目录映射”和“导出打包”两个层级，避免一个节点塞过多职责。' }
    ]
  }
};

function createFlowNodeRecord(config) {
  return {
    title: config.title,
    typeLabel: config.typeLabel,
    binding: config.binding,
    summary: config.summary,
    role: config.role,
    runtime: config.runtime,
    inputArtifacts: config.inputArtifacts,
    outputArtifacts: config.outputArtifacts,
    workflowLayer: config.workflowLayer,
    runtimeLayer: config.runtimeLayer,
    governanceLayer: config.governanceLayer,
    evolutionLayer: config.evolutionLayer
  };
}

const flowNodes = {
  start: createFlowNodeRecord({
    title: '需求输入',
    typeLabel: '开始节点',
    binding: '输入接收器 / intake-task / bootstrap-agent',
    summary: '把目录、工件类型、接收方式与上下文包拼装成可进入主流程的输入。',
    role: '输入接收器',
    runtime: '按目录读取',
    inputArtifacts: '需求说明 / 用户访谈 / 约束清单',
    outputArtifacts: '输入工件目录 / 清洗后的上下文包',
    workflowLayer: '负责入口工件、目录与消息 keys 映射，只把整理后的上下文包送入下游节点，不在这里夹带结构决策。',
    runtimeLayer: '支持目录扫描失败后重试、只重跑输入清洗，以及在草稿工程里继续补料后恢复执行。',
    governanceLayer: '进入主流程前先校验目录权限、输入完整性和来源记录，并把首个 evidence anchor 写入运行证据。',
    evolutionLayer: '当输入契约升级时保留旧 intake mapping，允许旧工程迁移到新工作流而不打断主流程。'
  }),
  analysis: createFlowNodeRecord({
    title: '需求分析员',
    typeLabel: '角色节点',
    binding: '需求分析员 / requirement-baseline / analyst-agent',
    summary: '把模糊输入整理成结构化需求基线，并明确输出契约与待确认问题。',
    role: '需求分析员',
    runtime: '一次性分析',
    inputArtifacts: '需求说明 / 用户访谈 / 约束清单',
    outputArtifacts: 'PRD 草稿 / 风险清单 / 待确认问题列表',
    workflowLayer: '配置角色、任务模板、输入工件与输出契约，决定下游接收什么文档、消息、信号和子流程入口。',
    runtimeLayer: '定义 checkpoint、失败重试、人工确认前置条件，以及是否允许从本节点做局部重跑或从上次保存继续。',
    governanceLayer: '校验所绑 Agent、Skill、连接器和输出目录权限是否合规，并把模型 / Skill 命中、审批记录和运行证据挂到节点上。',
    evolutionLayer: '维护 role / task / skill 版本迁移策略，允许把验证过的候选脚本晋升为正式能力，并记录依赖更新影响面。'
  }),
  review: createFlowNodeRecord({
    title: '审查子流程',
    typeLabel: '子流程节点',
    binding: 'review-subflow / red-blue-review / conclusion-writer',
    summary: '进入显式审查子流程，收敛争议、回写问题单并把结论返回主流程。',
    role: '审查流调度器',
    runtime: '进入子流程',
    inputArtifacts: 'PRD 草稿 / 风险清单',
    outputArtifacts: '修订建议 / 结论摘要 / 审查问题单',
    workflowLayer: '子流程节点负责父子流程之间的输入输出映射、回写契约和失败回溯入口，不能只是“跳到另一个页面”。',
    runtimeLayer: '在子流程边界落 checkpoint，支持人工中断后回到父流程，并保留最近一次合法 resume 入口与 rerun scope。',
    governanceLayer: '对子流程依赖、审批链、运行证据和红蓝裁决命中记录做完整追踪，确保回到父流程时可追责。',
    evolutionLayer: '子流程模板升级时保留版本迁移记录，支持把候选审查脚本晋升为正式 subflow bundle。'
  }),
  delivery: createFlowNodeRecord({
    title: '交付包导出',
    typeLabel: '输出节点',
    binding: 'delivery-export / export-mapping / release-bundle',
    summary: '把通过审查的内容映射到目录、命名、manifest 与导出物。',
    role: '交付编排官',
    runtime: '映射后导出',
    inputArtifacts: '通过审查的文档集 / 导出映射配置',
    outputArtifacts: 'Markdown / manifest / 目录结构 / 交付压缩包',
    workflowLayer: '维护最终输出契约、目录映射、导出格式和交付清单，确保主流程产物能准确落盘。',
    runtimeLayer: '负责导出失败重试、局部补导出、checkpoint 恢复与人工确认覆盖策略，避免一次导出损坏全部产物。',
    governanceLayer: '导出前校验目录权限、重名冲突、证据链和审批结果，并把命中的模型 / Skill / 工具记录回写到 run evidence。',
    evolutionLayer: '支持导出模板、manifest schema 和交付依赖包升级，保留旧版本兼容映射与迁移脚本。'
  })
};

const flowModuleDefinitions = {
  'module-agent': createFlowNodeRecord({
    title: '角色节点',
    typeLabel: '标准节点',
    binding: 'Role / Task / Agent Bundle',
    summary: '用于绑定角色、任务模板、Skill 与 Agent 执行包。',
    role: '角色节点',
    runtime: '可配置执行',
    inputArtifacts: '输入工件 / 输入消息 / Context Pack',
    outputArtifacts: '结构化文档 / 消息 / 信号',
    workflowLayer: '在工作流层维护 role、task、agent 绑定，明确输入输出工件、消息和下游路由关系。',
    runtimeLayer: '在运行控制层配置 checkpoint、重试、局部重跑和人工确认边界。',
    governanceLayer: '在治理审计层绑定 capability policy、审批要求、运行证据和模型 / skill 命中记录。',
    evolutionLayer: '在演进升级层维护 role / task / skill bundle 的版本迁移与候选脚本晋升。'
  }),
  'module-tool': createFlowNodeRecord({
    title: '工具节点',
    typeLabel: '标准节点',
    binding: 'Tool / Connector / Capability',
    summary: '执行外部能力、脚本工具或连接器调用。',
    role: '工具节点',
    runtime: '受控调用',
    inputArtifacts: '输入参数 / 工件路径 / 调用前上下文',
    outputArtifacts: '工具结果 / 回写工件 / 事件记录',
    workflowLayer: '维护工具入参与输出回写点，避免把外部副作用散落到其他节点。',
    runtimeLayer: '支持失败重试、审批后继续、checkpoint 回滚和局部重跑。',
    governanceLayer: '严格校验权限边界、side-effect preview、审批记录和运行证据。',
    evolutionLayer: '允许工具包、连接器和依赖版本平滑升级，并跟踪变更影响。'
  }),
  'module-condition': createFlowNodeRecord({
    title: '条件节点',
    typeLabel: '标准节点',
    binding: 'Condition Expression / True / False',
    summary: '显式维护条件表达式与 true / false 分支。',
    role: '条件节点',
    runtime: '条件判断',
    inputArtifacts: '上游消息 / 工件状态 / 运行变量',
    outputArtifacts: 'True 分支 / False 分支',
    workflowLayer: '定义条件表达式、分支目标和默认回退流向，避免把路由逻辑藏进普通节点文案。',
    runtimeLayer: '条件判断失败时可切到人工确认或兜底分支，并支持局部重跑该判断。',
    governanceLayer: '记录条件求值、命中的规则、依赖校验和分支证据。',
    evolutionLayer: '条件模板升级时保留旧表达式映射，避免规则重写直接破坏旧流程。'
  }),
  'module-loop': createFlowNodeRecord({
    title: '循环节点',
    typeLabel: '标准节点',
    binding: 'Loop Condition / Exit Condition',
    summary: '定义循环条件、退出条件和超时边界。',
    role: '循环节点',
    runtime: '循环控制',
    inputArtifacts: '当前状态 / 迭代上下文 / 循环变量',
    outputArtifacts: '下一轮输入 / 退出信号',
    workflowLayer: '维护 loop back、exit target 和循环上下文，保证循环是显式工作流语义。',
    runtimeLayer: '控制每轮 checkpoint、最大重试、超时退出和人工接管。',
    governanceLayer: '记录循环轮次、失败原因、审批拦截和 evidence lineage。',
    evolutionLayer: '升级循环策略时保留旧轮次规则和迁移提示，避免流程升级后无法恢复旧 checkpoint。'
  }),
  'module-parallel': createFlowNodeRecord({
    title: '并行分支',
    typeLabel: '标准节点',
    binding: 'Parallel Split / Join / Failure Policy',
    summary: '拆分并行分支，并定义汇合与失败策略。',
    role: '并行分支',
    runtime: '并行执行',
    inputArtifacts: '共享上下文 / 分支输入 / 汇合条件',
    outputArtifacts: '分支结果 / 汇合输出',
    workflowLayer: '维护 split、join、分支通信和汇合输出，保证并行是第一类编排对象。',
    runtimeLayer: '配置分支取消策略、失败收敛策略、checkpoint 与局部重跑范围。',
    governanceLayer: '对每个分支记录审批、证据、依赖命中和异常归因，确保汇合后可追责。',
    evolutionLayer: '并行模板升级时保留旧分支拓扑和 join contract，支持渐进迁移。'
  }),
  'module-approval': createFlowNodeRecord({
    title: '人工确认',
    typeLabel: '标准节点',
    binding: 'Approval Gate / Review Decision',
    summary: '把审批、阻断与人工确认放进主流程，而不是藏在说明文字里。',
    role: '人工确认',
    runtime: '等待审批',
    inputArtifacts: '审批预览 / 风险说明 / 候选动作',
    outputArtifacts: '批准 / 驳回 / 清理动作',
    workflowLayer: '在工作流层声明审批节点和后续分支，明确批准、驳回和回退路径。',
    runtimeLayer: '在运行控制层支持暂停等待、恢复、审批后继续和局部回退。',
    governanceLayer: '在治理审计层保存审批记录、操作人、side-effect preview 与运行证据。',
    evolutionLayer: '审批模板升级时同步升级审批表单、审批脚本和回退策略。'
  }),
  'subflow-review': createFlowNodeRecord({
    title: '审查子流程',
    typeLabel: '子流程',
    binding: 'Review Subflow / Red-Blue Review',
    summary: '进入红蓝审查、问题收敛与裁决输出。',
    role: '审查子流程',
    runtime: '子流程执行',
    inputArtifacts: '待审文档 / 风险清单 / 审查上下文',
    outputArtifacts: '裁决结果 / 修订建议 / 审查问题单',
    workflowLayer: '负责父子流程输入输出映射、子流程入口和回写目标。',
    runtimeLayer: '在 subflow 边界落 checkpoint，并提供 resume、partial rerun 与人工确认入口。',
    governanceLayer: '保留审查命中规则、模型 / skill 记录、审批链和运行证据。',
    evolutionLayer: '支持审查子流程版本升级、候选审查脚本晋升和兼容迁移。'
  }),
  'subflow-export': createFlowNodeRecord({
    title: '导出映射',
    typeLabel: '子流程',
    binding: 'Export Mapping / Delivery Bundle',
    summary: '把输出契约映射到目录、命名与导出清单。',
    role: '导出映射',
    runtime: '子流程执行',
    inputArtifacts: '输出契约 / 目录配置 / 命名规则',
    outputArtifacts: '导出映射 / manifest / 交付清单',
    workflowLayer: '把最终产物映射、目录结构和导出格式作为独立子流程维护。',
    runtimeLayer: '支持导出失败后局部补跑、重新打包和 checkpoint 恢复。',
    governanceLayer: '校验导出权限、路径冲突、审批记录和 evidence trail。',
    evolutionLayer: '导出映射升级时保留旧 schema 迁移和目录兼容策略。'
  }),
  'subflow-upgrade': createFlowNodeRecord({
    title: '升级子流程',
    typeLabel: '子流程',
    binding: 'Evolution Pipeline / Upgrade Bundle',
    summary: '负责依赖迁移、候选脚本晋升与版本升级。',
    role: '升级子流程',
    runtime: '子流程执行',
    inputArtifacts: '角色包 / Skill 包 / Workflow 版本记录',
    outputArtifacts: '迁移结果 / 晋升清单 / 升级报告',
    workflowLayer: '把迁移、晋升和升级任务显式做成子流程，避免散在各页面操作里。',
    runtimeLayer: '支持逐步迁移、失败回退和按 checkpoint 恢复升级流程。',
    governanceLayer: '记录审批链、依赖校验、升级证据和命中的规则 / skill。',
    evolutionLayer: '维护 role / skill / task / workflow 的长期版本策略和候选资产晋升路径。'
  })
};

const flowNodeClassMap = {
  agent: 'flow-node-type-agent',
  tool: 'flow-node-type-tool',
  condition: 'flow-node-type-condition',
  loop: 'flow-node-type-loop',
  parallel: 'flow-node-type-parallel',
  approval: 'flow-node-type-approval',
  subflow: 'flow-node-type-subflow'
};

const flowInspectorState = {
  selectedNodeId: 'analysis',
  activeSessionId: 'flow-main'
};

let flowGeneratedNodeCounter = 0;

const flowContexts = {
  project: {
    subtitle: '软件工厂主流程',
    contextChip: '工程内保存',
    validationChip: '结构校验通过',
    saveChip: '保存时同步工程文档',
    returnTarget: 'workbench',
    returnLabel: '返回工作台',
    importLabel: '导入 Flow',
    secondarySaveLabel: '保存为模板',
    mainSaveLabel: '保存当前 Flow',
    heroKicker: 'Flow Builder / 工程内编排',
    heroTitle: '主流程',
    heroNote: '当前在工程内编排，保存时会连同工程文档、工件目录和导出结构一起落盘。',
    heroSaveLabel: '保存到本地模板'
  }
};

function renderEditor(blocks) {
  return blocks.map((block) => {
    if (block.type === 'title') {
      return `<div class="editor-block editor-title">${block.text}</div>`;
    }
    if (block.type === 'callout') {
      return '';
    }
    return `<div class="editor-block editor-line ${block.width}"></div>`;
  }).join('');
}

function renderMessages(messages) {
  return messages.map((message) => `
    <article class="message ${message.role}">
      <span class="message-role">${message.role === 'user' ? '你' : 'AI'}</span>
      <p>${message.text}</p>
    </article>
  `).join('');
}

function renderActionAttrs(config) {
  const attrs = [];
  if (config.screenTarget) attrs.push(`data-screen-target="${config.screenTarget}"`);
  if (config.flowContextTarget) attrs.push(`data-flow-context-target="${config.flowContextTarget}"`);
  if (config.autoProject) attrs.push(`data-auto-project="${config.autoProject}"`);
  if (config.openDrawer) attrs.push(`data-open-drawer="${config.openDrawer}"`);
  if (config.openModal) attrs.push(`data-open-modal="${config.openModal}"`);
  if (config.rulesViewTarget) attrs.push(`data-rules-view-target="${config.rulesViewTarget}"`);
  if (config.rulesScopeTarget) attrs.push(`data-rules-scope-target="${config.rulesScopeTarget}"`);
  return attrs.join(' ');
}

function renderWorkbenchPane(mode) {
  const pane = workbenchPaneModes[mode];
  if (!pane) return '';

  if (mode === 'files') {
    return pane.sections.map((section) => `
      <div class="tree-section-title">${section.title}</div>
      ${section.items.map((item) => `
        <button type="button" class="tree-item ${item.doc === workbenchState.docId ? 'active' : ''}"${item.doc ? ` data-doc="${item.doc}"` : ''}>${item.title}</button>
      `).join('')}
    `).join('');
  }

  return `
    <div class="tree-section-title">${mode === 'recent' ? '最近文档' : '搜索结果'}</div>
    ${pane.items.map((item) => `
      <button type="button" class="tree-item workbench-pane-item"${item.doc ? ` data-doc="${item.doc}"` : ''}>
        <strong>${item.title}</strong>
        <span>${item.meta}</span>
        <em>${item.note}</em>
      </button>
    `).join('')}
  `;
}

function setWorkbenchPane(mode) {
  const pane = workbenchPaneModes[mode];
  if (!pane) return;
  workbenchState.pane = mode;

  const query = document.getElementById('workbench-pane-query');
  const content = document.getElementById('workbench-pane-content');
  const chip = document.getElementById('workbench-pane-chip');

  if (query) query.value = pane.query;
  if (content) content.innerHTML = renderWorkbenchPane(mode);
  if (chip) chip.textContent = pane.chip;

  document.querySelectorAll('[data-workbench-pane]').forEach((button) => {
    button.classList.toggle('active', button.dataset.workbenchPane === mode);
  });

  if (content) {
    content.querySelectorAll('[data-doc]').forEach((button) => {
      button.addEventListener('click', () => {
        const docId = button.dataset.doc;
        if (docId) setWorkbenchDoc(docId);
      });
    });
  }
}

function renderThinkingEvidence(items) {
  return items.map((item) => `
    <button type="button" class="overlay-item thinking-evidence-item" ${renderActionAttrs(item)}>
      <em class="thinking-evidence-kicker">${item.kicker || '证据入口'}</em>
      <strong>${item.title}</strong>
      <span>${item.text}</span>
      <span class="thinking-evidence-context">${item.context || item.text}</span>
    </button>
  `).join('');
}

function updateThinkingCanvas() {
  const canvas = document.getElementById('thinking-chain-canvas');
  const zoomValue = document.getElementById('thinking-zoom-value');
  if (canvas) {
    canvas.dataset.hideRejected = thinkingChainState.hideRejected ? 'true' : 'false';
    canvas.dataset.dragMode = thinkingChainState.dragMode ? 'true' : 'false';
    canvas.style.transform = `scale(${thinkingChainState.zoom / 100})`;
    canvas.style.transformOrigin = 'top left';
  }
  if (zoomValue) zoomValue.textContent = `${thinkingChainState.zoom}%`;

  document.querySelectorAll('[data-thinking-drag]').forEach((button) => {
    button.classList.toggle('active', thinkingChainState.dragMode);
    const label = thinkingChainState.dragMode ? '关闭拖动' : '开启拖动';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  });
  document.querySelectorAll('[data-thinking-filter]').forEach((button) => {
    button.classList.toggle('active', thinkingChainState.hideRejected);
    button.textContent = thinkingChainState.hideRejected ? '隐藏已废弃' : '显示已废弃';
  });
}

function setThinkingNode(nodeId) {
  const node = thinkingNodes[nodeId];
  if (!node) return;
  thinkingChainState.nodeId = nodeId;

  const title = document.getElementById('thinking-detail-title');
  const summary = document.getElementById('thinking-detail-summary');
  const type = document.getElementById('thinking-detail-type');
  const stage = document.getElementById('thinking-detail-stage');
  const status = document.getElementById('thinking-detail-status');
  const source = document.getElementById('thinking-detail-source');
  const description = document.getElementById('thinking-detail-description');
  const thoughtTitle = document.getElementById('thinking-detail-thought-title');
  const thoughtText = document.getElementById('thinking-detail-thought-text');
  const reasonTitle = document.getElementById('thinking-detail-reason-title');
  const reasonText = document.getElementById('thinking-detail-reason-text');
  const evidence = document.getElementById('thinking-detail-evidence');

  if (title) title.textContent = node.title;
  if (summary) summary.textContent = node.summary;
  if (type) type.textContent = node.type;
  if (stage) stage.textContent = node.stage;
  if (status) status.textContent = node.status;
  if (source) source.textContent = node.source;
  if (description) description.textContent = node.detailText || node.summary;
  if (thoughtTitle) thoughtTitle.textContent = node.thoughtTitle || '思路描述';
  if (thoughtText) thoughtText.textContent = node.thoughtText || node.reasonText;
  if (reasonTitle) reasonTitle.textContent = node.reasonTitle;
  if (reasonText) reasonText.textContent = node.reasonText;
  if (evidence) {
    evidence.innerHTML = renderThinkingEvidence(node.evidence);
    wireActionButtons(evidence);
  }

  document.querySelectorAll('[data-thinking-node]').forEach((button) => {
    button.classList.toggle('active', button.dataset.thinkingNode === nodeId);
  });
}

function setButtonAction(buttonId, config) {
  const button = document.getElementById(buttonId);
  if (!button || !config) return;
  button.textContent = config.label;
  delete button.dataset.screenTarget;
  delete button.dataset.flowContextTarget;
  delete button.dataset.autoProject;
  delete button.dataset.requiresProject;
  delete button.dataset.openDrawer;
  delete button.dataset.openModal;
  delete button.dataset.openLayer;
  delete button.dataset.rulesViewTarget;
  delete button.dataset.rulesScopeTarget;
  delete button.dataset.rulesItemTarget;
  if (config.type === 'screen') button.dataset.screenTarget = config.target;
  if (config.flowContext) button.dataset.flowContextTarget = config.flowContext;
  if (config.autoProject) button.dataset.autoProject = config.autoProject;
  if (config.requiresProject) button.dataset.requiresProject = 'true';
  if (config.type === 'drawer') button.dataset.openDrawer = config.target;
  if (config.type === 'modal') button.dataset.openModal = config.target;
  if (config.type === 'layer') button.dataset.openLayer = config.target;
  if (config.rulesView) button.dataset.rulesViewTarget = config.rulesView;
  if (config.rulesScope) button.dataset.rulesScopeTarget = config.rulesScope;
  if (config.rulesItem) button.dataset.rulesItemTarget = config.rulesItem;
  wireActionButtons(button.parentElement || button);
}

function chunkItems(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function renderSettingsCards(cards) {
  return cards.map((card) => `
    <div class="settings-card">
      <span>${card.label}</span>
      <strong>${card.title}</strong>
      <p>${card.text}</p>
    </div>
  `).join('');
}

function renderSettingsFields(fields) {
  return chunkItems(fields, 2).map((row) => `
    <div class="settings-form-row">
      ${row.map((field) => `
        <div class="project-form-field">
          <span>${field.label}</span>
          <strong>${field.value}</strong>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function renderSettingsFootnotes(footnotes) {
  return footnotes.map((item) => `
    <div class="detail-section-card">
      <span>${item.label}</span>
      <strong>${item.title}</strong>
      <p>${item.text}</p>
    </div>
  `).join('');
}

function updateProjectBadges() {
  document.querySelectorAll('[data-project-stage]').forEach((node) => {
    node.textContent = shellState.stage;
  });
  document.querySelectorAll('[data-project-unsaved]').forEach((node) => {
    node.textContent = shellState.unsaved;
  });
  const unsavedCount = Number.parseInt(shellState.unsaved, 10) || 0;
  const hasUnsaved = shellState.hasProject && unsavedCount > 0;
  document.querySelectorAll('[data-project-unsaved-chip]').forEach((chip) => {
    const label = shellState.hasProject
      ? hasUnsaved ? `未保存 ${unsavedCount} 处` : '全部已保存'
      : '无活动工程';
    chip.classList.toggle('is-active', hasUnsaved);
    chip.setAttribute('title', label);
  });
  document.querySelectorAll('[data-requires-project]').forEach((button) => {
    button.classList.toggle('is-disabled', !shellState.hasProject);
    button.setAttribute('aria-disabled', String(!shellState.hasProject));
  });
  const welcomeStatus = document.querySelector('.screen-welcome .brand-copy span');
  if (welcomeStatus) welcomeStatus.textContent = shellState.hasProject ? '已有活动工程' : '无活动工程';
}

function setProjectPresence(hasProject, options = {}) {
  shellState.hasProject = hasProject;
  if (options.stage) shellState.stage = options.stage;
  if (options.unsaved !== undefined) shellState.unsaved = String(options.unsaved);
  updateProjectBadges();
}

function renderProviderList(selectedId) {
  const container = document.getElementById('settings-provider-list');
  if (!container) return;
  container.innerHTML = providerProfiles.map((profile) => `
    <button type="button" class="settings-provider-card ${profile.id === selectedId ? 'active' : ''}" data-provider-profile="${profile.id}">
      <div class="settings-provider-meta">
        <span>${profile.label}</span>
        <span>${profile.status}</span>
      </div>
      <strong>${profile.title}</strong>
      <span>${profile.note}</span>
    </button>
  `).join('');

  container.querySelectorAll('[data-provider-profile]').forEach((button) => {
    button.addEventListener('click', () => {
      const profileId = button.dataset.providerProfile;
      if (profileId) setProviderProfile(profileId);
    });
  });
}

function setProviderProfile(profileId) {
  const profile = providerProfiles.find((item) => item.id === profileId) || providerProfiles[0];
  const cardGrid = document.getElementById('settings-card-grid');
  const formPanel = document.getElementById('settings-form-panel');
  const footnoteGrid = document.getElementById('settings-footnote-grid');
  if (!profile || settingsState.viewId !== 'provider') return;

  settingsState.providerId = profile.id;
  if (cardGrid) cardGrid.innerHTML = renderSettingsCards(profile.cards);
  if (formPanel) {
    formPanel.innerHTML = `
      ${renderSettingsFields(profile.fields)}
      <div class="project-create-actions">
        <button type="button" class="ghost-action" data-open-drawer="${profile.formActions.first.target}">${profile.formActions.first.label}</button>
        <button type="button" class="ghost-action" data-open-modal="${profile.formActions.second.target}">${profile.formActions.second.label}</button>
        <button type="button" class="primary-action small">${profile.formActions.primaryLabel}</button>
      </div>
    `;
  }
  if (footnoteGrid) footnoteGrid.innerHTML = renderSettingsFootnotes(profile.footnotes);
  renderProviderList(profile.id);
  wireActionButtons(document.getElementById('settings-provider-pane'));
}

function setSettingsView(viewId) {
  const view = settingsViews[viewId];
  if (!view) return;

  settingsState.viewId = viewId;
  const kicker = document.getElementById('settings-kicker');
  const title = document.getElementById('settings-title');
  const summary = document.getElementById('settings-summary');
  const topSecondary = document.getElementById('settings-secondary-action');
  const topPrimary = document.getElementById('settings-primary-action');
  const subnav = document.getElementById('settings-subnav');
  const bodyLayout = document.getElementById('settings-body-layout');
  const providerList = document.getElementById('settings-provider-list');
  const cardGrid = document.getElementById('settings-card-grid');
  const formPanel = document.getElementById('settings-form-panel');
  const footnoteGrid = document.getElementById('settings-footnote-grid');

  if (kicker) kicker.textContent = view.kicker;
  if (title) title.textContent = view.title;
  if (summary) summary.textContent = view.summary;
  if (topPrimary) topPrimary.textContent = view.primaryLabel;
  setButtonAction('settings-secondary-action', view.secondary);
  if (subnav) {
    subnav.innerHTML = viewId === 'provider'
      ? `
        <button type="button" class="tab-chip active">已配置 Provider</button>
        <button type="button" class="tab-chip" data-open-drawer="settings-diagnostics-drawer">连接与诊断</button>
        <button type="button" class="tab-chip">新增 Provider</button>
      `
      : '';
  }

  if (bodyLayout) bodyLayout.classList.toggle('settings-body-layout-provider', viewId === 'provider');
  if (providerList) providerList.classList.toggle('hidden', viewId !== 'provider');

  if (viewId === 'provider') {
    setProviderProfile(settingsState.providerId);
  } else {
    if (cardGrid) cardGrid.innerHTML = renderSettingsCards(view.cards);
    if (formPanel) {
      formPanel.innerHTML = `
        ${renderSettingsFields(view.fields)}
        <div class="project-create-actions">
          <button type="button" class="ghost-action" data-open-drawer="${view.formActions.first.target}">${view.formActions.first.label}</button>
          <button type="button" class="ghost-action" data-open-modal="${view.formActions.second.target}">${view.formActions.second.label}</button>
          <button type="button" class="primary-action small">${view.formActions.primaryLabel}</button>
        </div>
      `;
    }
    if (footnoteGrid) footnoteGrid.innerHTML = renderSettingsFootnotes(view.footnotes);
  }

  document.querySelectorAll('[data-settings-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsView === viewId);
  });

  wireActionButtons(document.getElementById('settings-form-panel'));
  wireActionButtons(document.getElementById('settings-subnav'));
}

function renderResourceList(typeId, selectedId) {
  const container = document.getElementById('resource-list');
  const type = resourceCenterData[typeId];
  if (!container || !type) return;
  container.innerHTML = type.items.map((item) => `
    <button type="button" class="resource-list-item ${item.id === selectedId ? 'active' : ''}" data-resource-item="${item.id}" data-resource-owner="${typeId}">
      <strong>${item.title}</strong>
      <span>${item.summary}</span>
    </button>
  `).join('');

  container.querySelectorAll('[data-resource-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextType = button.dataset.resourceOwner;
      const itemId = button.dataset.resourceItem;
      if (nextType && itemId) setResourceCenter(nextType, itemId);
    });
  });
}

function setResourceCenter(typeId, selectedItemId) {
  const type = resourceCenterData[typeId];
  if (!type) return;
  const selected = type.items.find((item) => item.id === selectedItemId) || type.items[0];
  if (!selected) return;
  const detail = selected.detail;

  const topbarState = document.getElementById('resource-topbar-state');
  const searchInput = document.getElementById('resource-search-input');
  const listKicker = document.getElementById('resource-list-kicker');
  const listTitle = document.getElementById('resource-list-title');
  const listCount = document.getElementById('resource-list-count');
  const detailKicker = document.getElementById('resource-detail-kicker');
  const detailTitle = document.getElementById('resource-detail-title');
  const detailSummary = document.getElementById('resource-detail-summary');
  const contextKicker = document.getElementById('resource-context-kicker');
  const contextTitle = document.getElementById('resource-context-title');
  const contextText = document.getElementById('resource-context-text');

  if (topbarState) topbarState.textContent = type.topbarState;
  if (searchInput) searchInput.textContent = type.searchHint;
  if (listKicker) listKicker.textContent = type.listKicker;
  if (listTitle) listTitle.textContent = type.listTitle;
  if (listCount) listCount.textContent = type.listCount;
  if (detailKicker) detailKicker.textContent = type.detailKicker;
  if (detailTitle) detailTitle.textContent = detail.title;
  if (detailSummary) detailSummary.textContent = detail.summary;
  if (contextKicker) contextKicker.textContent = type.context.kicker;
  if (contextTitle) contextTitle.textContent = type.context.title;
  if (contextText) contextText.textContent = type.context.text;

  const metaMap = {
    origin: 'resource-meta-origin',
    version: 'resource-meta-version',
    trust: 'resource-meta-trust',
    compat: 'resource-meta-compat'
  };
  Object.entries(metaMap).forEach(([key, id]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = detail.meta[key];
  });

  detail.sections.forEach((section, index) => {
    const slot = index + 1;
    const labelNode = document.getElementById(`resource-section-${slot}-label`);
    const titleNode = document.getElementById(`resource-section-${slot}-title`);
    const textNode = document.getElementById(`resource-section-${slot}-text`);
    if (labelNode) labelNode.textContent = section.label;
    if (titleNode) titleNode.textContent = section.title;
    if (textNode) textNode.textContent = section.text;
  });

  renderResourceList(typeId, selected.id);

  document.querySelectorAll('.screen-resource-center [data-resource-type]').forEach((button) => {
    const matches = button.dataset.resourceType === typeId;
    const disabled = button.classList.contains('disabled');
    button.classList.toggle('active', matches && !disabled);
  });

  document.querySelectorAll('[data-review-resource-type]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewResourceType === typeId);
  });

  setButtonAction('resource-secondary-action', type.actions.secondary);
  setButtonAction('resource-path-action', type.actions.path);
  setButtonAction('resource-main-action', type.actions.main);
  setButtonAction('resource-import-action', type.actions.import);
  setButtonAction('resource-download-action', type.actions.download);
  setButtonAction('resource-context-path-action', type.actions.contextPath);
  setButtonAction('resource-context-main-action', type.actions.contextMain);
}

function renderRulesList(viewId, scopeId, selectedId) {
  const container = document.getElementById('rules-list');
  const scope = rulesCenterData[viewId]?.scopes?.[scopeId];
  if (!container || !scope) return;
  container.innerHTML = scope.items.map((item) => `
    <button type="button" class="resource-list-item ${item.id === selectedId ? 'active' : ''}" data-rules-item="${item.id}" data-rules-view-owner="${viewId}" data-rules-scope-owner="${scopeId}">
      <strong>${item.title}</strong>
      <span>${item.summary}</span>
    </button>
  `).join('');

  container.querySelectorAll('[data-rules-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.rulesViewOwner;
      const nextScope = button.dataset.rulesScopeOwner;
      const itemId = button.dataset.rulesItem;
      if (nextView && nextScope && itemId) setRulesCenter(nextView, nextScope, itemId);
    });
  });
}

function setRulesCenter(viewId = rulesCenterState.viewId, scopeId = rulesCenterState.scopeId, selectedItemId) {
  const view = rulesCenterData[viewId];
  if (!view) return;
  const scope = view.scopes[scopeId] || view.scopes[Object.keys(view.scopes)[0]];
  if (!scope) return;

  const stateKey = `${viewId}:${scopeId}`;
  const fallbackId = rulesCenterState.selectedItems[stateKey];
  const selected = scope.items.find((item) => item.id === selectedItemId)
    || scope.items.find((item) => item.id === fallbackId)
    || scope.items[0];
  if (!selected) return;

  rulesCenterState.viewId = viewId;
  rulesCenterState.scopeId = scopeId;
  rulesCenterState.selectedItems[stateKey] = selected.id;

  const detail = selected.detail;

  const topbarState = document.getElementById('rules-topbar-state');
  const topbarScope = document.getElementById('rules-topbar-scope');
  const searchInput = document.getElementById('rules-search-input');
  const listKicker = document.getElementById('rules-list-kicker');
  const listTitle = document.getElementById('rules-list-title');
  const listCount = document.getElementById('rules-list-count');
  const detailKicker = document.getElementById('rules-detail-kicker');
  const detailTitle = document.getElementById('rules-detail-title');
  const detailSummary = document.getElementById('rules-detail-summary');
  const scopeSummaryTitle = document.getElementById('rules-scope-summary-title');
  const scopeSummaryText = document.getElementById('rules-scope-summary-text');
  const contextKicker = document.getElementById('rules-context-kicker');
  const contextTitle = document.getElementById('rules-context-title');
  const contextText = document.getElementById('rules-context-text');

  if (topbarState) topbarState.textContent = view.topbarState;
  if (topbarScope) topbarScope.textContent = scope.topbarLabel;
  if (searchInput) searchInput.textContent = view.searchHint;
  if (listKicker) listKicker.textContent = scope.listKicker;
  if (listTitle) listTitle.textContent = scope.listTitle;
  if (listCount) listCount.textContent = scope.listCount;
  if (detailKicker) detailKicker.textContent = detail.kicker;
  if (detailTitle) detailTitle.textContent = detail.title;
  if (detailSummary) detailSummary.textContent = detail.summary;
  if (scopeSummaryTitle) scopeSummaryTitle.textContent = scope.summaryTitle;
  if (scopeSummaryText) scopeSummaryText.textContent = scope.summaryText;
  if (contextKicker) contextKicker.textContent = view.context.kicker;
  if (contextTitle) contextTitle.textContent = view.context.title;
  if (contextText) contextText.textContent = view.context.text;

  const scopeFieldMap = {
    global: ['rules-scope-global-title', 'rules-scope-global-note'],
    project: ['rules-scope-project-title', 'rules-scope-project-note'],
    node: ['rules-scope-node-title', 'rules-scope-node-note']
  };

  Object.entries(scopeFieldMap).forEach(([key, ids]) => {
    const [titleId, noteId] = ids;
    const titleNode = document.getElementById(titleId);
    const noteNode = document.getElementById(noteId);
    const scopeConfig = view.scopes[key];
    if (!scopeConfig) return;
    if (titleNode) titleNode.textContent = scopeConfig.menuTitle;
    if (noteNode) noteNode.textContent = scopeConfig.menuNote;
  });

  detail.meta.forEach((meta, index) => {
    const slot = index + 1;
    const labelNode = document.getElementById(`rules-meta-${slot}-label`);
    const valueNode = document.getElementById(`rules-meta-${slot}-value`);
    if (labelNode) labelNode.textContent = meta.label;
    if (valueNode) valueNode.textContent = meta.value;
  });

  detail.sections.forEach((section, index) => {
    const slot = index + 1;
    const labelNode = document.getElementById(`rules-section-${slot}-label`);
    const titleNode = document.getElementById(`rules-section-${slot}-title`);
    const textNode = document.getElementById(`rules-section-${slot}-text`);
    if (labelNode) labelNode.textContent = section.label;
    if (titleNode) titleNode.textContent = section.title;
    if (textNode) textNode.textContent = section.text;
  });

  if (detail.preview) {
    const previewKicker = document.getElementById('rules-preview-kicker');
    const previewTitle = document.getElementById('rules-preview-title');
    const previewText = document.getElementById('rules-preview-text');
    if (previewKicker) previewKicker.textContent = detail.preview.kicker;
    if (previewTitle) previewTitle.textContent = detail.preview.title;
    if (previewText) previewText.textContent = detail.preview.text;
    detail.preview.nodes.forEach((nodeText, index) => {
      const node = document.getElementById(`rules-preview-node-${index + 1}`);
      if (node) node.textContent = nodeText;
    });
  }

  renderRulesList(viewId, scopeId, selected.id);

  document.querySelectorAll('.screen-rules-center [data-rules-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.rulesView === viewId);
  });
  document.querySelectorAll('[data-review-rules-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewRulesView === viewId);
  });

  document.querySelectorAll('.screen-rules-center [data-rules-scope]').forEach((button) => {
    button.classList.toggle('active', button.dataset.rulesScope === scopeId);
  });
  document.querySelectorAll('[data-review-rules-scope]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewRulesScope === scopeId);
  });

  setButtonAction('rules-secondary-action', view.actions.secondary);
  setButtonAction('rules-path-action', view.actions.path);
  setButtonAction('rules-main-action', view.actions.main);
  setButtonAction('rules-import-action', view.actions.import);
  setButtonAction('rules-toolbar-main-action', view.actions.main);
  setButtonAction('rules-context-path-action', view.actions.contextPath);
  setButtonAction('rules-context-main-action', view.actions.contextMain);
}

function activateScreen(screenId) {
  closeAllLayers();
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === screenId);
  });
  document.querySelectorAll('.activity-button[data-screen-target]').forEach((button) => {
    button.classList.toggle('active', button.dataset.screenTarget === screenId);
  });
  document.querySelectorAll('[data-screen-target]').forEach((button) => {
    button.classList.toggle('active', button.dataset.screenTarget === screenId && button.classList.contains('control-chip'));
  });
}

function setDensity(mode) {
  const stage = document.querySelector('.prototype-stage');
  if (!stage) return;
  stage.dataset.densityMode = mode;
  document.querySelectorAll('[data-density]').forEach((button) => {
    button.classList.toggle('active', button.dataset.density === mode);
  });
}

function setWorkbenchDoc(docId) {
  const doc = workbenchDocs[docId];
  if (!doc) return;
  workbenchState.docId = docId;
  const focusBlock = doc.editor.find((block) => block.type === 'callout');
  const activeDocChip = document.getElementById('workbench-active-doc-chip');
  const docTitle = document.getElementById('workbench-doc-title');
  const docSubtitle = document.getElementById('workbench-doc-subtitle');
  const docHeadline = document.getElementById('document-headline');
  const docSummary = document.getElementById('document-summary');
  const docFocusTitle = document.getElementById('workbench-focus-title');
  const docFocusText = document.getElementById('workbench-focus-text');
  const editorSurface = document.getElementById('editor-surface');
  const aiDocumentChip = document.getElementById('ai-document-chip');
  const aiComposerContext = document.getElementById('ai-composer-context');

  if (activeDocChip) activeDocChip.textContent = doc.chip;
  if (docTitle) docTitle.textContent = doc.title;
  if (docSubtitle) docSubtitle.textContent = doc.subtitle;
  if (docHeadline) docHeadline.textContent = doc.title;
  if (docSummary) docSummary.textContent = doc.summary;
  if (docFocusTitle) docFocusTitle.textContent = focusBlock ? focusBlock.title : '当前重点';
  if (docFocusText) docFocusText.textContent = focusBlock ? focusBlock.text : doc.summary;
  if (editorSurface) editorSurface.innerHTML = renderEditor(doc.editor);
  if (aiDocumentChip) aiDocumentChip.textContent = doc.chip;
  if (aiComposerContext) aiComposerContext.textContent = doc.chip;

  document.querySelectorAll('.tree-item[data-doc]').forEach((item) => {
    item.classList.toggle('active', item.dataset.doc === docId);
  });

  document.querySelectorAll('[data-review-doc]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewDoc === docId);
  });
}

function setWorkbenchSession(sessionId) {
  const session = workbenchSessions[sessionId];
  if (!session) return;
  const sessionChip = document.getElementById('workbench-active-session-chip');
  const sessionTitle = document.getElementById('ai-session-title');
  const sessionSubtitle = document.getElementById('ai-session-subtitle');
  const stageChip = document.getElementById('ai-stage-chip');
  const conversation = document.getElementById('workbench-conversation');

  if (sessionChip) sessionChip.textContent = session.chip;
  if (sessionTitle) sessionTitle.textContent = session.title;
  if (sessionSubtitle) sessionSubtitle.textContent = session.subtitle;
  if (stageChip) stageChip.textContent = session.stage;
  if (conversation) conversation.innerHTML = renderMessages(session.messages);
  shellState.stage = session.stage;
  updateProjectBadges();

  document.querySelectorAll('.screen-workbench .session-button[data-session]').forEach((button) => {
    button.classList.toggle('active', button.dataset.session === sessionId);
  });

  document.querySelectorAll('.screen-workbench [data-session-members]').forEach((button) => {
    const members = (button.dataset.sessionMembers || '').split(',').map((item) => item.trim()).filter(Boolean);
    button.classList.toggle('active', members.includes(sessionId));
  });

  document.querySelectorAll('[data-review-session]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewSession === sessionId);
  });
}

function setFlowSession(sessionId) {
  const session = flowSessions[sessionId];
  if (!session) return;
  flowInspectorState.activeSessionId = sessionId;
  const composer = document.getElementById('flow-composer-context');
  const conversation = document.getElementById('flow-conversation');

  if (composer) composer.textContent = session.composerContext;
  if (conversation) conversation.innerHTML = renderMessages(session.messages);
  closeFlowNodeInspector();

  document.querySelectorAll('.screen-orchestration .session-button[data-flow-session]').forEach((button) => {
    button.classList.toggle('active', button.dataset.flowSession === sessionId);
  });

  document.querySelectorAll('[data-review-flow-session]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewFlowSession === sessionId);
  });
}

function setFlowContext(contextId) {
  const context = flowContexts[contextId];
  if (!context) return;

  document.querySelectorAll('[data-flow-context]').forEach((button) => {
    button.classList.toggle('active', button.dataset.flowContext === contextId);
  });
}

function getLayerElements() {
  return document.querySelectorAll('.config-modal, .surface-drawer, .context-menu-popover');
}

function hasVisibleLayers() {
  return Array.from(getLayerElements()).some((layer) => !layer.classList.contains('hidden'));
}

function openLayer(modalId) {
  const scrim = document.getElementById('prototype-scrim');
  const modal = document.getElementById(modalId);
  if (!scrim || !modal) return;
  closeAllLayers();
  scrim.classList.remove('hidden');
  modal.classList.remove('hidden');
}

function closeLayer(modalId) {
  const scrim = document.getElementById('prototype-scrim');
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
  if (scrim && !hasVisibleLayers()) scrim.classList.add('hidden');
}

function closeAllLayers() {
  const scrim = document.getElementById('prototype-scrim');
  if (scrim) scrim.classList.add('hidden');
  getLayerElements().forEach((layer) => {
    layer.classList.add('hidden');
  });
}

const welcomeManageLabels = {
  project: '项目名称',
  draft: '草稿 Flow',
  template: '模板名称'
};

const welcomeManageActions = {
  remove: {
    title: '确认从最近移除',
    button: '确认从最近移除',
    copy: '仅从当前欢迎页列表移除，不删除原始内容。'
  },
  delete: {
    title: '确认彻底删除',
    button: '确认删除',
    copy: '将直接删除原始内容及其最近记录，无法恢复。',
    danger: true
  }
};

function setWelcomeManageModal(button) {
  if (!button) return;
  const actionId = button.dataset.welcomeManage || 'remove';
  const action = welcomeManageActions[actionId] || welcomeManageActions.remove;
  const scopeId = button.dataset.welcomeEntryScope || 'project';
  const kicker = document.getElementById('welcome-manage-kicker');
  const title = document.getElementById('welcome-manage-title');
  const entryType = document.getElementById('welcome-manage-entry-type');
  const entryName = document.getElementById('welcome-manage-entry-name');
  const copy = document.getElementById('welcome-manage-copy');
  const primary = document.getElementById('welcome-manage-primary');
  if (kicker) kicker.textContent = button.dataset.welcomeEntryKicker || '欢迎页入口';
  if (title) title.textContent = action.title;
  if (entryType) entryType.textContent = welcomeManageLabels[scopeId] || '条目名称';
  if (entryName) entryName.textContent = button.dataset.welcomeEntryName || '未命名条目';
  if (copy) copy.textContent = button.dataset.welcomeEntryCopy || action.copy;
  if (primary) {
    primary.textContent = action.button;
    primary.classList.toggle('danger', Boolean(action.danger));
  }
}

function setFlowNodeSelection(nodeId) {
  document.querySelectorAll('.flow-node[data-node]').forEach((button) => {
    button.classList.toggle('flow-node-current', button.dataset.node === nodeId);
  });
}

function fillFlowNodeInspector(record) {
  if (!record) return;
  const title = document.getElementById('flow-node-inspector-title');
  const summary = document.getElementById('flow-node-inspector-summary');
  const type = document.getElementById('flow-node-inspector-type');
  const binding = document.getElementById('flow-node-inspector-binding');
  const workflowLayer = document.getElementById('flow-node-layer-workflow');
  const runtimeLayer = document.getElementById('flow-node-layer-runtime');
  const governanceLayer = document.getElementById('flow-node-layer-governance');
  const evolutionLayer = document.getElementById('flow-node-layer-evolution');
  const composer = document.getElementById('flow-composer-context');

  if (title) title.textContent = record.title;
  if (summary) summary.textContent = record.summary;
  if (type) type.textContent = record.typeLabel;
  if (binding) binding.textContent = record.binding;
  if (workflowLayer) workflowLayer.textContent = record.workflowLayer;
  if (runtimeLayer) runtimeLayer.textContent = record.runtimeLayer;
  if (governanceLayer) governanceLayer.textContent = record.governanceLayer;
  if (evolutionLayer) evolutionLayer.textContent = record.evolutionLayer;
  if (composer) composer.textContent = record.title;
}

function openFlowNodeInspector(nodeId) {
  const record = flowNodes[nodeId];
  const chatView = document.getElementById('flow-chat-view');
  const inspectorView = document.getElementById('flow-node-inspector-view');
  if (!record || !chatView || !inspectorView) return;
  closeLayer('node-menu');
  closeLayer('canvas-menu');
  flowInspectorState.selectedNodeId = nodeId;
  fillFlowNodeInspector(record);
  setFlowNodeSelection(nodeId);
  chatView.classList.add('hidden');
  inspectorView.classList.remove('hidden');
}

function openFlowModuleInspector(moduleId) {
  const record = flowModuleDefinitions[moduleId];
  const chatView = document.getElementById('flow-chat-view');
  const inspectorView = document.getElementById('flow-node-inspector-view');
  if (!record || !chatView || !inspectorView) return;
  closeLayer('node-menu');
  closeLayer('canvas-menu');
  fillFlowNodeInspector(record);
  setFlowNodeSelection(flowInspectorState.selectedNodeId);
  chatView.classList.add('hidden');
  inspectorView.classList.remove('hidden');
}

function closeFlowNodeInspector() {
  const chatView = document.getElementById('flow-chat-view');
  const inspectorView = document.getElementById('flow-node-inspector-view');
  const composer = document.getElementById('flow-composer-context');
  const activeSession = flowSessions[flowInspectorState.activeSessionId];
  if (composer && activeSession) composer.textContent = activeSession.composerContext;
  if (chatView) chatView.classList.remove('hidden');
  if (inspectorView) inspectorView.classList.add('hidden');
}

function setNodeModal(nodeId) {
  openFlowNodeInspector(nodeId);
}

function wireFlowNodeButton(button) {
  if (!button || button.dataset.wiredFlowNode === 'true') return;
  button.dataset.wiredFlowNode = 'true';
  button.addEventListener('click', () => {
    const nodeId = button.dataset.node;
    if (nodeId) openFlowNodeInspector(nodeId);
  });
}

function updateFlowModuleGroups() {
  document.querySelectorAll('.flow-module-group').forEach((group) => {
    const hasVisibleTile = Array.from(group.querySelectorAll('.flow-module-tile')).some((tile) => !tile.classList.contains('hidden'));
    group.classList.toggle('is-empty', !hasVisibleTile);
  });
}

function createCanvasNodeButton(nodeId, moduleId, point) {
  const template = flowModuleDefinitions[moduleId];
  const canvas = document.getElementById('flow-canvas-frame');
  if (!template || !canvas) return;

  const button = document.createElement('button');
  const typeKey = moduleId.startsWith('subflow') ? 'subflow' : moduleId.replace('module-', '');
  const top = Math.max(164, Math.min(point.top, Math.max(164, canvas.clientHeight - 124)));
  const left = Math.max(92, Math.min(point.left, Math.max(92, canvas.clientWidth - 232)));

  button.type = 'button';
  button.className = `flow-node flow-node-generated ${flowNodeClassMap[typeKey] || ''}`.trim();
  button.dataset.node = nodeId;
  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
  button.innerHTML = `
    <span class="node-kicker">${template.typeLabel}</span>
    <strong>${template.title}</strong>
    <p>${template.summary}</p>
  `;

  canvas.appendChild(button);
  wireFlowNodeButton(button);
  openFlowNodeInspector(nodeId);
}

function wireFlowModuleTile(tile) {
  if (!tile || tile.dataset.wiredFlowModule === 'true') return;
  tile.dataset.wiredFlowModule = 'true';

  tile.addEventListener('click', () => {
    const moduleId = tile.dataset.flowModuleId;
    if (moduleId) openFlowModuleInspector(moduleId);
  });

  tile.addEventListener('dragstart', (event) => {
    const moduleId = tile.dataset.flowModuleId;
    if (!moduleId) return;
    tile.classList.add('dragging');
    event.dataTransfer?.setData('application/cyber-editor-node', moduleId);
    event.dataTransfer?.setData('text/plain', moduleId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  });

  tile.addEventListener('dragend', () => {
    tile.classList.remove('dragging');
    document.getElementById('flow-canvas-frame')?.classList.remove('is-drop-target');
  });

  tile.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const moduleId = tile.dataset.flowModuleId;
    if (moduleId) openFlowModuleInspector(moduleId);
  });
}

function wireActionButtons(root = document) {
  if (!root) return;

  root.querySelectorAll('[data-screen-target]').forEach((button) => {
    if (button.dataset.wiredScreen === 'true') return;
    button.dataset.wiredScreen = 'true';
    button.addEventListener('click', () => {
      if (button.classList.contains('is-disabled')) return;
      const requiresProject = button.dataset.requiresProject === 'true';
      if (requiresProject && !shellState.hasProject) return;
      const autoProject = button.dataset.autoProject;
      if (autoProject) {
        const nextStage = autoProject === 'draft' ? '规划' : '需求';
        setProjectPresence(true, { stage: nextStage, unsaved: '1' });
      }
      const target = button.dataset.screenTarget;
      if (target) activateScreen(target);
      const flowContextTarget = button.dataset.flowContextTarget;
      if (flowContextTarget) setFlowContext(flowContextTarget);
      const rulesViewTarget = button.dataset.rulesViewTarget;
      const rulesScopeTarget = button.dataset.rulesScopeTarget;
      const rulesItemTarget = button.dataset.rulesItemTarget;
      if (rulesViewTarget || rulesScopeTarget || rulesItemTarget) {
        setRulesCenter(
          rulesViewTarget || rulesCenterState.viewId,
          rulesScopeTarget || rulesCenterState.scopeId,
          rulesItemTarget
        );
      }
    });
  });

  root.querySelectorAll('[data-open-modal], [data-open-drawer], [data-open-layer]').forEach((button) => {
    if (button.dataset.wiredLayer === 'true') return;
    button.dataset.wiredLayer = 'true';
    button.addEventListener('click', () => {
      const target = button.dataset.openModal || button.dataset.openDrawer || button.dataset.openLayer;
      if (target) openLayer(target);
    });
  });

  root.querySelectorAll('[data-close-layer], [data-close-modal]').forEach((button) => {
    if (button.dataset.wiredClose === 'true') return;
    button.dataset.wiredClose = 'true';
    button.addEventListener('click', () => {
      const modalId = button.dataset.closeLayer || button.dataset.closeModal;
      if (modalId) closeLayer(modalId);
    });
  });

  root.querySelectorAll('[data-welcome-manage]').forEach((button) => {
    if (button.dataset.wiredWelcomeManage === 'true') return;
    button.dataset.wiredWelcomeManage = 'true';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      setWelcomeManageModal(button);
      openLayer('welcome-manage-modal');
    });
  });
}

document.querySelectorAll('[data-density]').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.density;
    if (mode) setDensity(mode);
  });
});

document.querySelectorAll('[data-workbench-pane]').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.workbenchPane;
    if (!mode) return;
    if (button.classList.contains('control-chip')) activateScreen('workbench');
    setWorkbenchPane(mode);
  });
});

document.querySelectorAll('.tree-item[data-doc]').forEach((button) => {
  button.addEventListener('click', () => {
    const docId = button.dataset.doc;
    if (docId) setWorkbenchDoc(docId);
  });
});

document.querySelectorAll('.screen-workbench .session-button[data-session]').forEach((button) => {
  button.addEventListener('click', () => {
    const sessionId = button.dataset.session;
    if (sessionId) setWorkbenchSession(sessionId);
  });
});

document.querySelectorAll('.screen-resource-center [data-resource-type]').forEach((button) => {
  button.addEventListener('click', () => {
    const typeId = button.dataset.resourceType;
    if (typeId) setResourceCenter(typeId);
  });
});

document.querySelectorAll('[data-review-resource-type]').forEach((button) => {
  button.addEventListener('click', () => {
    const typeId = button.dataset.reviewResourceType;
    if (!typeId) return;
    activateScreen('resource-center');
    setResourceCenter(typeId);
  });
});

document.querySelectorAll('.screen-rules-center [data-rules-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const viewId = button.dataset.rulesView;
    if (!viewId) return;
    setRulesCenter(viewId, rulesCenterState.scopeId);
  });
});

document.querySelectorAll('.screen-rules-center [data-rules-scope]').forEach((button) => {
  button.addEventListener('click', () => {
    const scopeId = button.dataset.rulesScope;
    if (!scopeId) return;
    setRulesCenter(rulesCenterState.viewId, scopeId);
  });
});

document.querySelectorAll('[data-review-rules-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const viewId = button.dataset.reviewRulesView;
    if (!viewId) return;
    activateScreen('rules-center');
    setRulesCenter(viewId, rulesCenterState.scopeId);
  });
});

document.querySelectorAll('[data-review-rules-scope]').forEach((button) => {
  button.addEventListener('click', () => {
    const scopeId = button.dataset.reviewRulesScope;
    if (!scopeId) return;
    activateScreen('rules-center');
    setRulesCenter(rulesCenterState.viewId, scopeId);
  });
});

document.querySelectorAll('[data-review-doc]').forEach((button) => {
  button.addEventListener('click', () => {
    const docId = button.dataset.reviewDoc;
    if (!docId) return;
    activateScreen('workbench');
    setWorkbenchDoc(docId);
  });
});

document.querySelectorAll('[data-review-session]').forEach((button) => {
  button.addEventListener('click', () => {
    const sessionId = button.dataset.reviewSession;
    if (!sessionId) return;
    activateScreen('workbench');
    setWorkbenchSession(sessionId);
  });
});

document.querySelectorAll('[data-settings-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const viewId = button.dataset.settingsView;
    if (!viewId) return;
    activateScreen('settings');
    setSettingsView(viewId);
  });
});

document.querySelectorAll('[data-toggle-session-rail]').forEach((button) => {
  button.addEventListener('click', () => {
    const rail = button.closest('.workbench-session-rail');
    if (!rail) return;
    const nextState = rail.dataset.sessionLayout === 'expanded' ? 'collapsed' : 'expanded';
    rail.dataset.sessionLayout = nextState;
    const label = nextState === 'expanded' ? '折叠会话轨' : '展开会话轨';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  });
});

document.querySelectorAll('[data-expand-session-group]').forEach((button) => {
  button.addEventListener('click', () => {
    const rail = button.closest('.workbench-session-rail');
    if (!rail) return;
    rail.dataset.sessionLayout = 'expanded';
    const toggle = rail.querySelector('[data-toggle-session-rail]');
    if (toggle) {
      toggle.setAttribute('aria-label', '折叠会话轨');
      toggle.setAttribute('title', '折叠会话轨');
    }
  });
});

document.querySelectorAll('.screen-orchestration .session-button[data-flow-session]').forEach((button) => {
  button.addEventListener('click', () => {
    const sessionId = button.dataset.flowSession;
    if (sessionId) setFlowSession(sessionId);
  });
});

document.querySelectorAll('[data-thinking-node]').forEach((button) => {
  button.addEventListener('click', () => {
    const nodeId = button.dataset.thinkingNode;
    if (nodeId) setThinkingNode(nodeId);
  });
});

document.querySelectorAll('[data-thinking-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    thinkingChainState.hideRejected = !thinkingChainState.hideRejected;
    updateThinkingCanvas();
  });
});

document.querySelectorAll('[data-thinking-drag]').forEach((button) => {
  button.addEventListener('click', () => {
    thinkingChainState.dragMode = !thinkingChainState.dragMode;
    updateThinkingCanvas();
  });
});

document.querySelectorAll('[data-thinking-zoom]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.thinkingZoom;
    if (action === 'out') thinkingChainState.zoom = Math.max(70, thinkingChainState.zoom - 10);
    if (action === 'in') thinkingChainState.zoom = Math.min(140, thinkingChainState.zoom + 10);
    if (action === 'fit') thinkingChainState.zoom = 100;
    if (action === 'reset') thinkingChainState.zoom = 100;
    updateThinkingCanvas();
  });
});

document.querySelectorAll('[data-review-flow-session]').forEach((button) => {
  button.addEventListener('click', () => {
    const sessionId = button.dataset.reviewFlowSession;
    if (!sessionId) return;
    activateScreen('orchestration');
    setFlowSession(sessionId);
  });
});

document.querySelectorAll('[data-flow-context]').forEach((button) => {
  button.addEventListener('click', () => {
    const contextId = button.dataset.flowContext;
    if (!contextId) return;
    const autoProject = button.dataset.autoProject;
    if (autoProject) {
      setProjectPresence(true, {
        stage: autoProject === 'draft' ? '规划' : '需求',
        unsaved: '1'
      });
    }
    activateScreen('orchestration');
    setFlowContext(contextId);
  });
});

document.querySelectorAll('.flow-node[data-node]').forEach((button) => {
  wireFlowNodeButton(button);
});

document.querySelectorAll('[data-open-flow-node-inspector]').forEach((button) => {
  if (button.dataset.wiredFlowInspector === 'true') return;
  button.dataset.wiredFlowInspector = 'true';
  button.addEventListener('click', () => {
    const target = button.dataset.openFlowNodeInspector;
    if (!target) return;
    if (!button.closest('.screen-orchestration')) activateScreen('orchestration');
    closeLayer('node-menu');
    if (target === 'current') {
      openFlowNodeInspector(flowInspectorState.selectedNodeId || 'analysis');
      return;
    }
    openFlowNodeInspector(target);
  });
});

document.querySelectorAll('[data-close-flow-node-inspector]').forEach((button) => {
  if (button.dataset.wiredFlowInspectorClose === 'true') return;
  button.dataset.wiredFlowInspectorClose = 'true';
  button.addEventListener('click', () => {
    closeFlowNodeInspector();
  });
});

document.querySelectorAll('.flow-module-tile').forEach((tile) => {
  wireFlowModuleTile(tile);
});

document.querySelectorAll('[data-flow-module-edit]').forEach((button) => {
  if (button.dataset.wiredFlowModuleEdit === 'true') return;
  button.dataset.wiredFlowModuleEdit = 'true';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const moduleId = button.dataset.flowModuleEdit;
    if (moduleId) openFlowModuleInspector(moduleId);
  });
});

document.querySelectorAll('[data-flow-module-delete]').forEach((button) => {
  if (button.dataset.wiredFlowModuleDelete === 'true') return;
  button.dataset.wiredFlowModuleDelete = 'true';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    button.closest('.flow-module-tile')?.remove();
    updateFlowModuleGroups();
  });
});

document.querySelector('[data-flow-module-search]')?.addEventListener('input', (event) => {
  const query = String(event.target.value || '').trim().toLowerCase();
  document.querySelectorAll('.flow-module-tile').forEach((tile) => {
    const text = `${tile.dataset.flowModuleTitle || ''} ${tile.dataset.flowModuleCopy || ''} ${tile.textContent || ''}`.toLowerCase();
    tile.classList.toggle('hidden', Boolean(query) && !text.includes(query));
  });
  updateFlowModuleGroups();
});

const flowCanvasFrame = document.getElementById('flow-canvas-frame');

flowCanvasFrame?.addEventListener('dragover', (event) => {
  const moduleId = event.dataTransfer?.getData('application/cyber-editor-node') || event.dataTransfer?.getData('text/plain');
  if (!moduleId) return;
  event.preventDefault();
  flowCanvasFrame.classList.add('is-drop-target');
});

flowCanvasFrame?.addEventListener('dragleave', (event) => {
  const related = event.relatedTarget;
  if (related instanceof Node && flowCanvasFrame.contains(related)) return;
  flowCanvasFrame.classList.remove('is-drop-target');
});

flowCanvasFrame?.addEventListener('drop', (event) => {
  const moduleId = event.dataTransfer?.getData('application/cyber-editor-node') || event.dataTransfer?.getData('text/plain');
  const template = flowModuleDefinitions[moduleId];
  if (!moduleId || !template) return;
  event.preventDefault();
  flowCanvasFrame.classList.remove('is-drop-target');

  const rect = flowCanvasFrame.getBoundingClientRect();
  const left = event.clientX - rect.left - 110;
  const top = event.clientY - rect.top - 52;
  const nodeId = `flow-generated-${++flowGeneratedNodeCounter}`;

  flowNodes[nodeId] = createFlowNodeRecord({
    ...template,
    title: template.title,
    summary: template.summary
  });

  createCanvasNodeButton(nodeId, moduleId, { left, top });
});

updateFlowModuleGroups();

document.getElementById('prototype-scrim')?.addEventListener('click', () => {
  closeAllLayers();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeFlowNodeInspector();
  closeAllLayers();
});

wireActionButtons(document);
setWorkbenchPane('files');
setWorkbenchDoc('baseline');
setWorkbenchSession('requirements');
setResourceCenter('template');
setRulesCenter('rules', 'project');
setSettingsView('provider');
setFlowContext('project');
setFlowSession('flow-main');
setThinkingNode('premise-project');
updateThinkingCanvas();



