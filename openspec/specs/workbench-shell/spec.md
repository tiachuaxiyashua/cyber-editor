# workbench-shell Specification

## Purpose
Define the desktop shell, activity switching, secondary-window coordination, and progressive-disclosure rules for first-level workbench surfaces.
## Requirements
### Requirement: Desktop shell SHALL open the three-pane workbench
The desktop shell SHALL treat pane widths and collapsible state as persisted workbench layout state rather than transient view details.

#### Scenario: Restoring persisted three-pane widths
- **WHEN** the user reopens the workbench in the same mode after resizing panes
- **THEN** the system SHALL restore the persisted pane widths within safe min/max constraints
- **AND** SHALL avoid resetting the layout to defaults unless the stored layout is invalid

#### Scenario: Preventing pane collision at compact widths
- **WHEN** the window shrinks below the preferred three-pane width
- **THEN** the shell SHALL apply its compact-width fallback rules
- **AND** SHALL keep the workbench usable instead of letting panes overlap or collapse into unreadable widths

### Requirement: Desktop shell SHALL coordinate secondary workbench windows for one project session
The shell SHALL allow secondary document windows that share one active project session while keeping window-local view state.

#### Scenario: Opening a secondary document window
- **WHEN** the user opens a document in a secondary window for the current project
- **THEN** the system SHALL share the same project truth with the primary window
- **AND** SHALL keep the secondary window's local view state independent

### Requirement: Desktop shell SHALL keep low-frequency actions in deep-entry paths
Import and install actions SHALL remain reachable, but they SHALL not dominate first-level workbench surfaces.

#### Scenario: Reaching an import action from an advanced path
- **WHEN** the user needs a low-frequency import or install action
- **THEN** the system SHALL expose it through a deeper entry path such as command palette, overflow, or dedicated center
- **AND** SHALL keep the first-level page focused on current work

### Requirement: Desktop shell SHALL expose a first-level thinking-chain surface
The desktop shell SHALL expose a dedicated idea-map page as a first-level workbench surface instead of burying that capability inside raw chat history or temporary overlays.

#### Scenario: Browsing a complex idea map with layered relations
- **WHEN** the user opens an idea map that contains multiple levels, multiple parent relations, exploration branches, discarded branches, and landed documents
- **THEN** the shell SHALL render the map as a layered DAG with the core idea on the left and landed outputs on the right
- **AND** SHALL keep branch depth visually understandable instead of stacking all nodes into one apparent level

#### Scenario: Zooming and panning a complex map
- **WHEN** the user zooms with the mouse wheel, zoom controls, or Fit View and drags the canvas through empty space
- **THEN** the shell SHALL keep the grid and node layer aligned to the current viewport
- **AND** SHALL preserve node proportions during zoom instead of warping card shape or exposing invalid blank regions

#### Scenario: Inspecting discarded branches and node rationale
- **WHEN** the user toggles discarded branches or opens node details
- **THEN** the shell SHALL support hiding and restoring discarded branches without losing the underlying graph state
- **AND** SHALL expose node tags, rationale, and evidence in collapsible detail sections

### Requirement: Desktop shell SHALL preserve usable pane layout across resize and relaunch
The desktop shell SHALL preserve user-adjusted pane widths across relaunch while keeping the center work area usable at compact widths.

#### Scenario: Relaunching after pane resize
- **WHEN** the user resizes the primary sidebar and contextual AI pane, closes the app, and relaunches it
- **THEN** the shell SHALL restore those pane widths within safe bounds
- **AND** SHALL not silently reset the layout unless the persisted state is invalid

### Requirement: 思路地图画布必须支持自动布局叠加用户微调

思路地图页面 MUST 先使用阶段化自动布局生成主结构，再允许用户拖拽微调。

#### Scenario: 自动布局 + 微调共存
- **WHEN** 思路地图首次打开
- **THEN** 系统必须展示固定阶段列的自动布局
- **AND** 用户拖拽任意节点后，该节点位置必须覆盖自动布局结果

### Requirement: 思路地图回归必须基于真实保留项目

思路地图验收 MUST 包含基于打包程序和保留复杂项目的真实回归。

#### Scenario: 打包态真实项目回归
- **WHEN** 运行思路地图打包态回归
- **THEN** 系统必须使用保留的复杂项目目录
- **AND** 生成总览图、详情图和拖拽复开图

