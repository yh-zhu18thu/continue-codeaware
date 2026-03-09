# 认知状态驱动知识卡片升级实现指南（Implementation Guide）

## 0. 文档目标

本实现指南将 `COGNITION_AWARE_KNOWLEDGE_GENERATION_PLAN.md` 的策略目标落地为可执行的工程方案，重点覆盖：

1. 认知意图驱动的知识卡片生成。
2. 三视图卡片交互与懂/不懂反馈闭环。
3. 基于交互证据的知识状态更新与一跳传播。
4. 将知识状态追踪整合为独立模块，便于后续参数与算法迭代。
5. **硬约束：彻底移除 Knowledge Card 高亮效果，且其不再参与任何 highlight link。**

---

## 1. 硬约束与边界

### 1.1 高优先级硬约束（必须先做）

- `KnowledgeCard` 不再触发 `highlight`。
- `KnowledgeCard` 不再接收 `isHighlighted / isFlickering / onHighlightEvent / onClearHighlight` 的行为逻辑（可保留兼容字段一版，但行为必须禁用）。
- `updateHighlight` 链路中，`sourceType = "knowledgeCard"` 分支应删除或短路为 no-op。
- Step/Code/HighLevelStep 的高亮联动保留；KnowledgeCard 完全退出高亮生态。

### 1.2 兼容策略

- UI 层允许在 1 个小版本内保留旧 props（避免一次性大面积重构），但内部必须不再生效。
- logger 事件可暂时保留 `knowledge card viewed` 等日志，但移除高亮相关日志字段。

### 1.3 非目标（本轮不做）

- 多跳传播（>1 hop）。
- 动态学习率自动调参。
- Knowledge card 到 code chunk 的精细映射重建（当前依旧基于 step 级上下文）。

---

## 2. 当前实现现状（用于决策）

### 2.1 已具备能力

- 认知节点、边类型、`conditionalMasteryProbability` 类型定义已存在。
- 初始化流程能产出：knowledge points、relations、knowledge->step、knowledge->code-chunk、node mastery baseline。
- 已有 SAQ 判题链路（LLM 评估正确/错误 + remarks）。

### 2.2 关键缺口

- 现有 `nodeMasteryScores` 仅存储，不含交互驱动更新算法。
- 现有知识卡片主题生成仍偏“内容生成”，尚未绑定认知意图 + mastery 覆盖最小化。
- 多处旧映射逻辑处于 TODO/禁用状态，不能作为新方案依赖核心。

---

## 3. 总体实施顺序（优化后）

> 原则：先切断错误耦合（高亮），再建立数据基础，再上算法与 UI。

### Phase A（P0）: 去耦与稳定化（2-3 天）

目标：先把 KnowledgeCard 从 highlight 系统中彻底剥离，避免后续链路复杂性。

交付：

1. 删除 KnowledgeCard 触发 highlight 的入口。
2. 删除 CodeAware 页面中对 `knowledgeCard` 高亮事件的特殊处理分支。
3. Step 组件保留高亮逻辑，但不再向卡片透传 highlight 控制。
4. 回归测试：点击卡片不会触发任何全局高亮状态变化。

建议修改点：

- `gui/src/pages/codeaware/components/KnowledgeCard/KnowledgeCard.tsx`
  - 去除 `setHighlightedElement({ type: "knowledgeCard" ... })`。
  - 删除与 `isFlickering`、`isHighlighted` 绑定的视觉逻辑。
- `gui/src/pages/codeaware/CodeAware.tsx`
  - 删除 `sourceType === "knowledgeCard"` 的高亮处理分支。
  - 删除全局问题后对知识卡片 `updateHighlight` 的调用，只保留 step 级别定位。
- `gui/src/pages/codeaware/components/Steps/Step.tsx`
  - 传入卡片 props 时移除高亮相关回调。
- `gui/src/redux/slices/codeAwareSlice.ts`
  - `updateHighlight` 若含 knowledgeCard 分支，删掉或 no-op。

验收标准：

- 打开/关闭卡片、切换视图、答题均不会触发代码高亮或 step 高亮变化。
- Redux state 中不会新增 knowledgeCard 高亮状态波动。

---

### Phase B（P1）: 认知追踪数据结构与事件总线（2-3 天）

目标：为“意图推断 + mastery 更新”建立标准输入。

新增模块：

- `gui/src/redux/cognitive/types.ts`
- `gui/src/redux/cognitive/eventBuffer.ts`

新增状态结构（建议放入 `codeAwareSession`）：

- `cognitiveTrace.events: CognitiveInteractionEvent[]`
- `cognitiveTrace.stepVisitStats: Record<stepId, { viewCount, lastVisitedAt, firstVisitedOrder }>`
- `cognitiveTrace.latestIntentByStep: Record<stepId, IntentSummary>`

事件类型建议：

- `step_expand`
- `step_collapse`
- `step_to_code`
- `code_to_step`
- `question_submit_step`
- `question_submit_global`
- `knowledge_card_open`
- `knowledge_card_view_mode_change`
- `knowledge_card_feedback`
- `knowledge_card_answer_result`

关键要求：

- 事件 append 必须幂等与轻量（保留最近 N=200 条）。
- 所有后续算法仅依赖标准事件，不依赖 UI 局部状态。

---

### Phase C（P2）: 意图推断与触发路由（3-4 天）

目标：把你定义的触发表正式编码，作为知识卡片生成唯一入口。

新增模块：

- `gui/src/redux/cognitive/intentInference.ts`
- `gui/src/redux/cognitive/triggerRouter.ts`

输入：

- 当前事件
- 最近事件窗口
- step 访问顺序信息

输出：

- `targetStepId`
- `intentTypes[]`：任务分解/前置知识/代码理解/功能映射
- `preferredInitialView`：`read | self-test | answer`

规则优先级（直接落地）：

1. 直接展开 step。
2. highLevelStep<->step 关联导航。
3. step->code。
4. code->step。
5. 问题解析（multi-intent + 对应 step）。
6. 特殊回顾/self-check 场景（复看、乱序回看、用户请求更多卡片）默认 `self-test`。

---

### Phase D（P3）: 认知感知卡片规划与生成（4-5 天）

目标：从“随机主题生成”升级为“意图+掌握度驱动的最少覆盖生成”。

新增模块：

- `gui/src/redux/cognitive/cardPlanner.ts`
- `gui/src/redux/thunks/generateCognitiveKnowledgeCards.ts`

算法流程：

1. 候选节点检索：
   - 先取 `knowledgeToStepRelations(stepId)`。
   - 再按需要扩展一跳 `knowledgeRelations`。
2. 节点评分：
   - `priority = w_intent * intentRelevance + w_gap * (1 - mastery) + w_novelty * novelty`
3. 最少覆盖打包：
   - 贪心 set-cover，卡片数最小化（建议上限 1-3）。
4. 调用 LLM 生成：
   - 每卡输出 `title + question + linkedKnowledgeNodeIds + assumedMasteredNodeIds`。
5. content lazy 生成保持短小 scaffolding。

落地要求：

- 老的 `generateKnowledgeCardThemes*` 不直接删除，先转为兼容 wrapper，内部转调新 thunk。

---

### Phase E（P4）: 三视图 UI + 懂/不懂反馈（3-4 天）

目标：完成交互闭环输入层。

数据模型调整（`core/index.d.ts`）：

- `KnowledgeCardItem.question: string`
- `KnowledgeCardItem.viewMode: "read" | "self-test" | "answer"`
- `KnowledgeCardItem.feedback?: "understood" | "uncertain"`
- `KnowledgeCardItem.linkedKnowledgeNodeIds: string[]`
- `KnowledgeCardItem.assumedMasteredNodeIds?: string[]`

UI 行为：

- 查阅视图：展示 content。
- 自测视图：突出 `question`。
- 答题视图：复用 SAQ/MCQ 与判题。
- 任一视图可切换，且统一有“懂了/存疑”反馈按钮。
- 特殊事件触发卡片时，默认视图可为 `self-test`。

---

### Phase F（P5）: 掌握度更新与一跳传播引擎（4-5 天）

目标：实现知识状态追踪核心算法，并封装为单独模块。

新增模块（核心）：

- `gui/src/redux/cognitive/masteryTrackingEngine.ts`

模块职责：

1. `deriveEvidenceFromInteraction(event)`
2. `updateDirectNodeMastery(nodeIds, evidence)`
3. `propagateOneHop(updatedNodes, cognitiveEdges)`
4. `mergePropagationCandidates(strategy = max)`
5. `emitMasteryUpdateLogs`

#### 固定常数（首版建议）

- `feedback_understood = 0.80`
- `feedback_uncertain = 0.25`
- `read_major_interaction = 0.45`
- `self_test_major_interaction = 0.55`
- `answer_mode_correct = 0.85`
- `answer_mode_wrong = 0.20`
- `not_viewed = no_update`

#### 直接更新公式

- `m_new = clamp((1 - alpha) * m_old + alpha * evidence, 0, 1)`
- 建议 `alpha = 0.35`

#### 一跳传播公式（按你的约束）

设从 A 传播到 B，边概率 `p = P(B|A)`，A 当前掌握 `mA`：

- `propagated(B) = mA * p + (1 - mA) * (1 - p)`
- `mB_candidate = (1 - beta) * mB_old + beta * propagated(B)`
- 建议 `beta = 0.25`

冲突合并：

- 同轮多个来源传播到同一 B：取 `max(candidate)`。
- 不回传到本轮被直接更新的源节点。

---

### Phase G（P6）: 入口收口与观测（2-3 天）

目标：所有入口统一走“意图 -> 规划 -> 卡片 -> 交互 -> mastery 更新”。

收口入口：

1. step 展开
2. step 问题提交
3. global question
4. 卡片反馈（懂/不懂）
5. 答题结果回调

可观测性：

- 新增日志字段：
  - `intentTypes`
  - `targetStepId`
  - `linkedKnowledgeNodeIds`
  - `masteryBefore/After`
  - `propagationTargets`

---

## 4. 关键接口草案（实现用）

### 4.1 意图推断接口

```ts
export interface IntentResolution {
  targetStepId: string;
  intentTypes: Array<
    | "task-decomposition"
    | "prerequisite"
    | "code-understanding"
    | "function-mapping"
  >;
  preferredInitialView: "read" | "self-test" | "answer";
  reason: string;
}

export function inferIntentFromEvents(args: {
  currentEvent: CognitiveInteractionEvent;
  recentEvents: CognitiveInteractionEvent[];
  stepVisitStats: Record<string, StepVisitStat>;
}): IntentResolution;
```

### 4.2 卡片规划接口

```ts
export interface CardPlanItem {
  linkedKnowledgeNodeIds: string[];
  assumedMasteredNodeIds: string[];
  intentTypes: IntentResolution["intentTypes"];
}

export function planKnowledgeCards(args: {
  targetStepId: string;
  intent: IntentResolution;
  masteryMap: Record<string, number>;
  knowledgeGraph: {
    knowledgeToStep: KnowledgeToStepRelation[];
    knowledgeRelations: KnowledgeRelation[];
  };
  maxCards: number;
}): CardPlanItem[];
```

### 4.3 掌握度引擎接口

```ts
export function applyKnowledgeCardInteraction(args: {
  linkedKnowledgeNodeIds: string[];
  interaction:
    | { type: "feedback"; value: "understood" | "uncertain" }
    | { type: "view-major"; value: "read" | "self-test" }
    | { type: "answer"; correctness: number };
  nodeMasteryScores: NodeMasteryScore[];
  cognitiveEdges: CodeAwareCognitiveEdge[];
}): {
  updatedScores: NodeMasteryScore[];
  changedNodeIds: string[];
};
```

---

## 5. 任务拆分（工程粒度）

### Task Group 1: 去除卡片高亮（必须优先）

- 删除 KnowledgeCard 组件内 `setHighlightedElement(type=knowledgeCard)`。
- 删除 CodeAware 页面 knowledgeCard highlight 分支。
- 删除全局问题后对 knowledge card 的高亮调用。
- 清理样式中 flicker 相关依赖。

### Task Group 2: 类型与状态

- 扩展 `KnowledgeCardItem` 新字段。
- 新增 cognitive trace 状态与 reducer。

### Task Group 3: 意图与规划

- 实现 intent inference + trigger router。
- 实现 card planner（最少覆盖）。

### Task Group 4: UI 三视图与反馈

- 新增 view switch。
- 新增懂/不懂反馈按钮。
- 接入默认视图逻辑。

### Task Group 5: 掌握度引擎

- 实现 evidence 常数映射。
- 实现 direct update + one-hop propagation。
- 接入反馈与答题回调。

### Task Group 6: 收口与测试

- 三入口统一。
- 单元测试 + 集成测试 + 埋点校验。

---

## 6. 测试与验收清单

### 6.1 功能验收

- 展开 step 会触发意图推断并生成卡片推荐。
- 卡片含 `title + question`。
- 三视图切换正常，懂/不懂可提交。
- SAQ 判题后 mastery 发生更新。
- 一跳传播生效且不回传源节点。

### 6.2 高亮约束验收

- 点击卡片标题不会触发任何 highlight link。
- 卡片视图切换不会触发代码高亮。
- 任何卡片事件都不会触发 `sourceType=knowledgeCard` 的高亮事件。

### 6.3 回归验收

- Step/Code/HighLevelStep 既有高亮链路不回退。
- 初始生成流程与导出 `.knowledge_state` 不受影响。

---

## 7. 风险与规避

### 风险 1：旧映射 TODO 干扰新链路

- 规避：新方案以 step 级映射为主，不依赖 knowledgeCard->code 映射。

### 风险 2：状态更新过于激进导致 mastery 波动大

- 规避：固定 `alpha/beta` 保守起步，增加日志观测后再调参。

### 风险 3：UI 改动打断已有用户习惯

- 规避：先保留“原按钮位置”，仅替换行为；逐步收敛文案和布局。

---

## 8. 里程碑建议

- M1（第 1 周）：完成 Phase A + B（高亮剥离 + 事件基础）。
- M2（第 2 周）：完成 Phase C + D（意图推断 + 认知卡片规划生成）。
- M3（第 3 周）：完成 Phase E + F + G（三视图反馈 + mastery 引擎 + 全入口收口）。

---

## 9. 完成定义（Definition of Done）

以下条件全部满足才视为本迭代完成：

1. KnowledgeCard 完全退出 highlight link。
2. 卡片生成由意图+mastery 驱动，且支持自动与手动触发。
3. 卡片支持三视图和懂/不懂反馈。
4. 用户交互会更新节点掌握度并进行一跳传播。
5. 知识状态追踪逻辑集中在 `masteryTrackingEngine` 模块。
6. 核心链路有自动化测试和可观测日志。
