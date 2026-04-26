# INF-032 Canvas layout state store

## 1. 基本信息
- 类型：内部功能
- 所属层级：编排层 / 画布状态 / 布局
- MSABC 分类：S
- 当前状态：部分完成
- 关联页面：编排页画布
- 共享实现基线：[编排与流程资产](README.md)

## 2. 责任与完成定义
### 2.1 服务责任
1. 保存节点坐标、缩放、平移、选中态和面板状态。
2. 保证普通编辑不会重置用户布局。

### 2.2 完成定义
1. 节点位置属于 Flow 草稿一部分。
2. 缩放和平移属于用户会话布局状态。
3. Inspector 编辑、资产切换、模式切换不重置节点位置。

## 3. 核心接口
1. `updateNodePosition(flowId, nodeId, position)`
2. `updateViewport(flowId, viewport)`
3. `loadCanvasState(flowId)`

## 4. 数据结构
```ts
type CanvasLayoutState = {
  viewport: { x: number; y: number; zoom: number };
  selectedNodeIds: string[];
  paneLayout: {
    leftWidth: number;
    rightWidth: number;
  };
};
```

## 5. 实现要求
1. 节点位置写入 Flow 草稿。
2. 视口状态可独立保存。
3. 节点拖拽结束时而不是每一帧都落盘。

## 6. 校验与阻断
1. 非结构变更不得覆盖节点位置。
2. 恢复失败时至少保留节点结构，不得出现空画布。

## 7. 自动测试
### 7.1 单元
1. 节点位置更新
2. 视口状态保存
3. 非结构变更不重置位置

### 7.2 集成
1. 拖拽节点后切换资产类型
2. 重开 Flow 后恢复节点位置和视口

## 8. 不允许的错误实现
1. 节点位置只存在 React 状态里。
2. Inspector 编辑后重置节点布局。
3. 视口恢复和节点恢复互相覆盖。

## 9. 当前审计结论
- 审计状态：部分完成
- 审计说明：画布布局状态仍缺对“普通编辑不重置布局”的系统级保护。
