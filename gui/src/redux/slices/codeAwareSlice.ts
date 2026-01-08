//CATODO: 参考着sessionSlice中chatHistory的实现方式加入codeaware的所有数据结构，包括UserIntent,UserMastery,Flow,KnowledgeCard,Quizzes
import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  CodeAwareMapping,
  CodeChunk,
  CollaborationStatus,
  HighLevelStepItem,
  HighlightEvent,
  KnowledgeCardGenerationStatus,
  KnowledgeCardItem,
  ProgramRequirement,
  StepItem,
  StepStatus,
  StepToHighLevelMapping,
} from "core";
import { v4 as uuidv4 } from "uuid";

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
  //步骤与高级步骤的对应关系
  stepToHighLevelMappings: StepToHighLevelMapping[];
  //当前的flow
  steps: StepItem[];
  //当前的代码块
  codeChunks: CodeChunk[];
  //存储所有的Mapping，用于查找和触发相关元素的高亮，各个元素的高亮写在元素之中
  codeAwareMappings: CodeAwareMapping[];
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
  stepToHighLevelMappings: [],
  steps: [],
  codeChunks: [],
  codeAwareMappings: [],
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
      state.stepToHighLevelMappings = [];
      state.steps = [];
      state.codeAwareMappings = [];
      state.codeChunks = [];
      state.shouldClearIdeHighlights = false;
      state.codeChunksToHighlightInIde = [];
    },
    clearAllHighlights: (state) => {
      // Reset highlight status for all mappings
      state.codeAwareMappings.forEach((mapping) => {
        mapping.isHighlighted = false;
      });
      // Reset highlight status for all code chunks
      state.codeChunks.forEach((chunk) => {
        chunk.isHighlighted = false;
      });
      // Reset highlight status for all high level steps
      state.highLevelSteps = state.highLevelSteps.map((step) => ({
        ...step,
        isHighlighted: false,
      }));
      // Reset highlight status for all steps
      state.steps = state.steps.map((step) => {
        return {
          ...step,
          isHighlighted: false,
          knowledgeCards: step.knowledgeCards.map((card) => ({
            ...card,
            isHighlighted: false,
          })),
        };
      });

      // Set flag to clear IDE highlights
      state.shouldClearIdeHighlights = true;
      state.codeChunksToHighlightInIde = [];
    },
    clearAllCodeChunks: (state) => {
      // Clear all code chunks
      state.codeChunks = [];
    },
    clearAllCodeAwareMappings: (state) => {
      // Clear all CodeAware mappings
      state.codeAwareMappings = [];
    },
    updateHighlight: (
      state,
      action: PayloadAction<HighlightEvent | HighlightEvent[]>,
    ) => {
      // 统一处理单个或多个事件，保持向后兼容性
      const events = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      // 收集所有匹配的mappings
      let allMatchedMappings: CodeAwareMapping[] = [];

      // 处理每个事件
      events.forEach(({ sourceType, identifier, additionalInfo }) => {
        // Find all mappings that match the highlight event
        let matchedMappings: CodeAwareMapping[] = [];

        // First, try to match by identifier - collect all matching mappings
        for (const mapping of state.codeAwareMappings) {
          let isMatch = false;

          switch (sourceType) {
            case "code":
              isMatch = mapping.codeChunkId === identifier;
              break;
            case "highLevelStep":
              isMatch = mapping.highLevelStepId === identifier;
              break;
            case "step":
              isMatch = mapping.stepId === identifier;
              break;
            case "knowledgeCard":
              isMatch = mapping.knowledgeCardId === identifier;
              break;
          }

          if (isMatch) {
            matchedMappings.push(mapping);
          }
        }

        // If no match found by identifier and sourceType is "code", try meta search using additionalInfo
        if (
          matchedMappings.length === 0 &&
          sourceType === "code" &&
          additionalInfo
        ) {
          const codeInfo = additionalInfo as CodeChunk;

          // Search through code chunks to find a match by line range and content
          for (const codeChunk of state.codeChunks) {
            // Check if line ranges overlap or match
            const rangesOverlap =
              codeInfo.range[0] <= codeChunk.range[1] &&
              codeInfo.range[1] >= codeChunk.range[0];

            // Check if content matches (partial match allowed)
            const contentMatches =
              codeChunk.content.includes(codeInfo.content) ||
              codeInfo.content.includes(codeChunk.content);

            if (rangesOverlap && contentMatches) {
              // Find all mappings for this code chunk
              const foundMappings = state.codeAwareMappings.filter(
                (mapping) => mapping.codeChunkId === codeChunk.id,
              );
              matchedMappings.push(...foundMappings);
            }
          }
        }

        // 将匹配的mappings添加到总列表中，避免重复
        matchedMappings.forEach((mapping) => {
          if (
            !allMatchedMappings.some(
              (m) =>
                m.codeChunkId === mapping.codeChunkId &&
                m.highLevelStepId === mapping.highLevelStepId &&
                m.stepId === mapping.stepId &&
                m.knowledgeCardId === mapping.knowledgeCardId,
            )
          ) {
            allMatchedMappings.push(mapping);
          }
        });
      });

      console.log(
        `Found ${allMatchedMappings.length} matched mappings for highlight events.`,
      );
      console.log("Matched mappings:", allMatchedMappings);
      console.log("🔍 Processing events:", events);

      // 特殊处理：如果是step类型的事件但没有找到映射关系，直接高亮步骤
      events.forEach(({ sourceType, identifier }) => {
        if (sourceType === "step") {
          const stepIndex = state.steps.findIndex(
            (step) => step.id === identifier,
          );
          if (stepIndex !== -1) {
            // 确保步骤被加入到高亮列表中，即使没有映射关系
            const hasStepMapping = allMatchedMappings.some(
              (mapping) => mapping.stepId === identifier,
            );
            if (!hasStepMapping) {
              console.log(
                `🎯 No mapping found for step ${identifier}, but will highlight step directly`,
              );
              // 创建一个虚拟的映射来确保步骤被高亮
              allMatchedMappings.push({
                stepId: identifier,
                isHighlighted: false,
              });
            }
          }
        }
      });

      // If mappings are found, update highlight status of all elements within them
      if (allMatchedMappings.length > 0) {
        // Clear all existing highlights using the dedicated reducer
        codeAwareSessionSlice.caseReducers.clearAllHighlights(state);

        // Collect unique IDs from all matched mappings to avoid duplicate highlighting
        const codeChunkIds = new Set<string>();
        const highLevelStepIds = new Set<string>();
        const stepIds = new Set<string>();
        const knowledgeCardIds = new Set<string>();

        allMatchedMappings.forEach((mapping) => {
          if (mapping.codeChunkId) codeChunkIds.add(mapping.codeChunkId);
          if (mapping.highLevelStepId)
            highLevelStepIds.add(mapping.highLevelStepId);
          if (mapping.stepId) stepIds.add(mapping.stepId);
          if (mapping.knowledgeCardId)
            knowledgeCardIds.add(mapping.knowledgeCardId);
        });

        console.log("🎯 IDs to highlight:", {
          codeChunkIds: Array.from(codeChunkIds),
          highLevelStepIds: Array.from(highLevelStepIds),
          stepIds: Array.from(stepIds),
          knowledgeCardIds: Array.from(knowledgeCardIds),
        });

        // Collect code chunks to highlight in IDE
        const codeChunksForIde: CodeChunk[] = [];

        console.log("code chunks", state.codeChunks);
        console.log(
          "Available code chunks:",
          state.codeChunks.map((c) => ({
            id: c.id,
            content: c.content.substring(0, 50),
          })),
        );

        // Update code chunk highlights
        codeChunkIds.forEach((codeChunkId) => {
          const codeChunk = state.codeChunks.find(
            (chunk) => chunk.id === codeChunkId,
          );
          console.log(
            `Highlighting code chunk: ${codeChunkId}, found:`,
            !!codeChunk,
          );
          if (codeChunk && !codeChunk.disabled) {
            // 跳过被禁用的代码块
            codeChunk.isHighlighted = true;
            codeChunksForIde.push(codeChunk);
          } else if (codeChunk && codeChunk.disabled) {
            console.log(
              `Code chunk ${codeChunkId} is disabled, skipping highlight`,
            );
          } else {
            console.warn(
              `Code chunk with id ${codeChunkId} not found in state.codeChunks`,
            );
          }
        });

        console.log("Code chunks to highlight in IDE:", codeChunksForIde);

        // Set code chunks to highlight in IDE
        state.codeChunksToHighlightInIde = codeChunksForIde;
        state.shouldClearIdeHighlights = false;

        // Update high level steps highlights
        highLevelStepIds.forEach((highLevelStepId) => {
          const highLevelStepIndex = state.highLevelSteps.findIndex(
            (step) => step.id === highLevelStepId,
          );
          if (highLevelStepIndex !== -1) {
            console.log(
              `🎯 Highlighting high level step ${highLevelStepId} at index:`,
              highLevelStepIndex,
            );
            state.highLevelSteps[highLevelStepIndex] = {
              ...state.highLevelSteps[highLevelStepIndex],
              isHighlighted: true,
            };
          }
        });

        // Update step highlights
        stepIds.forEach((stepId) => {
          const stepIndex = state.steps.findIndex((step) => step.id === stepId);
          console.log(
            `🎯 Trying to highlight step ${stepId}, found at index:`,
            stepIndex,
          );
          if (stepIndex !== -1) {
            console.log(
              `🎯 Before highlight - step ${stepId} isHighlighted:`,
              state.steps[stepIndex].isHighlighted,
            );
            // Create a new step object to ensure React detects the change
            state.steps[stepIndex] = {
              ...state.steps[stepIndex],
              isHighlighted: true,
            };
            console.log(
              `🎯 After highlight - step ${stepId} isHighlighted:`,
              state.steps[stepIndex].isHighlighted,
            );
          } else {
            console.warn(`🎯 Step ${stepId} not found in steps array`);
          }
        });

        // Update knowledge card highlights (只有当事件中包含 code 或 knowledgeCard 源时才更新)
        const hasCodeOrKnowledgeCardSource = events.some(
          (event) =>
            event.sourceType === "code" || event.sourceType === "knowledgeCard",
        );

        if (hasCodeOrKnowledgeCardSource) {
          knowledgeCardIds.forEach((knowledgeCardId) => {
            for (const step of state.steps) {
              const knowledgeCard = step.knowledgeCards.find(
                (card) => card.id === knowledgeCardId,
              );
              if (knowledgeCard) {
                knowledgeCard.isHighlighted = true;
                break; // Found the knowledge card, no need to continue searching
              }
            }
          });
        }

        // Update all matched mappings' highlight status
        allMatchedMappings.forEach((mapping) => {
          mapping.isHighlighted = true;
        });

        console.log("✨ Highlight update completed");
      } else {
        // 如果没有找到任何映射关系，但有step事件，仍然需要高亮步骤
        const stepOnlyEvents = events.filter(
          (event) => event.sourceType === "step",
        );
        if (stepOnlyEvents.length > 0) {
          console.log("🎯 No mappings found, but highlighting steps directly");

          // Clear all existing highlights first
          codeAwareSessionSlice.caseReducers.clearAllHighlights(state);

          stepOnlyEvents.forEach(({ identifier }) => {
            const stepIndex = state.steps.findIndex(
              (step) => step.id === identifier,
            );
            console.log(
              `🎯 Trying to highlight step ${identifier} directly, found at index:`,
              stepIndex,
            );
            if (stepIndex !== -1) {
              console.log(
                `🎯 Before direct highlight - step ${identifier} isHighlighted:`,
                state.steps[stepIndex].isHighlighted,
              );
              state.steps[stepIndex] = {
                ...state.steps[stepIndex],
                isHighlighted: true,
              };
              console.log(
                `🎯 After direct highlight - step ${identifier} isHighlighted:`,
                state.steps[stepIndex].isHighlighted,
              );
            }
          });
        }
      }
    },
    // 设置高级步骤
    setHighLevelSteps: (state, action: PayloadAction<HighLevelStepItem[]>) => {
      state.highLevelSteps = action.payload;
    },
    // 设置步骤与高级步骤的映射关系
    setStepToHighLevelMappings: (
      state,
      action: PayloadAction<StepToHighLevelMapping[]>,
    ) => {
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
      state.codeChunks.push(...action.payload);
    },
    // 更新代码块的范围
    updateCodeChunkRange: (
      state,
      action: PayloadAction<{ codeChunkId: string; range: [number, number] }>,
    ) => {
      const { codeChunkId, range } = action.payload;
      const chunk = state.codeChunks.find((c) => c.id === codeChunkId);
      if (chunk) {
        chunk.range = range;
      }
    },
    // 设置代码块的禁用状态
    setCodeChunkDisabled: (
      state,
      action: PayloadAction<{ codeChunkId: string; disabled: boolean }>,
    ) => {
      const { codeChunkId, disabled } = action.payload;
      const chunk = state.codeChunks.find((c) => c.id === codeChunkId);
      if (chunk) {
        chunk.disabled = disabled;
      }
    },
    updateCodeAwareMappings: (
      state,
      action: PayloadAction<CodeAwareMapping[]>,
    ) => {
      // 使用 Set 来高效检查重复的 mapping
      const existingMappingsSet = new Set(
        state.codeAwareMappings.map(
          (mapping) =>
            `${mapping.codeChunkId || ""}-${mapping.highLevelStepId || ""}-${mapping.stepId || ""}-${mapping.knowledgeCardId || ""}`,
        ),
      );

      // 过滤出不重复的 mapping
      const newMappings = action.payload.filter((newMapping) => {
        const mappingKey = `${newMapping.codeChunkId || ""}-${newMapping.highLevelStepId || ""}-${newMapping.stepId || ""}-${newMapping.knowledgeCardId || ""}`;
        return !existingMappingsSet.has(mappingKey);
      });

      state.codeAwareMappings.push(...newMappings);
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
      const { completionText, range, filePath } = action.payload;
      const newCodeChunk: CodeChunk = {
        id: `c-${state.codeChunks.length + 1}`,
        content: completionText,
        range: range,
        isHighlighted: false,
        disabled: false,
        filePath: filePath,
      };
      state.codeChunks.push(newCodeChunk);
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
      const { content, range, filePath, id: presetId } = action.payload;

      // 首先检查是否已经存在类似的代码块
      const existingChunk = state.codeChunks.find(
        (chunk) =>
          chunk.filePath === filePath &&
          chunk.content === content &&
          chunk.range[0] === range[0] &&
          chunk.range[1] === range[1],
      );

      if (!existingChunk) {
        // 如果不存在，创建新的代码块
        const newCodeChunk: CodeChunk = {
          id: presetId || `c-${state.codeChunks.length + 1}`, // 使用预设ID或基于长度的ID
          content,
          range,
          isHighlighted: false,
          disabled: false,
          filePath,
        };

        state.codeChunks.push(newCodeChunk);
      }
    },
    // 创建新的知识卡片（不包含content和tests）
    createKnowledgeCard: (
      state,
      action: PayloadAction<{
        stepId: string;
        cardId: string;
        theme: string;
      }>,
    ) => {
      const { stepId, cardId, theme } = action.payload;
      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        const newCard: KnowledgeCardItem = {
          id: cardId,
          title: theme,
          content: "",
          tests: [],
          isHighlighted: false,
          disabled: false,
        };
        step.knowledgeCards.push(newCard);
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
        stepId?: string;
        knowledgeCardId?: string;
        codeChunkId?: string;
      }>,
    ) => {
      const { stepId, knowledgeCardId, codeChunkId } = action.payload;
      state.codeAwareMappings = state.codeAwareMappings.filter((mapping) => {
        // 如果指定了stepId，删除所有包含该stepId的映射
        if (stepId && mapping.stepId === stepId) {
          return false;
        }
        // 如果指定了knowledgeCardId，删除所有包含该knowledgeCardId的映射
        if (knowledgeCardId && mapping.knowledgeCardId === knowledgeCardId) {
          return false;
        }
        // 如果指定了codeChunkId，删除所有包含该codeChunkId的映射
        if (codeChunkId && mapping.codeChunkId === codeChunkId) {
          return false;
        }
        return true;
      });
    },
    // 清除所有知识卡片的代码映射（保留步骤到需求的映射）
    clearKnowledgeCardCodeMappings: (state) => {
      state.codeAwareMappings = state.codeAwareMappings.filter((mapping) => {
        // 保留不包含知识卡片ID或代码块ID的映射（即步骤到高阶需求的映射）
        return (
          !mapping.knowledgeCardId &&
          !mapping.codeChunkId &&
          mapping.highLevelStepId
        );
      });
    },
    resetSessionExceptRequirement: (state) => {
      // Clear all highlights first
      codeAwareSessionSlice.caseReducers.clearAllHighlights(state);
      // Reset everything except userRequirement and currentSessionId
      state.highLevelSteps = [];
      state.stepToHighLevelMappings = [];
      state.steps = [];
      state.codeChunks = [];
      state.codeAwareMappings = [];
      state.shouldClearIdeHighlights = false;
      state.codeChunksToHighlightInIde = [];
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
        const chunk = state.codeChunks.find((c) => c.id === update.chunkId);
        if (chunk) {
          chunk.range = update.newRange;
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

      // Clear all code-related mappings (keep step-to-high-level-step mappings)
      state.codeAwareMappings = state.codeAwareMappings.filter(
        (mapping) =>
          // 保留只包含stepId和highLevelStepId的映射（步骤到高阶需求的映射）
          mapping.stepId &&
          mapping.highLevelStepId &&
          !mapping.codeChunkId &&
          !mapping.knowledgeCardId,
      );

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

// 选择步骤到高级步骤的映射关系
export const selectStepToHighLevelMappings = createSelector(
  (state: RootState) => state.codeAwareSession.stepToHighLevelMappings,
  (mappings): StepToHighLevelMapping[] => mappings || [],
);

// 为给定步骤 ID 查找对应的高级步骤序号
export const selectHighLevelStepIndexForStep = createSelector(
  [selectStepToHighLevelMappings, (_: RootState, stepId: string) => stepId],
  (mappings, stepId): number | null => {
    const mapping = mappings.find((m) => m.stepId === stepId);
    return mapping ? mapping.highLevelStepIndex : null;
  },
);

export const {
  setUserRequirementStatus,
  submitRequirementContent,
  setGeneratedSteps,
  newCodeAwareSession,
  resetSessionExceptRequirement,
  clearAllHighlights,
  clearAllCodeChunks,
  clearAllCodeAwareMappings,
  updateHighlight,
  setHighLevelSteps,
  setStepToHighLevelMappings,
  updateHighLevelStepCompletion,
  updateCodeChunks,
  updateCodeChunkRange,
  setCodeChunkDisabled,
  updateCodeAwareMappings,
  removeCodeAwareMappings,
  clearKnowledgeCardCodeMappings,
  setCodeAwareTitle,
  setLearningGoal,
  resetIdeCommFlags,
  setKnowledgeCardLoading,
  updateKnowledgeCardContent,
  updateKnowledgeCardTests,
  setKnowledgeCardTestsLoading,
  updateKnowledgeCardTitle,
  setKnowledgeCardError,
  resetKnowledgeCardContent,
  setKnowledgeCardDisabled,
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
