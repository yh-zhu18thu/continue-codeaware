//CATODO: 参考着sessionSlice中chatHistory的实现方式加入codeaware的所有数据结构，包括UserIntent,UserMastery,Flow,KnowledgeCard,Quizzes
import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  CodeAwareCognitiveEdge,
  CodeAwareMapping,
  CodeAwarePresetSnapshot,
  CodeChunk,
  CodeChunkRelation,
  CollaborationStatus,
  GlobalQAMessage,
  GlobalQASession,
  HighLevelStepItem,
  HighlightEvent,
  InitialGenerationState,
  KnowledgeCardGenerationStatus,
  KnowledgeCardItem,
  KnowledgePoint,
  KnowledgeRelation,
  KnowledgeToCodeChunkRelation,
  KnowledgeToStepRelation,
  MasteryNodeRef,
  NodeMasteryScore,
  PinnedItem,
  ProgramRequirement,
  StepItem,
  StepStatus,
  StepToHighLevelMapping,
} from "core";
import { v4 as uuidv4 } from "uuid";
import {
  appendEventWithLimit,
  createEmptyCognitiveTrace,
  updateStepVisitStats,
} from "../cognitive/eventBuffer";
import {
  CognitiveInteractionEvent,
  CognitiveTraceState,
} from "../cognitive/types";

// Import RootState for proper typing
import type { RootState } from "../store";

// 辅助函数：清理markdown格式的文本，去掉换行符等特殊字符
function cleanMarkdownText(text: string): string {
  return text
    .replace(/\n/g, " ") // 替换换行符为空格
    .replace(/\r/g, " ") // 替换回车符为空格
    .replace(/\t/g, " ") // 替换制表符为空格
    .replace(/\s+/g, " ") // 将多个连续空格替换为单个空格
    .replace(/\*\*(.*?)\*\*/g, "$1") // 去掉粗体标记 **text**
    .replace(/\*(.*?)\*/g, "$1") // 去掉斜体标记 *text*
    .replace(/`(.*?)`/g, "$1") // 去掉行内代码标记 `code`
    .replace(/#{1,6}\s*/g, "") // 去掉标题标记 # ## ### 等
    .replace(/>\s*/g, "") // 去掉引用标记 >
    .replace(/[-*+]\s*/g, "") // 去掉列表标记 - * +
    .replace(/\d+\.\s*/g, "") // 去掉有序列表标记 1. 2. 等
    .trim(); // 去掉首尾空白
}

export type CodeAwareSessionState = {
  currentSessionId: string;
  title: string;
  workspaceDirectory: string;
  //用户需求，用于记载一系列的需求调整
  userRequirement: ProgramRequirement | null;
  //学习目标
  learningGoal: string;
  //高级步骤列表
  highLevelSteps: HighLevelStepItem[];
  //高级步骤叙述文段（将 highLevelSteps 串联成连贯可读的陈述性文段）
  highLevelStepNarrative: string;
  //步骤与高级步骤的层级关系（用于UI关联，不与code映射混淆）
  stepToHighLevelMappings: StepToHighLevelMapping[];
  //当前的flow
  steps: StepItem[];
  //存储code与语义元素的映射关系（用于LLM查找缓存）
  codeAwareMappings: CodeAwareMapping[];
  // 存储所有代码块
  codeChunks: CodeChunk[];
  // 代码块关系图
  codeChunkRelations: CodeChunkRelation[];
  // 知识点列表
  knowledgePoints: KnowledgePoint[];
  // 知识点关系图
  knowledgeRelations: KnowledgeRelation[];
  // 知识点 -> 步骤关系
  knowledgeToStepRelations: KnowledgeToStepRelation[];
  // 知识点 -> 代码块关系
  knowledgeToCodeChunkRelations: KnowledgeToCodeChunkRelation[];
  // 节点掌握度
  nodeMasteryScores: NodeMasteryScore[];
  // Pin/待学列表
  pinnedItems: PinnedItem[];
  // Global Q&A session (overlay conversation)
  globalQASession: GlobalQASession | null;
  // 掌握度指示器可见性
  showMasteryIndicators: boolean;
  // 初始生成状态
  initialGeneration: InitialGenerationState;
  // 映射查找状态
  mappingLookup: {
    isLoading: boolean;
    lastQuery?: {
      type: "code" | "semantic";
      elementId: string;
      timestamp: number;
    };
    error?: string;
  };
  // IDE communication flags
  shouldClearIdeHighlights: boolean;
  codeChunksToHighlightInIde: CodeChunk[];
  // Code generation state
  codeGeneration: {
    status:
      | "idle"
      | "collecting-context"
      | "generating"
      | "completed"
      | "error";
    message: string;
    progress: number; // 0-100
    currentStep: string;
    error?: string;
  };
  codeGenerationDebugLogs: string[];
  cognitiveTrace: CognitiveTraceState;
  // 认知关联边（初始生成后计算并存储，预设加载时直接恢复）
  cognitiveEdges: CodeAwareCognitiveEdge[];
};

const initialCodeAwareState: CodeAwareSessionState = {
  currentSessionId: uuidv4(),
  title: "New CodeAware Session",
  workspaceDirectory: "", //CATODO: see how to get current workspace name
  userRequirement: {
    requirementDescription: "",
    requirementStatus: "empty",
  },
  learningGoal: "",
  highLevelSteps: [],
  highLevelStepNarrative: "",
  stepToHighLevelMappings: [],
  steps: [],
  codeAwareMappings: [],
  codeChunks: [],
  codeChunkRelations: [],
  knowledgePoints: [],
  knowledgeRelations: [],
  knowledgeToStepRelations: [],
  knowledgeToCodeChunkRelations: [],
  nodeMasteryScores: [],
  pinnedItems: [],
  globalQASession: null,
  showMasteryIndicators: true,
  initialGeneration: {
    status: "idle",
    currentPhase: "",
    progress: 0,
    errors: [],
  },
  mappingLookup: {
    isLoading: false,
    lastQuery: undefined,
    error: undefined,
  },
  shouldClearIdeHighlights: false,
  codeChunksToHighlightInIde: [],
  codeGeneration: {
    status: "idle",
    message: "",
    progress: 0,
    currentStep: "",
    error: undefined,
  },
  codeGenerationDebugLogs: [],
  cognitiveTrace: createEmptyCognitiveTrace(),
  cognitiveEdges: [],
};

export const codeAwareSessionSlice = createSlice({
  name: "codeAwareSession",
  initialState: initialCodeAwareState,
  reducers: {
    //CATODO: 模仿Chat.tsx中对于onEnter的sendInput函数，以及如何把属性传递给子组件，并且意识到不需要记录当前的text，而是记editor state
    setUserRequirementStatus: (
      state,
      action: PayloadAction<CollaborationStatus>,
    ) => {
      if (state.userRequirement) {
        state.userRequirement.requirementStatus = action.payload;
      }
    },
    setLearningGoal: (state, action: PayloadAction<string>) => {
      state.learningGoal = action.payload;
    },
    submitRequirementContent: (state, action: PayloadAction<string>) => {
      if (state.userRequirement) {
        state.userRequirement.requirementDescription = action.payload;
      }
    },
    setGeneratedSteps: (state, action: PayloadAction<StepItem[]>) => {
      state.steps = action.payload;
    },
    setStepAbstract: (
      state,
      action: PayloadAction<{ stepId: string; abstract: string }>,
    ) => {
      const { stepId, abstract } = action.payload;
      const stepIndex = state.steps.findIndex((step) => step.id === stepId);

      if (stepIndex !== -1) {
        const step = state.steps[stepIndex];

        // 如果step状态是generated，且内容发生了变化，则设置为step_dirty
        if (step.stepStatus === "generated" && step.abstract !== abstract) {
          // 保存之前的abstract
          step.previousStepAbstract = step.abstract;
          step.stepStatus = "step_dirty";
        }
        // 如果已经是step_dirty状态，检查是否需要恢复到generated状态
        else if (step.stepStatus === "step_dirty") {
          // 如果编辑后的内容与原始的previousStepAbstract相同，则恢复到generated状态
          if (
            step.previousStepAbstract &&
            abstract === step.previousStepAbstract
          ) {
            step.stepStatus = "generated";
            step.previousStepAbstract = undefined; // 清除之前的保存
          }
          // 否则保持step_dirty状态，不改变previousStepAbstract
        }
        // 如果step状态是editing，这表示用户正在从编辑模式确认修改
        // 我们需要检查内容是否相对于最初的generated状态发生了变化
        else if (step.stepStatus === "editing") {
          // 如果之前保存了原始内容，与之比较
          if (step.previousStepAbstract !== undefined) {
            if (abstract === step.previousStepAbstract) {
              // 内容回到了原始状态，应该恢复到generated
              step.stepStatus = "generated";
              step.previousStepAbstract = undefined;
            } else {
              // 内容仍然与原始状态不同，设置为step_dirty
              step.stepStatus = "step_dirty";
            }
          } else {
            // 没有保存原始内容，需要与当前abstract比较
            if (step.abstract !== abstract) {
              // 内容发生了变化，保存原始内容并设置为step_dirty
              step.previousStepAbstract = step.abstract;
              step.stepStatus = "step_dirty";
            } else {
              // 内容没有变化，保持原状态（这种情况下通常应该是generated）
              step.stepStatus = "generated";
            }
          }
        }

        step.abstract = abstract;
      }
    },
    setStepStatus: (
      state,
      action: PayloadAction<{ stepId: string; status: StepStatus }>,
    ) => {
      const { stepId, status } = action.payload;
      const stepIndex = state.steps.findIndex((step) => step.id === stepId);

      if (stepIndex !== -1) {
        const step = state.steps[stepIndex];

        // 如果要设置为编辑状态，且step当前是generated或step_dirty状态，保存原始内容
        if (
          status === "editing" &&
          (step.stepStatus === "generated" || step.stepStatus === "step_dirty")
        ) {
          // 如果是从generated状态进入编辑，保存当前的abstract
          if (step.stepStatus === "generated") {
            step.previousStepAbstract = step.abstract;
          }
          // 如果是从step_dirty状态进入编辑，previousStepAbstract已经存在，不需要重新保存
        }

        step.stepStatus = status;
      }
    },
    setStepTitle: (
      state,
      action: PayloadAction<{ stepId: string; title: string }>,
    ) => {
      const { stepId, title } = action.payload;
      const stepIndex = state.steps.findIndex((step) => step.id === stepId);

      if (stepIndex !== -1) {
        state.steps[stepIndex].title = title;
      }
    },
    setStepGeneratedUntil: (state, action: PayloadAction<string>) => {
      const stepId = action.payload;
      const stepIndex = state.steps.findIndex((step) => step.id === stepId);
      for (let i = 0; i < stepIndex + 1; i++) {
        state.steps[i].stepStatus = "generated";
      }
    },
    setKnowledgeCardGenerationStatus: (
      state,
      action: PayloadAction<{
        stepId: string;
        status: KnowledgeCardGenerationStatus;
      }>,
    ) => {
      const { stepId, status } = action.payload;
      const stepIndex = state.steps.findIndex((step) => step.id === stepId);
      if (stepIndex !== -1) {
        state.steps[stepIndex].knowledgeCardGenerationStatus = status;
      }
    },
    newCodeAwareSession: (state) => {
      // Clear all highlights first
      codeAwareSessionSlice.caseReducers.clearAllHighlights(state);

      // Reset the state for a new CodeAware session
      state.currentSessionId = uuidv4();
      state.title = "New CodeAware Session";
      state.workspaceDirectory = ""; // Reset workspace directory
      state.userRequirement = {
        requirementDescription: "",
        requirementStatus: "empty",
      };
      state.learningGoal = "";
      state.highLevelSteps = [];
      state.highLevelStepNarrative = "";
      state.stepToHighLevelMappings = [];
      state.steps = [];
      state.codeAwareMappings = [];
      state.codeChunks = [];
      state.codeChunkRelations = [];
      state.knowledgePoints = [];
      state.knowledgeRelations = [];
      state.knowledgeToStepRelations = [];
      state.knowledgeToCodeChunkRelations = [];
      state.nodeMasteryScores = [];
      state.pinnedItems = [];
      state.globalQASession = null;
      state.cognitiveTrace = createEmptyCognitiveTrace();
      state.initialGeneration = {
        status: "idle",
        currentPhase: "",
        progress: 0,
        errors: [],
      };
      state.shouldClearIdeHighlights = false;
      state.codeChunksToHighlightInIde = [];
    },
    clearAllHighlights: (state) => {
      // 注意：映射不再存储高亮状态，只需清除元素本身的高亮
      // Reset highlight status for all code chunks
      // state.codeChunks.forEach((chunk) => {
      //   chunk.isHighlighted = false;
      // }); // 已移除：不再静态存储 code chunks

      // Reset highlight status for all high level steps
      state.highLevelSteps = state.highLevelSteps.map((step) => ({
        ...step,
        isHighlighted: false,
        highlightType: undefined,
      }));
      // Reset highlight status for all steps
      state.steps = state.steps.map((step) => {
        return {
          ...step,
          isHighlighted: false,
          highlightType: undefined,
          knowledgeCards: step.knowledgeCards,
        };
      });

      // Set flag to clear IDE highlights
      state.shouldClearIdeHighlights = true;
      state.codeChunksToHighlightInIde = [];
    },
    // 清除单个元素的高亮状态（用于闪烁后自动清除关联高亮）
    clearElementHighlight: (
      state,
      action: PayloadAction<{
        type: "highLevelStep" | "step" | "knowledgeCard";
        id: string;
      }>,
    ) => {
      const { type, id } = action.payload;

      if (type === "highLevelStep") {
        const stepIndex = state.highLevelSteps.findIndex((s) => s.id === id);
        if (stepIndex !== -1) {
          state.highLevelSteps[stepIndex] = {
            ...state.highLevelSteps[stepIndex],
            isHighlighted: false,
            highlightType: undefined,
          };
        }
      } else if (type === "step") {
        const stepIndex = state.steps.findIndex((s) => s.id === id);
        if (stepIndex !== -1) {
          state.steps[stepIndex] = {
            ...state.steps[stepIndex],
            isHighlighted: false,
            highlightType: undefined,
          };
        }
      } else if (type === "knowledgeCard") {
        // KnowledgeCard has been removed from the highlight ecosystem.
        console.log(`ℹ️ Ignored clearElementHighlight for knowledgeCard ${id}`);
      }

      console.log(`🧹 Cleared highlight for ${type} ${id}`);
    },
    // 设置单个元素为高亮状态（不触发代码高亮）
    setHighlightedElement: (
      state,
      action: PayloadAction<{
        type: "highLevelStep" | "step" | "knowledgeCard";
        id: string;
      }>,
    ) => {
      const { type, id } = action.payload;

      console.log(
        `🎯 [setHighlightedElement] type=${type}, id=${id}, mappings count=${state.stepToHighLevelMappings.length}`,
      );
      console.log(
        `📋 [Mappings]:`,
        JSON.stringify(state.stepToHighLevelMappings, null, 2),
      );

      // 清除所有现有高亮（但不清除 IDE 高亮）
      // 注意：映射不再存储高亮状态
      // state.codeChunks.forEach((chunk) => {
      //   chunk.isHighlighted = false;
      // }); // 已移除：不再静态存储 code chunks

      state.highLevelSteps = state.highLevelSteps.map((step) => ({
        ...step,
        isHighlighted: false,
        highlightType: undefined,
      }));
      state.steps = state.steps.map((step) => ({
        ...step,
        isHighlighted: false,
        highlightType: undefined,
        knowledgeCards: step.knowledgeCards,
      }));

      // 设置新的高亮元素（带双向关联）
      if (type === "highLevelStep") {
        // 高亮 high-level step（主要高亮）
        const stepIndex = state.highLevelSteps.findIndex((s) => s.id === id);
        if (stepIndex !== -1) {
          state.highLevelSteps[stepIndex] = {
            ...state.highLevelSteps[stepIndex],
            isHighlighted: true,
            highlightType: "primary", // 主要高亮
          };

          // 找到所有关联的 steps 并设置为关联高亮（触发滚动和闪烁）
          const relatedMappings = state.stepToHighLevelMappings.filter(
            (m) => m.highLevelStepId === id,
          );

          relatedMappings.forEach((mapping) => {
            const relatedStepIndex = state.steps.findIndex(
              (s) => s.id === mapping.stepId,
            );
            if (relatedStepIndex !== -1) {
              state.steps[relatedStepIndex] = {
                ...state.steps[relatedStepIndex],
                isHighlighted: true,
                highlightType: "related", // 关联高亮（只闪烁）
              };
            }
          });

          console.log(
            `🎯 Highlighted high-level step ${id} (primary) and ${relatedMappings.length} related steps (flicker only)`,
          );
        }
      } else if (type === "step") {
        // 高亮 step（主要高亮）
        const stepIndex = state.steps.findIndex((s) => s.id === id);
        if (stepIndex !== -1) {
          state.steps[stepIndex] = {
            ...state.steps[stepIndex],
            isHighlighted: true,
            highlightType: "primary", // 主要高亮
          };

          // 找到关联的 high-level step 并设置为关联高亮（触发闪烁）
          const relatedMapping = state.stepToHighLevelMappings.find(
            (m) => m.stepId === id,
          );

          if (relatedMapping) {
            const hlStepIndex = state.highLevelSteps.findIndex(
              (s) => s.id === relatedMapping.highLevelStepId,
            );
            if (hlStepIndex !== -1) {
              state.highLevelSteps[hlStepIndex] = {
                ...state.highLevelSteps[hlStepIndex],
                isHighlighted: true,
                highlightType: "related", // 关联高亮（只闪烁）
              };
              console.log(
                `🎯 Highlighted step ${id} (primary) and related high-level step ${relatedMapping.highLevelStepId} (flicker only)`,
              );
            }
          }
        }
      } else if (type === "knowledgeCard") {
        // KnowledgeCard has been removed from the highlight ecosystem.
        console.log(`ℹ️ Ignored setHighlightedElement for knowledgeCard ${id}`);
      }
    },
    clearAllCodeChunks: (state) => {
      // Clear all code chunks
      // state.codeChunks = []; // 已移除：不再静态存储 code chunks
      console.warn(
        "⚠️ clearAllCodeChunks reducer 已废弃，不再静态存储 code chunks",
      );
    },
    clearAllCodeAwareMappings: (state) => {
      // Clear all CodeAware mappings
      state.codeAwareMappings = [];
    },
    updateHighlight: (
      state,
      action: PayloadAction<HighlightEvent | HighlightEvent[]>,
    ) => {
      const events = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      console.log("✨ updateHighlight: 处理高亮事件", events);

      // 先清除所有高亮状态
      codeAwareSessionSlice.caseReducers.clearAllHighlights(state);

      // 收集需要在 IDE 中高亮的代码块
      const codeChunksToHighlight: CodeChunk[] = [];

      // 处理每个高亮事件
      for (const event of events) {
        switch (event.sourceType) {
          case "code":
            // 直接高亮代码块
            if (event.additionalInfo) {
              const codeChunk = event.additionalInfo as CodeChunk;
              codeChunksToHighlight.push(codeChunk);
              console.log(`  ✅ 添加代码块高亮: ${codeChunk.id}`);
            }
            break;

          case "highLevelStep":
            // 高亮 high level step
            const highLevelStep = state.highLevelSteps.find(
              (s) => s.id === event.identifier,
            );
            if (highLevelStep) {
              highLevelStep.isHighlighted = true;
              highLevelStep.highlightType = "primary";
              console.log(`  ✅ 高亮 highLevelStep: ${event.identifier}`);
            }
            break;

          case "step":
            // 高亮 step
            const step = state.steps.find((s) => s.id === event.identifier);
            if (step) {
              step.isHighlighted = true;
              step.highlightType = "primary";
              console.log(`  ✅ 高亮 step: ${event.identifier}`);
            }
            break;

          case "knowledgeCard":
            // KnowledgeCard has been removed from the highlight ecosystem.
            console.log(
              `  ℹ️ 忽略 knowledgeCard 高亮事件: ${event.identifier}`,
            );
            break;
        }
      }

      // 更新需要在 IDE 中高亮的代码块
      if (codeChunksToHighlight.length > 0) {
        state.codeChunksToHighlightInIde = codeChunksToHighlight;
        console.log(
          `  📤 将向 IDE 发送 ${codeChunksToHighlight.length} 个代码块高亮请求`,
        );
      }
    },
    // 设置高级步骤
    setHighLevelSteps: (state, action: PayloadAction<HighLevelStepItem[]>) => {
      state.highLevelSteps = action.payload;
    },
    // 设置高级步骤叙述文段
    setHighLevelStepNarrative: (state, action: PayloadAction<string>) => {
      state.highLevelStepNarrative = action.payload;
    },
    // 设置步骤到高级步骤的映射关系（用于UI层级关联）
    setStepToHighLevelMappings: (
      state,
      action: PayloadAction<StepToHighLevelMapping[]>,
    ) => {
      console.log(
        `✅ [setStepToHighLevelMappings reducer] Setting ${action.payload.length} mappings`,
      );
      console.log(`📋 Mappings:`, JSON.stringify(action.payload, null, 2));
      state.stepToHighLevelMappings = action.payload;
    },
    // 更新高级步骤的完成状态
    updateHighLevelStepCompletion: (
      state,
      action: PayloadAction<{ highLevelStepId: string; isCompleted: boolean }>,
    ) => {
      const { highLevelStepId, isCompleted } = action.payload;
      const highLevelStep = state.highLevelSteps.find(
        (step) => step.id === highLevelStepId,
      );
      if (highLevelStep) {
        highLevelStep.isCompleted = isCompleted;
      }
    },
    updateCodeChunks: (state, action: PayloadAction<CodeChunk[]>) => {
      // state.codeChunks.push(...action.payload); // 已移除：不再静态存储 code chunks
      console.warn(
        "⚠️ updateCodeChunks reducer 已废弃，不再静态存储 code chunks",
      );
    },
    // 更新代码块的范围
    updateCodeChunkRange: (
      state,
      action: PayloadAction<{ codeChunkId: string; range: [number, number] }>,
    ) => {
      // const { codeChunkId, range } = action.payload;
      // const chunk = state.codeChunks.find((c) => c.id === codeChunkId);
      // if (chunk) {
      //   chunk.range = range;
      // } // 已移除：不再静态存储 code chunks
      console.warn(
        "⚠️ updateCodeChunkRange reducer 已废弃，不再静态存储 code chunks",
      );
    },
    // 设置代码块的禁用状态
    setCodeChunkDisabled: (
      state,
      action: PayloadAction<{ codeChunkId: string; disabled: boolean }>,
    ) => {
      // const { codeChunkId, disabled } = action.payload;
      // const chunk = state.codeChunks.find((c) => c.id === codeChunkId);
      // if (chunk) {
      //   chunk.disabled = disabled;
      // } // 已移除：不再静态存储 code chunks
      console.warn(
        "⚠️ setCodeChunkDisabled reducer 已废弃，不再静态存储 code chunks",
      );
    },
    updateCodeAwareMappings: (
      state,
      action: PayloadAction<CodeAwareMapping[]>,
    ) => {
      // 使用 Set 来高效检查重复的 mapping
      const existingMappingsSet = new Set(
        state.codeAwareMappings.map(
          (mapping) =>
            `${mapping.codeChunkId}-${mapping.semanticElementId}-${mapping.semanticElementType}`,
        ),
      );

      // 过滤出不重复的 mapping
      const newMappings = action.payload.filter((newMapping) => {
        const mappingKey = `${newMapping.codeChunkId}-${newMapping.semanticElementId}-${newMapping.semanticElementType}`;
        return !existingMappingsSet.has(mappingKey);
      });

      state.codeAwareMappings.push(...newMappings);
    },
    // 设置全部代码块
    setCodeChunks: (state, action: PayloadAction<CodeChunk[]>) => {
      state.codeChunks = action.payload;
    },
    // 添加或更新单个代码块
    addCodeChunk: (state, action: PayloadAction<CodeChunk>) => {
      const existingIndex = state.codeChunks.findIndex(
        (chunk) => chunk.id === action.payload.id,
      );
      if (existingIndex >= 0) {
        state.codeChunks[existingIndex] = action.payload;
      } else {
        state.codeChunks.push(action.payload);
      }
    },
    // 代码块关系
    setCodeChunkRelations: (
      state,
      action: PayloadAction<CodeChunkRelation[]>,
    ) => {
      state.codeChunkRelations = action.payload;
    },
    addCodeChunkRelation: (state, action: PayloadAction<CodeChunkRelation>) => {
      state.codeChunkRelations.push(action.payload);
    },
    // 知识点
    setKnowledgePoints: (state, action: PayloadAction<KnowledgePoint[]>) => {
      state.knowledgePoints = action.payload;
    },
    addKnowledgePoint: (state, action: PayloadAction<KnowledgePoint>) => {
      state.knowledgePoints.push(action.payload);
    },
    // 知识关系
    setKnowledgeRelations: (
      state,
      action: PayloadAction<KnowledgeRelation[]>,
    ) => {
      state.knowledgeRelations = action.payload;
    },
    addKnowledgeRelation: (state, action: PayloadAction<KnowledgeRelation>) => {
      state.knowledgeRelations.push(action.payload);
    },
    // 知识点 -> 步骤关系
    setKnowledgeToStepRelations: (
      state,
      action: PayloadAction<KnowledgeToStepRelation[]>,
    ) => {
      state.knowledgeToStepRelations = action.payload;
    },
    // 知识点 -> 代码块关系
    setKnowledgeToCodeChunkRelations: (
      state,
      action: PayloadAction<KnowledgeToCodeChunkRelation[]>,
    ) => {
      state.knowledgeToCodeChunkRelations = action.payload;
    },
    // 节点掌握度
    setNodeMasteryScores: (
      state,
      action: PayloadAction<NodeMasteryScore[]>,
    ) => {
      state.nodeMasteryScores = action.payload;
    },
    // Pin/待学列表操作
    addPinnedItem: (state, action: PayloadAction<PinnedItem>) => {
      // 避免重复 pin
      const exists = state.pinnedItems.some(
        (item) =>
          item.level === action.payload.level &&
          item.targetId === action.payload.targetId,
      );
      if (!exists) {
        state.pinnedItems.push(action.payload);
      }
    },
    removePinnedItem: (state, action: PayloadAction<string>) => {
      state.pinnedItems = state.pinnedItems.filter(
        (item) => item.id !== action.payload,
      );
    },
    /** 切换 pin 状态（用于从 IDE 侧触发的 pin 操作） */
    togglePinnedItem: (state, action: PayloadAction<PinnedItem>) => {
      const idx = state.pinnedItems.findIndex(
        (item) =>
          item.level === action.payload.level &&
          item.targetId === action.payload.targetId,
      );
      if (idx >= 0) {
        state.pinnedItems.splice(idx, 1);
      } else {
        state.pinnedItems.push(action.payload);
      }
    },
    clearPinnedItems: (state) => {
      state.pinnedItems = [];
    },
    // Global Q&A session management
    startGlobalQASession: (state) => {
      state.globalQASession = { messages: [], status: "active" };
    },
    addGlobalQAMessage: (state, action: PayloadAction<GlobalQAMessage>) => {
      if (state.globalQASession) {
        state.globalQASession.messages.push(action.payload);
      }
    },
    endGlobalQASession: (state) => {
      if (state.globalQASession) {
        state.globalQASession.status = "ended";
      }
    },
    setGlobalQASessionConverting: (state) => {
      if (state.globalQASession) {
        state.globalQASession.status = "converting";
      }
    },
    clearGlobalQASession: (state) => {
      state.globalQASession = null;
    },
    // 掌握度指示器可见性开关
    toggleMasteryIndicators: (state) => {
      state.showMasteryIndicators = !state.showMasteryIndicators;
    },
    upsertNodeMasteryScore: (
      state,
      action: PayloadAction<NodeMasteryScore>,
    ) => {
      const idx = state.nodeMasteryScores.findIndex(
        (item) =>
          item.nodeId === action.payload.nodeId &&
          item.nodeType === action.payload.nodeType,
      );
      if (idx >= 0) {
        state.nodeMasteryScores[idx] = action.payload;
      } else {
        state.nodeMasteryScores.push(action.payload);
      }
    },
    // 初始生成状态管理
    updateInitialGenerationStatus: (
      state,
      action: PayloadAction<Partial<InitialGenerationState>>,
    ) => {
      state.initialGeneration = {
        ...state.initialGeneration,
        ...action.payload,
      };
    },
    resetInitialGenerationStatus: (state) => {
      state.initialGeneration = {
        status: "idle",
        currentPhase: "",
        progress: 0,
        errors: [],
      };
    },
    addInitialGenerationError: (state, action: PayloadAction<string>) => {
      state.initialGeneration.errors.push(action.payload);
    },
    // 添加单个映射到缓存
    addMappingToCache: (state, action: PayloadAction<CodeAwareMapping>) => {
      const newMapping = action.payload;

      // 检查是否已存在相同的映射
      const exists = state.codeAwareMappings.some(
        (m) =>
          m.codeChunkId === newMapping.codeChunkId &&
          m.semanticElementId === newMapping.semanticElementId &&
          m.semanticElementType === newMapping.semanticElementType,
      );

      if (!exists) {
        state.codeAwareMappings.push(newMapping);
      }
    },
    // 批量添加映射到缓存
    addMappingsToBatch: (state, action: PayloadAction<CodeAwareMapping[]>) => {
      const newMappings = action.payload;
      const existingSet = new Set(
        state.codeAwareMappings.map(
          (m) =>
            `${m.codeChunkId}-${m.semanticElementId}-${m.semanticElementType}`,
        ),
      );

      newMappings.forEach((mapping) => {
        const key = `${mapping.codeChunkId}-${mapping.semanticElementId}-${mapping.semanticElementType}`;
        if (!existingSet.has(key)) {
          state.codeAwareMappings.push(mapping);
          existingSet.add(key);
        }
      });
    },
    // 清除过期的映射缓存（基于时间戳）
    cleanupExpiredMappings: (state, action: PayloadAction<number>) => {
      const expirationTime = action.payload; // 毫秒
      const now = Date.now();

      state.codeAwareMappings = state.codeAwareMappings.filter(
        (m) => now - m.createdAt < expirationTime,
      );
    },
    // 设置映射查找加载状态
    setMappingLookupLoading: (state, action: PayloadAction<boolean>) => {
      state.mappingLookup.isLoading = action.payload;
    },
    // 设置映射查找错误信息
    setMappingLookupError: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.mappingLookup.error = action.payload;
    },
    // 更新最后一次查询信息
    setMappingLookupQuery: (
      state,
      action: PayloadAction<{
        type: "code" | "semantic";
        elementId: string;
        timestamp: number;
      }>,
    ) => {
      state.mappingLookup.lastQuery = action.payload;
    },
    setCodeAwareTitle: (state, action: PayloadAction<string>) => {
      state.title = action.payload;
    },
    resetIdeCommFlags: (state) => {
      state.shouldClearIdeHighlights = false;
      state.codeChunksToHighlightInIde = [];
    },
    // 设置知识卡片加载状态
    setKnowledgeCardLoading: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        isLoading: boolean;
      }>,
    ) => {
      const { stepId, cardId, isLoading } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card) {
          // 我们用一个特殊的标记来表示加载状态
          if (isLoading) {
            card.content = "::LOADING::";
          }
        }
      }
    },
    // 更新知识卡片内容和测试题目
    updateKnowledgeCardContent: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        content: string;
        tests?: Array<{
          question_type: "shortAnswer" | "multipleChoice";
          question: {
            stem: string;
            standard_answer: string;
            options?: string[];
          };
        }>;
      }>,
    ) => {
      const { stepId, cardId, content, tests } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card) {
          card.content = content;

          // 更新测试题目
          if (tests && tests.length > 0) {
            card.tests = tests.map((test, index) => {
              if (test.question_type === "shortAnswer") {
                return {
                  id: `${cardId}-t-${index}`,
                  questionType: "shortAnswer" as const,
                  question: {
                    type: "shortAnswer" as const,
                    stem: test.question.stem,
                    standard_answer: test.question.standard_answer,
                    answer: "",
                    result: "unanswered" as const,
                  },
                };
              } else {
                return {
                  id: `${cardId}-t-${index}`,
                  questionType: "multipleChoice" as const,
                  question: {
                    type: "multipleChoice" as const,
                    stem: test.question.stem,
                    standard_answer: test.question.standard_answer,
                    options: test.question.options || [],
                    answer: "",
                    answerIndex: -1,
                    result: "unanswered" as const,
                  },
                };
              }
            });
          }
        }
      }
    },
    // 追加内容到知识卡片（用于 confusion Q&A 结束后更新当前卡片）
    appendKnowledgeCardContent: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        additionalContent: string;
      }>,
    ) => {
      const { stepId, cardId, additionalContent } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card && additionalContent.trim()) {
          const separator = card.content ? "\n\n---\n\n" : "";
          card.content = (card.content || "") + separator + additionalContent;
        }
      }
    },
    // 记录知识卡片首次查看时间
    setKnowledgeCardViewedAt: (
      state,
      action: PayloadAction<{ stepId: string; cardId: string }>,
    ) => {
      const { stepId, cardId } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card && !card.viewedAt) {
          card.viewedAt = Date.now();
        }
      }
    },
    // 设置知识卡片内容加载失败
    setKnowledgeCardError: (
      state,
      action: PayloadAction<{ stepId: string; cardId: string; error: string }>,
    ) => {
      const { stepId, cardId, error } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card) {
          card.content = `加载失败: ${error}`;
        }
      }
    },
    // 重置知识卡片到生成前状态（清空内容和测试）
    resetKnowledgeCardContent: (
      state,
      action: PayloadAction<{ stepId: string; cardId: string }>,
    ) => {
      const { stepId, cardId } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card) {
          card.content = "";
          card.tests = [];
        }
      }
    },
    // 设置知识卡片的禁用状态
    setKnowledgeCardDisabled: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        disabled: boolean;
      }>,
    ) => {
      const { stepId, cardId, disabled } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card) {
          card.disabled = disabled;
        }
      }
    },
    // 更新知识卡片标题并清空内容和测试
    updateKnowledgeCardTitle: (
      state,
      action: PayloadAction<{ stepId: string; cardId: string; title: string }>,
    ) => {
      const { stepId, cardId, title } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card) {
          card.title = title;
          // 清空内容和测试，保持其他属性不变
          card.content = undefined;
          card.tests = undefined;
          card.codeContext = undefined;
        }
      }
    },
    // 更新知识卡片的测试题
    updateKnowledgeCardTests: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        tests: Array<{
          question_type: "shortAnswer" | "multipleChoice";
          question: {
            stem: string;
            standard_answer: string;
            options?: string[];
          };
        }>;
      }>,
    ) => {
      const { stepId, cardId, tests } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card && tests && tests.length > 0) {
          card.tests = tests.map((test, index) => {
            if (test.question_type === "shortAnswer") {
              return {
                id: `${cardId}-t-${index}`,
                questionType: "shortAnswer" as const,
                question: {
                  type: "shortAnswer" as const,
                  stem: test.question.stem,
                  standard_answer: test.question.standard_answer,
                  answer: "",
                  result: "unanswered" as const,
                },
              };
            } else {
              return {
                id: `${cardId}-t-${index}`,
                questionType: "multipleChoice" as const,
                question: {
                  type: "multipleChoice" as const,
                  stem: test.question.stem,
                  standard_answer: test.question.standard_answer,
                  options: test.question.options || [],
                  answer: "",
                  answerIndex: -1,
                  result: "unanswered" as const,
                },
              };
            }
          });
        }
      }
    },
    // 设置知识卡片测试题加载状态
    setKnowledgeCardTestsLoading: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        isLoading: boolean;
      }>,
    ) => {
      const { stepId, cardId, isLoading } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const card = step.knowledgeCards.find((c) => c.id === cardId);
        if (card) {
          // 为测试题加载状态添加一个特殊属性
          (card as any).isTestsLoading = isLoading;
        }
      }
    },
    // 添加新的代码块（从autocomplete生成）
    addCodeChunkFromCompletion: (
      state,
      action: PayloadAction<{
        prefixCode: string;
        completionText: string;
        range: [number, number];
        filePath: string;
      }>,
    ) => {
      // 已移除：不再静态存储 code chunks
      console.warn(
        "⚠️ addCodeChunkFromCompletion reducer 已废弃，不再静态存储 code chunks",
      );
    },
    // 创建或获取代码块（用于知识卡片映射）
    createOrGetCodeChunk: (
      state,
      action: PayloadAction<{
        content: string;
        range: [number, number];
        filePath: string;
        id?: string; // 可选的预设ID
      }>,
    ) => {
      // const { content, range, filePath, id: presetId } = action.payload;

      // // 首先检查是否已经存在类似的代码块
      // const existingChunk = state.codeChunks.find(
      //   (chunk) =>
      //     chunk.filePath === filePath &&
      //     chunk.content === content &&
      //     chunk.range[0] === range[0] &&
      //     chunk.range[1] === range[1],
      // );

      // if (!existingChunk) {
      //   // 如果不存在，创建新的代码块
      //   const newCodeChunk: CodeChunk = {
      //     id: presetId || `c-${state.codeChunks.length + 1}`, // 使用预设ID或基于长度的ID
      //     content,
      //     range,
      //     isHighlighted: false,
      //     disabled: false,
      //     filePath,
      //   };

      //   state.codeChunks.push(newCodeChunk);
      // } // 已移除：不再静态存储 code chunks
      console.warn(
        "⚠️ createOrGetCodeChunk reducer 已废弃，不再静态存储 code chunks",
      );
    },
    // 创建新的知识卡片（不包含content和tests）
    createKnowledgeCard: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        theme: string;
        question?: string;
        viewMode?: "read" | "self-test" | "answer";
        linkedKnowledgeNodeIds?: string[];
        linkedMasteryNodes?: MasteryNodeRef[];
        assumedMasteredNodeIds?: string[];
        source?: "prerequisite" | "confusion" | "question";
      }>,
    ) => {
      const {
        stepId,
        cardId,
        theme,
        question,
        viewMode,
        linkedKnowledgeNodeIds,
        linkedMasteryNodes,
        assumedMasteredNodeIds,
        source,
      } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const newCard: KnowledgeCardItem = {
          id: cardId,
          title: theme,
          question,
          viewMode: viewMode || "read",
          linkedKnowledgeNodeIds,
          linkedMasteryNodes,
          assumedMasteredNodeIds,
          content: "",
          tests: [],
          isHighlighted: false,
          disabled: false,
          source,
        };
        step.knowledgeCards.push(newCard);
      }
    },
    setKnowledgeCardViewMode: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        viewMode: "read" | "self-test" | "answer";
      }>,
    ) => {
      const { stepId, cardId, viewMode } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (!step) {
        return;
      }

      const card = step.knowledgeCards.find((c) => c.id === cardId);
      if (card) {
        card.viewMode = viewMode;
      }
    },
    setKnowledgeCardFeedback: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        feedback: "understood" | "uncertain";
      }>,
    ) => {
      const { stepId, cardId, feedback } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (!step) {
        return;
      }

      const card = step.knowledgeCards.find((c) => c.id === cardId);
      if (card) {
        card.feedback = feedback;
      }
    },
    // 创建新的mapping
    createCodeAwareMapping: (
      state,
      action: PayloadAction<CodeAwareMapping>,
    ) => {
      state.codeAwareMappings.push(action.payload);
    },
    // 删除指定的mappings
    removeCodeAwareMappings: (
      state,
      action: PayloadAction<{
        semanticElementId?: string;
        codeChunkId?: string;
      }>,
    ) => {
      const { semanticElementId, codeChunkId } = action.payload;
      state.codeAwareMappings = state.codeAwareMappings.filter((mapping) => {
        // 如果指定了semanticElementId，删除所有包含该ID的映射
        if (
          semanticElementId &&
          mapping.semanticElementId === semanticElementId
        ) {
          return false;
        }
        // 如果指定了codeChunkId，删除所有包含该codeChunkId的映射
        if (codeChunkId && mapping.codeChunkId === codeChunkId) {
          return false;
        }
        return true;
      });
    },
    // 清除所有知识卡片的代码映射（保留highLevelStep映射）
    clearKnowledgeCardCodeMappings: (state) => {
      state.codeAwareMappings = state.codeAwareMappings.filter((mapping) => {
        // 保留 highLevelStep 类型的映射
        return mapping.semanticElementType === "highLevelStep";
      });
    },
    resetSessionExceptRequirement: (state) => {
      // Clear all highlights first
      codeAwareSessionSlice.caseReducers.clearAllHighlights(state);
      // Reset everything except userRequirement and currentSessionId
      state.highLevelSteps = [];
      state.highLevelStepNarrative = "";
      state.steps = [];
      state.codeChunks = [];
      state.codeAwareMappings = [];
      state.codeChunkRelations = [];
      state.knowledgePoints = [];
      state.knowledgeRelations = [];
      state.knowledgeToStepRelations = [];
      state.knowledgeToCodeChunkRelations = [];
      state.nodeMasteryScores = [];
      state.pinnedItems = [];
      state.globalQASession = null;
      state.cognitiveTrace = createEmptyCognitiveTrace();
      state.initialGeneration = {
        status: "idle",
        currentPhase: "",
        progress: 0,
        errors: [],
      };
      state.shouldClearIdeHighlights = false;
      state.codeChunksToHighlightInIde = [];
      state.cognitiveEdges = [];
    },
    // 从预设快照一次性恢复全部状态（用于用户测试场景）
    restoreFromSnapshot: (
      state,
      action: PayloadAction<{
        snapshot: CodeAwarePresetSnapshot;
        resolvedCodeFilePath: string;
      }>,
    ) => {
      const { snapshot, resolvedCodeFilePath } = action.payload;
      const now = Date.now();

      // 基础信息
      state.title = snapshot.title;
      state.learningGoal = snapshot.learningGoal;

      // 需求
      if (state.userRequirement) {
        state.userRequirement.requirementDescription =
          snapshot.originalRequirement;
        state.userRequirement.requirementStatus = "finalized";
      }

      // 步骤结构
      state.highLevelSteps = snapshot.highLevelSteps;
      state.highLevelStepNarrative = snapshot.highLevelStepNarrative;
      state.stepToHighLevelMappings = snapshot.stepToHighLevelMappings;
      state.steps = snapshot.steps;

      // 代码块（替换 filePath 为当前 workspace 的绝对路径）
      state.codeChunks = snapshot.codeChunks.map((chunk) => ({
        ...chunk,
        filePath: resolvedCodeFilePath,
      }));
      state.codeChunkRelations = snapshot.codeChunkRelations;

      // 映射
      state.codeAwareMappings = snapshot.codeAwareMappings;

      // 知识图谱
      state.knowledgePoints = snapshot.knowledgePoints;
      state.knowledgeRelations = snapshot.knowledgeRelations;
      state.knowledgeToStepRelations = snapshot.knowledgeToStepRelations;
      state.knowledgeToCodeChunkRelations =
        snapshot.knowledgeToCodeChunkRelations;

      // 掌握度：重置为 0（每个学生从零开始）
      state.nodeMasteryScores = snapshot.nodeMasteryScores.map((score) => ({
        ...score,
        score: 0,
        updatedAt: now,
      }));

      // 认知边：直接从快照恢复，不重算
      state.cognitiveEdges = snapshot.cognitiveEdges;

      // 初始生成状态：标记为已完成
      state.initialGeneration = {
        status: "completed",
        currentPhase: "预设加载完成",
        progress: 100,
        errors: [],
      };

      // 清理运行时状态
      state.pinnedItems = [];
      state.globalQASession = null;
      state.cognitiveTrace = createEmptyCognitiveTrace();
      state.shouldClearIdeHighlights = false;
      state.codeChunksToHighlightInIde = [];
    },
    // 设置认知边（导出时由 buildCodeAwareCognitiveEdges 计算后存入）
    setCognitiveEdges: (
      state,
      action: PayloadAction<CodeAwareCognitiveEdge[]>,
    ) => {
      state.cognitiveEdges = action.payload;
    },
    // Mark steps as code_dirty based on code changes
    markStepsCodeDirty: (
      state,
      action: PayloadAction<{
        stepIds: string[];
      }>,
    ) => {
      action.payload.stepIds.forEach((stepId) => {
        const step = state.steps.find((s) => s.id === stepId);
        if (step && step.stepStatus === "generated") {
          step.stepStatus = "code_dirty";
        }
      });
    },
    // Update code chunk positions after code changes
    updateCodeChunkPositions: (
      state,
      action: PayloadAction<{
        updates: Array<{
          chunkId: string;
          newRange: [number, number];
        }>;
      }>,
    ) => {
      action.payload.updates.forEach((update) => {
        const mapping = state.codeAwareMappings.find(
          (m) => m.codeChunkId === update.chunkId,
        );
        // 注意：CodeAwareMapping 不存储 range 信息，range 是 code chunk 的属性
        // 现在 code chunk 不再静态存储，这个逻辑已经无效
        if (mapping) {
          console.warn(
            "⚠️ updateCodeChunkRanges reducer 已部分废弃，不再静态存储 code chunks",
          );
        }
      });
    },
    updateSaqTestResult: (
      state,
      action: PayloadAction<{
        stepId: string;
        knowledgeCardId: string;
        testId: string;
        userAnswer: string;
        isCorrect: boolean;
        remarks: string;
      }>,
    ) => {
      const {
        stepId,
        knowledgeCardId,
        testId,
        userAnswer,
        isCorrect,
        remarks,
      } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const kc = step.knowledgeCards.find((k) => k.id === knowledgeCardId);
        if (kc && kc.tests) {
          const test = kc.tests.find((t) => t.id === testId);
          if (test && test.question.type === "shortAnswer") {
            test.question.answer = userAnswer;
            test.question.result = isCorrect ? "correct" : "wrong";
            test.question.remarks = remarks;
          }
        }
      }
    },
    setSaqTestLoading: (
      state,
      action: PayloadAction<{
        stepId: string;
        knowledgeCardId: string;
        testId: string;
        isLoading: boolean;
      }>,
    ) => {
      const { stepId, knowledgeCardId, testId, isLoading } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const kc = step.knowledgeCards.find((k) => k.id === knowledgeCardId);
        if (kc && kc.tests) {
          const test = kc.tests.find((t) => t.id === testId);
          if (test) {
            // 添加一个loading状态到test对象
            (test as any).isLoading = isLoading;
          }
        }
      }
    },
    // Clear all code-related data and mappings
    clearAllCodeAndMappings: (state) => {
      // Clear all code chunks
      state.codeChunks = [];

      // Clear all code-related mappings (keep highLevelStep-only mappings)
      state.codeAwareMappings = state.codeAwareMappings.filter(
        (mapping) =>
          // 保留 highLevelStep 类型的映射（不涉及代码）
          mapping.semanticElementType === "highLevelStep" &&
          !mapping.codeChunkId,
      );

      state.codeChunkRelations = [];
      state.knowledgeToCodeChunkRelations = [];

      // Clear code chunks to highlight in IDE
      state.codeChunksToHighlightInIde = [];

      // Reset all steps to confirmed status (from generated)
      state.steps.forEach((step) => {
        if (step.stepStatus === "generated") {
          step.stepStatus = "confirmed";
        }
      });

      // Clear highlights
      codeAwareSessionSlice.caseReducers.clearAllHighlights(state);
    },
    // Code generation state management
    setCodeGenerationStatus: (
      state,
      action: PayloadAction<CodeAwareSessionState["codeGeneration"]["status"]>,
    ) => {
      state.codeGeneration.status = action.payload;
    },
    setCodeGenerationProgress: (state, action: PayloadAction<number>) => {
      state.codeGeneration.progress = Math.max(
        0,
        Math.min(100, action.payload),
      );
    },
    setCodeGenerationMessage: (state, action: PayloadAction<string>) => {
      state.codeGeneration.message = action.payload;
    },
    setCodeGenerationCurrentStep: (state, action: PayloadAction<string>) => {
      state.codeGeneration.currentStep = action.payload;
    },
    setCodeGenerationError: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.codeGeneration.error = action.payload;
    },
    resetCodeGenerationState: (state) => {
      state.codeGeneration = {
        status: "idle",
        message: "",
        progress: 0,
        currentStep: "",
        error: undefined,
      };
      state.codeGenerationDebugLogs = [];
    },
    appendCodeGenerationDebugLog: (state, action: PayloadAction<string>) => {
      // Keep the log bounded to avoid UI performance issues
      const nextLogs = [...state.codeGenerationDebugLogs, action.payload];
      const MAX_LOGS = 200;
      if (nextLogs.length > MAX_LOGS) {
        state.codeGenerationDebugLogs = nextLogs.slice(
          nextLogs.length - MAX_LOGS,
        );
      } else {
        state.codeGenerationDebugLogs = nextLogs;
      }
    },
    clearCodeGenerationDebugLogs: (state) => {
      state.codeGenerationDebugLogs = [];
    },
    recordCognitiveEvent: {
      reducer: (state, action: PayloadAction<CognitiveInteractionEvent>) => {
        const event = action.payload;

        state.cognitiveTrace.events = appendEventWithLimit(
          state.cognitiveTrace.events,
          event,
        );
        state.cognitiveTrace.stepVisitStats = updateStepVisitStats(
          state.cognitiveTrace.stepVisitStats,
          event,
        );
      },
      prepare: (
        event: Omit<CognitiveInteractionEvent, "id" | "timestamp"> & {
          id?: string;
          timestamp?: number;
        },
      ) => ({
        payload: {
          ...event,
          id:
            event.id ||
            `cog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: event.timestamp ?? Date.now(),
        },
      }),
    },
    clearCognitiveTrace: (state) => {
      state.cognitiveTrace = createEmptyCognitiveTrace();
    },
  },
  selectors: {
    //CATODO: write all the selectors to fetch the data
    selectCodeChunks: (state: CodeAwareSessionState) => {
      return state.codeChunks;
    },
    selectCodeAwareSessionState: (state: CodeAwareSessionState) => {
      return state;
    },
    selectIsRequirementInEditMode: (state: CodeAwareSessionState) => {
      // Requirement is in edit mode if it is either being edited or is empty
      if (!state.userRequirement) {
        return false; // If userRequirement is null, not in edit mode
      }
      return (
        state.userRequirement.requirementStatus === "editing" ||
        state.userRequirement.requirementStatus === "empty" ||
        state.userRequirement.requirementStatus === "confirmed"
      );
    },
    selectIsStepsGenerated: (state: CodeAwareSessionState) => {
      return (
        state.userRequirement?.requirementStatus === "finalized" &&
        state.steps.length > 0
      );
    },
    selectCurrentStep: (state: CodeAwareSessionState) => {
      // 根据step中的状态获取下一个待生成的步骤
      const currentStepIndex = state.steps.findIndex(
        (step) =>
          step.stepStatus === "editing" || step.stepStatus === "confirmed",
      );
      if (currentStepIndex !== -1) {
        return state.steps[currentStepIndex];
      }
      return null; // 如果没有找到当前步骤，则返回null
    },
    selectCanExecuteUntilStep: (
      state: CodeAwareSessionState,
      stepId: string,
    ) => {
      //如果截止到为stepId为止的步骤都已经generated或者confirmed，则可以执行
      const stepIndex = state.steps.findIndex((step) => step.id === stepId);
      if (stepIndex === -1) {
        return false; // 如果没有找到该步骤，则不能执行
      }
      // 检查所有之前的步骤是否都已经生成或确认
      for (let i = 0; i <= stepIndex; i++) {
        if (
          state.steps[i].stepStatus !== "generated" &&
          state.steps[i].stepStatus !== "confirmed"
        ) {
          return false; // 只要有一个步骤没有生成或确认，就不能执行
        }
      }
      return true; // 所有之前的步骤都已经生成或确认，可以执行
    },
    selectLearningGoal: (state: CodeAwareSessionState) => {
      return state.learningGoal;
    },
    selectTask: (state: CodeAwareSessionState) => {
      // 返回session的任务信息
      return state.userRequirement;
    },
    selectTitle: (state: CodeAwareSessionState) => {
      return state.title;
    },
    selectCognitiveTrace: (state: CodeAwareSessionState) => {
      return state.cognitiveTrace;
    },
  },
});

// Create memoized selectors outside of the slice to prevent re-renders
export const selectRequirementText = createSelector(
  (state: RootState) =>
    state.codeAwareSession.userRequirement?.requirementDescription,
  (requirementDescription): string => requirementDescription || "",
);

// 选择高级步骤
export const selectHighLevelSteps = createSelector(
  (state: RootState) => state.codeAwareSession.highLevelSteps,
  (highLevelSteps): HighLevelStepItem[] => highLevelSteps || [],
);

// 选择高级步骤叙述文段
export const selectHighLevelStepNarrative = createSelector(
  (state: RootState) => state.codeAwareSession.highLevelStepNarrative,
  (narrative): string => narrative || "",
);

export const {
  setUserRequirementStatus,
  submitRequirementContent,
  setGeneratedSteps,
  newCodeAwareSession,
  resetSessionExceptRequirement,
  clearAllHighlights,
  clearElementHighlight,
  setHighlightedElement,
  clearAllCodeChunks,
  clearAllCodeAwareMappings,
  updateHighlight,
  setHighLevelSteps,
  setHighLevelStepNarrative,
  setStepToHighLevelMappings,
  updateHighLevelStepCompletion,
  updateCodeChunks,
  updateCodeChunkRange,
  setCodeChunkDisabled,
  updateCodeAwareMappings,
  setCodeChunks,
  addCodeChunk,
  setCodeChunkRelations,
  addCodeChunkRelation,
  setKnowledgePoints,
  addKnowledgePoint,
  setKnowledgeRelations,
  addKnowledgeRelation,
  setKnowledgeToStepRelations,
  setKnowledgeToCodeChunkRelations,
  setNodeMasteryScores,
  upsertNodeMasteryScore,
  toggleMasteryIndicators,
  addPinnedItem,
  removePinnedItem,
  togglePinnedItem,
  clearPinnedItems,
  startGlobalQASession,
  addGlobalQAMessage,
  endGlobalQASession,
  setGlobalQASessionConverting,
  clearGlobalQASession,
  updateInitialGenerationStatus,
  resetInitialGenerationStatus,
  addInitialGenerationError,
  addMappingToCache,
  addMappingsToBatch,
  cleanupExpiredMappings,
  setMappingLookupLoading,
  setMappingLookupError,
  setMappingLookupQuery,
  removeCodeAwareMappings,
  clearKnowledgeCardCodeMappings,
  setCodeAwareTitle,
  setLearningGoal,
  resetIdeCommFlags,
  setKnowledgeCardLoading,
  updateKnowledgeCardContent,
  appendKnowledgeCardContent,
  setKnowledgeCardViewedAt,
  updateKnowledgeCardTests,
  setKnowledgeCardTestsLoading,
  updateKnowledgeCardTitle,
  setKnowledgeCardError,
  resetKnowledgeCardContent,
  setKnowledgeCardDisabled,
  setKnowledgeCardViewMode,
  setKnowledgeCardFeedback,
  addCodeChunkFromCompletion,
  createOrGetCodeChunk,
  createKnowledgeCard,
  createCodeAwareMapping,
  setStepStatus,
  setStepTitle,
  setStepGeneratedUntil,
  setKnowledgeCardGenerationStatus,
  setStepAbstract,
  markStepsCodeDirty,
  updateCodeChunkPositions,
  updateSaqTestResult,
  setSaqTestLoading,
  clearAllCodeAndMappings,
  setCodeGenerationStatus,
  setCodeGenerationProgress,
  setCodeGenerationMessage,
  setCodeGenerationCurrentStep,
  setCodeGenerationError,
  resetCodeGenerationState,
  appendCodeGenerationDebugLog,
  clearCodeGenerationDebugLogs,
  recordCognitiveEvent,
  clearCognitiveTrace,
  restoreFromSnapshot,
  setCognitiveEdges,
} = codeAwareSessionSlice.actions;

export const {
  selectCodeChunks,
  selectCodeAwareSessionState,
  selectIsRequirementInEditMode,
  selectIsStepsGenerated,
  selectCurrentStep,
  selectLearningGoal,
  selectTask,
  selectCanExecuteUntilStep,
  selectTitle,
  selectCognitiveTrace,
} = codeAwareSessionSlice.selectors;

// Selector to get test information by testId
export const selectTestByTestId = createSelector(
  (state: RootState) => state.codeAwareSession.steps,
  (_: RootState, testId: string) => testId,
  (
    steps,
    testId,
  ): {
    stepId: string;
    knowledgeCardId: string;
    test: {
      id: string;
      stem: string;
      standard_answer: string;
      question_type: "shortAnswer" | "multipleChoice";
    } | null;
  } | null => {
    for (const step of steps) {
      for (const kc of step.knowledgeCards) {
        if (kc.tests) {
          for (const test of kc.tests) {
            if (test.id === testId) {
              return {
                stepId: step.id,
                knowledgeCardId: kc.id,
                test: {
                  id: test.id,
                  stem: test.question.stem,
                  standard_answer: test.question.standard_answer,
                  question_type: test.question.type,
                },
              };
            }
          }
        }
      }
    }
    return null;
  },
);

// Selector to get test loading state by testId
export const selectTestLoadingState = createSelector(
  (state: RootState) => state.codeAwareSession.steps,
  (_: RootState, testId: string) => testId,
  (steps, testId): boolean => {
    for (const step of steps) {
      for (const kc of step.knowledgeCards) {
        if (kc.tests) {
          for (const test of kc.tests) {
            if (test.id === testId) {
              return (test as any).isLoading || false;
            }
          }
        }
      }
    }
    return false;
  },
);

// Selector for current session ID
export const selectCurrentSessionId = createSelector(
  (state: RootState) => state.codeAwareSession.currentSessionId,
  (currentSessionId) => currentSessionId,
);

export default codeAwareSessionSlice.reducer;

// Export a named initial state constant for tests/mocks
export const INITIAL_CODEAWARE_SESSION_STATE: CodeAwareSessionState =
  initialCodeAwareState;
