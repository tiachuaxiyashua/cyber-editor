# F-129 GStack 软件交付工作流模板

## 1. 功能定义
把 `gstack-main` 的软件交付方法论提取为 Cyber Editor 的默认模板之一，供用户直接用于软件交付、评审、QA、发布和复盘场景。

- MSABC 分类：A
- 当前状态：部分完成

## 1.1 代码反哺状态
- 当前运行资产中存在 `gstack-office-hours`，名称为 `GStack Office Hours`，文件位于 `src/shared/template-manifests/gstack-office-hours.json` 与 `src/shared/template-packages/gstack-office-hours.json`。
- 当前运行资产中不存在名为 `GStack 软件交付` 或 `gstack-software-factory` 的完整软件交付模板；`software-factory` 是独立的默认“软件工厂”模板。
- 已有证据：`tests/e2e/platform-mvp.spec.ts` 和 `tests/e2e/packaged-smoke.spec.ts` 都断言资源中心可见 `GStack Office Hours`；这只能证明 GStack 参考方法论的 office-hours 模板可见，不能证明 F-129 的完整软件交付模板已完成。
- 文档结论：本条保持 `部分完成`。当前完成的是 GStack office-hours 模板资产与参考分析落库；完整软件交付模板、角色分工、review/QA/ship/retro 主流程和真实用户路径仍未完成。

## 2. 目标
- 不是复用 GStack 的浏览器守护进程。
- 而是复用其工作流方法论、角色分工、审查门槛和交付节奏。

## 3. 模板内容
- 主流程：
  - office-hours
  - ceo review
  - design review
  - engineering review
  - implementation plan
  - review
  - qa
  - ship
  - retro
- 默认角色：
  - 需求主持人
  - CEO 评审员
  - 设计评审员
  - 工程评审员
  - QA 审查员
  - 发布总结员
  - 复盘整理员

## 4. 使用方式
- 当前代码中可在资源中心看到 `GStack Office Hours`。
- `GStack 软件交付` 是目标模板名称，尚未作为运行资产落到默认模板包中。
- 完整完成后，应既可“从模板创建工程”，也可“从模板直接开始编排”。

## 5. 当前完成范围
- 已把 `GStack Office Hours` 作为默认模板资产加入共享模板目录。
- 已有 GStack 工程分析与模板提取报告，说明不复用浏览器守护进程，只复用方法论。
- 尚未把 `GStack 软件交付` 的完整软件交付主流程和角色分工落为默认模板资产。
- 尚未完成基于真实用户路径的完整运行验证，因此状态为“部分完成”。

## 6. 测试要求
- 模板中心可见
- 选择后可创建工程
- 选择后可创建无工程 Flow 草稿
- 模板内流程和角色数量符合定义

## 显式测试 Oracle
### 最小输入样例
1. 当前已实现样例：在资源中心选择 `GStack Office Hours` 默认模板。
2. 目标完成样例：在模板中心选择 `GStack 软件交付` 默认模板，并从模板创建工程或直接开始无工程 Flow 草稿。

### 主动作
1. 打开模板中心。
2. 当前阶段先验证 `GStack Office Hours` 可见。
3. 完整完成后，再验证 `GStack 软件交付` 的“从模板创建工程”和“从模板直接开始编排”两条入口。

### 成功判定
1. 当前阶段：资源中心可见 `GStack Office Hours`，且该模板来自 `src/shared/template-packages/gstack-office-hours.json`。
2. 完整完成：模板中心可见 `GStack 软件交付`。
3. 完整完成：模板至少包含 office-hours、ceo review、design review、engineering review、implementation plan、review、qa、ship、retro 主流程节点。
4. 完整完成：模板至少包含需求主持人、CEO 评审员、设计评审员、工程评审员、QA 审查员、发布总结员、复盘整理员角色。

### 文件与状态判定
1. 当前代码只允许把 `GStack Office Hours` 作为已落库模板证据。
2. 不得把 `GStack Office Hours` 的可见性当成 `GStack 软件交付` 完成证据。
3. 完整完成后，从模板创建工程的工程模板来源、流程草稿和角色配置必须可追溯到 `GStack 软件交付`。
4. 完整完成后，从模板直接开始编排应进入无工程 Flow 草稿，不写成已保存工程。
5. 未经过完整模板资产与真实用户路径验证前，本条状态保持 `部分完成`。

### 错误与边界判定
1. 不复用 GStack 浏览器守护进程。
2. 不把 GStack 模板写成 Cyber Editor 唯一产品场景。
3. 模板缺少流程或角色时必须阻断安装或标记不可用。

## Code Uniqueness Links
- [05-模板中心与双主入口代码契约](../../03-代码契约与唯一性/05-模板中心与双主入口代码契约.md)
- [38-模板与导出详细时序图](../../03-代码契约与唯一性/38-模板与导出详细时序图.md)

