import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  CodeAwareMapping,
  CodeChunk,
  HighLevelStepItem,
  ProgramRequirement,
  StepItem,
  StepToHighLevelMapping,
} from "core";
import {
  constructEvaluateSaqAnswerPrompt,
  constructFindStepRelatedCodeLinesPrompt,
  constructGenerateKnowledgeCardDetailPrompt,
  constructGenerateKnowledgeCardTestsPrompt, // 新增测试题生成prompt
  constructGenerateKnowledgeCardThemesFromQueryPrompt,
  constructGenerateKnowledgeCardThemesPrompt,
  constructGenerateStepsPrompt,
  constructGlobalQuestionPrompt,
  constructMapKnowledgeCardsToCodePrompt,
  constructParaphraseUserIntentPrompt,
  constructProcessCodeChangesPrompt,
} from "../../../../core/llm/codeAwarePrompts";
import {
  clearAllCodeAwareMappings,
  clearAllCodeChunks,
  clearKnowledgeCardCodeMappings,
  createCodeAwareMapping,
  createKnowledgeCard,
  createOrGetCodeChunk,
  removeCodeAwareMappings,
  resetKnowledgeCardContent,
  selectTestByTestId,
  setCodeAwareTitle,
  setCodeChunkDisabled,
  setGeneratedSteps,
  setHighLevelSteps,
  setKnowledgeCardError,
  setKnowledgeCardGenerationStatus,
  setKnowledgeCardLoading,
  setKnowledgeCardTestsLoading, // 新增：导入测试题loading状态action
  setLearningGoal,
  setSaqTestLoading,
  setStepAbstract,
  setStepStatus,
  setStepTitle,
  setStepToHighLevelMappings,
  setUserRequirementStatus,
  submitRequirementContent,
  updateCodeAwareMappings,
  updateHighLevelStepCompletion,
  updateHighlight,
  updateKnowledgeCardContent,
  updateKnowledgeCardTests,
  updateKnowledgeCardTitle,
  updateSaqTestResult,
} from "../slices/codeAwareSlice";
import {
  selectJsonGenerationModel,
  selectSelectedChatModel,
} from "../slices/configSlice";
import { ThunkApiType } from "../store";

// 辅助函数：检查并更新高级步骤的完成状态
export const checkAndUpdateHighLevelStepCompletion = createAsyncThunk<
  void,
  void,
  ThunkApiType
>(
  "codeAware/checkAndUpdateHighLevelStepCompletion",
  async (_, { dispatch, getState }) => {
    const state = getState();
    const steps = state.codeAwareSession.steps;
    const stepToHighLevelMappings =
      state.codeAwareSession.stepToHighLevelMappings;
    const highLevelSteps = state.codeAwareSession.highLevelSteps;

    // 为每个高级步骤检查其对应的所有步骤是否都已生成
    highLevelSteps.forEach((highLevelStep) => {
      const relatedSteps = stepToHighLevelMappings
        .filter((mapping) => mapping.highLevelStepId === highLevelStep.id)
        .map((mapping) => steps.find((step) => step.id === mapping.stepId))
        .filter((step) => step !== undefined);

      // 判断该高级步骤是否完成：所有相关步骤状态为 "generated"
      const isCompleted =
        relatedSteps.length > 0 &&
        relatedSteps.every((step) => step!.stepStatus === "generated");

      // 如果完成状态发生变化，更新状态
      if (isCompleted !== highLevelStep.isCompleted) {
        dispatch(
          updateHighLevelStepCompletion({
            highLevelStepId: highLevelStep.id,
            isCompleted,
          }),
        );
      }
    });
  },
);

// 辅助函数：处理新的代码块映射格式（只有行号范围）并转换为旧格式
function processCodeChunkMappingResponse(
  mappingResponse: any,
  generatedCode: string,
): {
  stepsCorrespondingCode: Array<{ id: string; code: string }>;
  stepsCodeLines: Map<string, string[]>;
  codeChunks: Array<{
    id: string;
    content: string;
    range: [number, number];
    stepIds: string[];
  }>;
} {
  const codeChunksData = mappingResponse.code_chunks || [];
  const stepsCorrespondingCode: Array<{ id: string; code: string }> = [];
  const stepsCodeLines = new Map<string, string[]>();
  const stepToCodeChunks = new Map<string, string[]>();
  const codeChunks: Array<{
    id: string;
    content: string;
    range: [number, number];
    stepIds: string[];
  }> = [];

  // 将完整代码按行分割
  const codeLines = generatedCode.split("\n");

  // 遍历代码块，将每个代码块映射到对应的步骤
  codeChunksData.forEach((chunk: any, index: number) => {
    const correspondingSteps = chunk.corresponding_steps || [];
    const startLine = chunk.start_line;
    const endLine = chunk.end_line;
    const semanticDescription = chunk.semantic_description || "";

    // 验证行号范围
    if (
      !startLine ||
      !endLine ||
      startLine < 1 ||
      endLine > codeLines.length ||
      startLine > endLine
    ) {
      console.warn(`⚠️ 代码块 ${index + 1} 行号范围无效:`, {
        startLine,
        endLine,
        totalLines: codeLines.length,
      });
      return;
    }

    // 从生成的代码中提取对应行的内容
    const chunkLines = codeLines.slice(startLine - 1, endLine); // 转换为0基索引
    const codeContent = chunkLines.join("\n");

    // 记录调试信息
    console.log(`📦 处理代码块 ${index + 1}:`, {
      startLine,
      endLine,
      semanticDescription,
      correspondingSteps,
      linesCount: chunkLines.length,
      codePreview:
        codeContent.substring(0, 50) + (codeContent.length > 50 ? "..." : ""),
    });

    // 创建代码块信息
    const chunkId = `c-${index + 1}`;
    codeChunks.push({
      id: chunkId,
      content: codeContent,
      range: [startLine, endLine],
      stepIds: correspondingSteps,
    });

    if (codeContent.trim()) {
      // 为每个相关步骤添加这个代码块
      correspondingSteps.forEach((stepId: string) => {
        if (!stepToCodeChunks.has(stepId)) {
          stepToCodeChunks.set(stepId, []);
        }
        stepToCodeChunks.get(stepId)!.push(codeContent);
      });
    }
  });

  // 转换为旧格式
  stepToCodeChunks.forEach((codeContents, stepId) => {
    // 保存原始代码块数组
    stepsCodeLines.set(stepId, codeContents);

    // 合并代码内容
    const combinedCode = codeContents.join("\n\n"); // 用双换行分隔多个代码块
    if (combinedCode.trim()) {
      stepsCorrespondingCode.push({
        id: stepId,
        code: combinedCode,
      });
    }
  });

  console.log("✅ 代码块映射处理完成:", {
    totalChunks: codeChunksData.length,
    createdCodeChunks: codeChunks.length,
    stepsWithCode: stepsCorrespondingCode.length,
    stepIds: stepsCorrespondingCode.map((s) => s.id),
  });

  return { stepsCorrespondingCode, stepsCodeLines, codeChunks };
}

// 辅助函数：验证代码块映射的完整性和连续性
function validateCodeChunkMapping(
  codeChunksData: any[],
  originalCode: string,
): {
  isValid: boolean;
  coverage: number;
  gaps: Array<{ start: number; end: number }>;
  overlaps: Array<{ chunk1: number; chunk2: number }>;
} {
  const originalLines = originalCode.split("\n");
  const totalLines = originalLines.length;
  const coveredLines = new Set<number>();
  const gaps: Array<{ start: number; end: number }> = [];
  const overlaps: Array<{ chunk1: number; chunk2: number }> = [];

  // 记录每个代码块覆盖的行号
  codeChunksData.forEach((chunk, chunkIndex) => {
    const startLine = chunk.start_line;
    const endLine = chunk.end_line;

    if (startLine && endLine && startLine <= endLine) {
      for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        if (coveredLines.has(lineNum)) {
          // 发现重叠
          const conflictChunk = codeChunksData.findIndex(
            (c, idx) =>
              idx < chunkIndex &&
              c.start_line <= lineNum &&
              c.end_line >= lineNum,
          );
          if (conflictChunk >= 0) {
            overlaps.push({ chunk1: conflictChunk, chunk2: chunkIndex });
          }
        }
        coveredLines.add(lineNum);
      }
    }
  });

  // 查找未覆盖的行（缺口）
  let gapStart: number | null = null;
  for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
    if (!coveredLines.has(lineNum)) {
      if (gapStart === null) {
        gapStart = lineNum;
      }
    } else {
      if (gapStart !== null) {
        gaps.push({ start: gapStart, end: lineNum - 1 });
        gapStart = null;
      }
    }
  }

  // 处理末尾的缺口
  if (gapStart !== null) {
    gaps.push({ start: gapStart, end: totalLines });
  }

  const coverage = coveredLines.size / totalLines;
  const isValid = gaps.length === 0 && overlaps.length === 0;

  console.log("🔍 代码块映射验证结果:", {
    totalLines,
    coveredLines: coveredLines.size,
    coverage: `${(coverage * 100).toFixed(1)}%`,
    gaps: gaps.length,
    overlaps: overlaps.length,
    isValid,
  });

  if (gaps.length > 0) {
    console.warn("⚠️ 发现代码覆盖缺口:", gaps);
  }

  if (overlaps.length > 0) {
    console.warn("⚠️ 发现代码块重叠:", overlaps);
  }

  return { isValid, coverage, gaps, overlaps };
}

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

// 辅助函数：计算代码块在完整代码中的行号范围
function calculateCodeChunkRange(
  fullCode: string,
  chunkCode: string,
): [number, number] {
  const fullCodeLines = fullCode.split("\n");
  const chunkLines = chunkCode.split("\n");

  // 辅助函数：计算两个字符串的相似度
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().replace(/\s+/g, " ").trim();
    const s2 = str2.toLowerCase().replace(/\s+/g, " ").trim();

    if (s1 === s2) return 1.0; // 完全匹配
    if (s1.length === 0 || s2.length === 0) return 0.0;

    // 使用最长公共子序列算法计算相似度
    const lcs = (a: string, b: string): number => {
      const dp = Array(a.length + 1)
        .fill(0)
        .map(() => Array(b.length + 1).fill(0));

      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          if (a[i - 1] === b[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }
      return dp[a.length][b.length];
    };

    const lcsLength = lcs(s1, s2);
    return (2 * lcsLength) / (s1.length + s2.length);
  };

  // 如果代码块只有一行
  if (chunkLines.length === 1) {
    const chunkLine = chunkLines[0];

    // 首先尝试精确匹配
    for (let i = 0; i < fullCodeLines.length; i++) {
      if (fullCodeLines[i] === chunkLine) {
        return [i + 1, i + 1]; // 转换为1基索引
      }
    }

    // 如果精确匹配失败，尝试去掉空白再匹配
    const chunkLineTrimmed = chunkLine.trim();
    for (let i = 0; i < fullCodeLines.length; i++) {
      if (fullCodeLines[i].trim() === chunkLineTrimmed) {
        return [i + 1, i + 1]; // 转换为1基索引
      }
    }

    // 如果还是失败，进行部分匹配，找到相似度最高的行
    if (chunkLineTrimmed.length > 0) {
      let bestMatch = -1;
      let bestSimilarity = 0;
      const minSimilarity = 0.6; // 最低相似度阈值

      for (let i = 0; i < fullCodeLines.length; i++) {
        const fullLineTrimmed = fullCodeLines[i].trim();
        if (fullLineTrimmed.length === 0) continue; // 跳过空行

        const similarity = calculateSimilarity(
          chunkLineTrimmed,
          fullLineTrimmed,
        );

        if (similarity > bestSimilarity && similarity >= minSimilarity) {
          bestSimilarity = similarity;
          bestMatch = i;
        }
      }

      if (bestMatch !== -1) {
        console.log(
          `📍 单行代码部分匹配成功: 相似度 ${(bestSimilarity * 100).toFixed(1)}%`,
          {
            chunkLine: chunkLineTrimmed.substring(0, 50) + "...",
            matchedLine:
              fullCodeLines[bestMatch].trim().substring(0, 50) + "...",
            lineNumber: bestMatch + 1,
          },
        );
        return [bestMatch + 1, bestMatch + 1]; // 转换为1基索引
      }
    }
  }

  // 如果代码块有多行，尝试找到连续匹配的行
  for (let i = 0; i <= fullCodeLines.length - chunkLines.length; i++) {
    // 检查是否所有行都匹配（先尝试精确匹配，包括空行）
    let allMatch = true;
    for (let j = 0; j < chunkLines.length; j++) {
      if (fullCodeLines[i + j] !== chunkLines[j]) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return [i + 1, i + chunkLines.length]; // 转换为1基索引
    }

    // 如果精确匹配失败，尝试去掉首尾空白后匹配（但保留空行结构）
    allMatch = true;
    for (let j = 0; j < chunkLines.length; j++) {
      const fullLine = fullCodeLines[i + j];
      const chunkLine = chunkLines[j];

      // 如果两者都是空行或都是空白行，认为匹配
      if (fullLine.trim() === "" && chunkLine.trim() === "") {
        continue;
      }

      // 对于非空行，比较去空白后的内容
      if (fullLine.trim() !== chunkLine.trim()) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return [i + 1, i + chunkLines.length]; // 转换为1基索引
    }
  }

  // 如果无法精确匹配，尝试部分匹配
  const firstChunkLine = chunkLines[0].trim();
  const lastChunkLine = chunkLines[chunkLines.length - 1].trim();

  for (let i = 0; i < fullCodeLines.length; i++) {
    const fullLine = fullCodeLines[i].trim();
    if (fullLine === firstChunkLine && firstChunkLine !== "") {
      // 找到第一行匹配，尝试找到最后一行
      for (let j = i; j < fullCodeLines.length; j++) {
        if (fullCodeLines[j].trim() === lastChunkLine && lastChunkLine !== "") {
          return [i + 1, j + 1]; // 转换为1基索引
        }
      }
      // 如果只找到第一行，估算结束位置
      const estimatedEnd = Math.min(
        i + chunkLines.length,
        fullCodeLines.length,
      );
      return [i + 1, estimatedEnd]; // 转换为1基索引
    }
  }

  // 如果都无法匹配，返回默认范围
  console.warn("无法为代码块计算精确的行号范围，使用默认范围", {
    chunkLinesCount: chunkLines.length,
    fullCodeLinesCount: fullCodeLines.length,
    chunkPreview: chunkCode.substring(0, 100),
  });
  return [1, Math.min(chunkLines.length, fullCodeLines.length)];
}

// 辅助函数：找到单行代码在完整代码中的位置（支持模糊匹配）
function findLineInFullCode(
  line: string,
  fullCodeLines: string[],
  startFromIndex: number = 0,
): number {
  const trimmedLine = line.trim();
  if (!trimmedLine) return -1;

  // 首先尝试精确匹配
  for (let i = startFromIndex; i < fullCodeLines.length; i++) {
    if (fullCodeLines[i].trim() === trimmedLine) {
      return i + 1; // 返回1-based行号
    }
  }

  // 如果精确匹配失败，尝试去掉特殊字符后匹配
  const normalizedLine = trimmedLine
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalizedLine) {
    for (let i = startFromIndex; i < fullCodeLines.length; i++) {
      const normalizedFullLine = fullCodeLines[i]
        .trim()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (normalizedFullLine === normalizedLine) {
        return i + 1; // 返回1-based行号
      }
    }
  }

  // 如果还是失败，尝试包含匹配
  for (let i = startFromIndex; i < fullCodeLines.length; i++) {
    const fullLine = fullCodeLines[i].trim();
    if (fullLine.includes(trimmedLine) || trimmedLine.includes(fullLine)) {
      return i + 1; // 返回1-based行号
    }
  }

  return -1; // 未找到
}

// 辅助函数：从字符串数组创建代码块（支持连续行合并）
function createCodeChunksFromLineArray(
  codeLines: string[],
  fullCode: string,
  baseId: string,
): Array<{ id: string; content: string; range: [number, number] }> {
  if (!codeLines || codeLines.length === 0) {
    return [];
  }

  const fullCodeLines = fullCode.split("\n");
  const codeChunks: Array<{
    id: string;
    content: string;
    range: [number, number];
  }> = [];

  // 为每行代码找到在完整代码中的行号，支持更智能的匹配
  const linePositions: Array<{ line: string; lineNumber: number }> = [];
  let lastFoundIndex = 0; // 优化：从上次找到的位置开始搜索

  for (const codeLine of codeLines) {
    const trimmedLine = codeLine.trim();
    if (!trimmedLine) continue; // 跳过空行

    // 使用改进的行查找函数
    const lineNumber = findLineInFullCode(
      codeLine,
      fullCodeLines,
      lastFoundIndex,
    );
    if (lineNumber > 0) {
      linePositions.push({ line: codeLine, lineNumber });
      lastFoundIndex = lineNumber - 1; // 下次从这个位置开始搜索
    } else {
      console.warn(
        `无法在完整代码中找到代码行: "${trimmedLine.substring(0, 50)}..."`,
      );
    }
  }

  if (linePositions.length === 0) {
    console.warn("无法在完整代码中找到任何指定的代码行");
    return [];
  }

  // 按行号排序
  linePositions.sort((a, b) => a.lineNumber - b.lineNumber);

  // 合并连续的行
  let currentChunk: {
    lines: string[];
    startLine: number;
    endLine: number;
  } | null = null;
  let chunkCounter = 0;

  for (let i = 0; i < linePositions.length; i++) {
    const { line, lineNumber } = linePositions[i];

    if (!currentChunk) {
      // 开始新的代码块
      currentChunk = {
        lines: [line],
        startLine: lineNumber,
        endLine: lineNumber,
      };
    } else if (lineNumber === currentChunk.endLine + 1) {
      // 连续行，合并到当前代码块
      currentChunk.lines.push(line);
      currentChunk.endLine = lineNumber;
    } else {
      // 不连续，保存当前代码块并开始新的代码块
      // 使用 calculateCodeChunkRange 来验证和优化范围
      const chunkContent = currentChunk.lines.join("\n");
      const verifiedRange = calculateCodeChunkRange(fullCode, chunkContent);

      codeChunks.push({
        id: `${baseId}-${chunkCounter++}`,
        content: chunkContent,
        range: verifiedRange, // 使用验证后的范围
      });

      currentChunk = {
        lines: [line],
        startLine: lineNumber,
        endLine: lineNumber,
      };
    }
  }

  // 处理最后一个代码块
  if (currentChunk) {
    // 使用 calculateCodeChunkRange 来验证和优化范围
    const chunkContent = currentChunk.lines.join("\n");
    const verifiedRange = calculateCodeChunkRange(fullCode, chunkContent);

    codeChunks.push({
      id: `${baseId}-${chunkCounter++}`,
      content: chunkContent,
      range: verifiedRange, // 使用验证后的范围
    });
  }

  console.log(
    `📦 从 ${codeLines.length} 行代码创建了 ${codeChunks.length} 个代码块:`,
    codeChunks.map((chunk) => ({
      id: chunk.id,
      range: chunk.range,
      lines: chunk.content.split("\n").length,
      preview: chunk.content.substring(0, 30) + "...",
    })),
  );

  return codeChunks;
}

// 辅助函数：智能创建代码块（结合多种策略）
function createCodeChunkSmart(
  codeContent: string,
  fullCode: string,
  chunkId: string,
  stepId?: string,
): {
  id: string;
  content: string;
  range: [number, number];
  stepId?: string;
} | null {
  if (!codeContent || !codeContent.trim()) {
    return null;
  }

  const trimmedContent = codeContent.trim();

  // 首先尝试使用 calculateCodeChunkRange 获取精确范围
  const range = calculateCodeChunkRange(fullCode, trimmedContent);

  // 验证范围的有效性
  const fullCodeLines = fullCode.split("\n");
  if (
    range[0] > 0 &&
    range[1] <= fullCodeLines.length &&
    range[0] <= range[1]
  ) {
    const result: any = {
      id: chunkId,
      content: trimmedContent,
      range: range,
    };

    if (stepId) result.stepId = stepId;

    console.log(`✅ 智能创建代码块 ${chunkId}:`, {
      contentLength: trimmedContent.length,
      range: range,
      stepId,
      preview: trimmedContent.substring(0, 50) + "...",
    });

    return result;
  } else {
    console.warn(`⚠️ 无法为代码块 ${chunkId} 计算有效范围，跳过创建`, {
      contentPreview: trimmedContent.substring(0, 50) + "...",
      calculatedRange: range,
      fullCodeLinesCount: fullCodeLines.length,
    });
    return null;
  }
}
function constructRerunStepCodeUpdatePromptLocal(
  existingCode: string,
  allSteps: Array<{
    id: string;
    title: string;
    abstract: string;
  }>,
  stepId: string,
  oldAbstract: string,
  newAbstract: string,
  taskDescription?: string,
): string {
  const stepsText = allSteps
    .map(
      (step) =>
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`,
    )
    .join(",\n        ");

  return `{
        "task": "You are given existing code and information about a specific step whose abstract has changed. Update the code minimally to reflect the new abstract while preserving all unrelated functionality.",
        ${taskDescription ? `"task_description": "${taskDescription}",` : ""}
        "existing_code": "${existingCode}",
        "all_steps": [
        ${stepsText}
        ],
        "updated_step": {
            "id": "${stepId}",
            "old_abstract": "${oldAbstract}",
            "new_abstract": "${newAbstract}"
        },
        "requirements": [
            "STRICT RULE 1: Make MINIMAL changes to the existing code. Only modify what is absolutely necessary to reflect the new abstract for the specified step.",
            "STRICT RULE 2: Do NOT break or remove functionality that is working and relates to other steps.",
            "STRICT RULE 3: The updated code should maintain the same overall structure and all existing functionality while incorporating the changes required by the new abstract.",
            "Analyze the difference between the old_abstract and new_abstract for the specified step",
            "Identify which parts of the existing code need to be modified to match the new requirements",
            "Preserve all code that implements other steps or is not directly related to the changed step",
            "Make surgical changes only to the relevant sections",
            "Maintain code consistency and follow good programming practices",
            "The output should be the complete updated code file",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"complete_code\\": \\"(the complete updated code with minimal changes)\\"}",
            "CRITICAL: Return ONLY a valid JSON object. Do not add any explanatory text before or after the JSON. Do not use code block markers. The response should start with { and end with }.",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid code block characters to envelope the JSON response, just return the JSON object directly."
        ]
    }`;
}

// 辅助函数：获取步骤对应的所有代码块内容
export async function getStepCorrespondingCode(
  stepId: string,
  mappings: any[],
  codeChunks: any[],
  ideMessenger: any,
): Promise<string> {
  // 找到包含当前step_id的所有映射
  const stepMappings = mappings.filter((mapping) => mapping.stepId === stepId);

  if (stepMappings.length === 0) {
    return "";
  }

  // 获取所有对应的代码块
  const correspondingCodeChunks = stepMappings
    .map((mapping) =>
      codeChunks.find((chunk) => chunk.id === mapping.codeChunkId),
    )
    .filter((chunk) => chunk !== undefined);

  if (correspondingCodeChunks.length === 0) {
    return "";
  }

  // 按范围起始行号排序，确保代码片段按在文件中的顺序排列
  correspondingCodeChunks.sort((a, b) => a.range[0] - b.range[0]);

  // 尝试从当前IDE文件获取最新内容，以确保代码是最新的
  let allCodeSnippets: string[] = [];

  try {
    const currentFileResponse = await ideMessenger.request(
      "getCurrentFile",
      undefined,
    );

    if (
      currentFileResponse?.status === "success" &&
      currentFileResponse.content
    ) {
      const currentFile = currentFileResponse.content;
      const fileLines = currentFile.contents
        ? currentFile.contents.split("\n")
        : [];

      // 为每个代码块获取最新内容
      for (const chunk of correspondingCodeChunks) {
        // 如果文件路径匹配，从当前文件内容中提取对应行号的代码
        if (currentFile.path === chunk.filePath && fileLines.length > 0) {
          const startLine = Math.max(0, chunk.range[0] - 1); // 转换为0基索引
          const endLine = Math.min(fileLines.length, chunk.range[1]); // 确保不超出范围

          const currentCode = fileLines.slice(startLine, endLine).join("\n");
          allCodeSnippets.push(currentCode);

          console.log(
            `📖 从当前文件获取步骤 ${stepId} 代码片段 ${chunk.id} (行${chunk.range[0]}-${chunk.range[1]}):`,
            currentCode.substring(0, 100) +
              (currentCode.length > 100 ? "..." : ""),
          );
        } else {
          // 如果文件路径不匹配或没有文件内容，使用缓存的代码块内容
          allCodeSnippets.push(chunk.content);
          console.log(
            `📖 使用缓存的代码块内容 ${chunk.id}:`,
            chunk.content.substring(0, 100) +
              (chunk.content.length > 100 ? "..." : ""),
          );
        }
      }
    } else {
      // 如果无法获取当前文件，使用所有缓存的代码块内容
      allCodeSnippets = correspondingCodeChunks.map((chunk) => chunk.content);
      console.warn("⚠️ 无法从IDE获取当前文件内容，使用所有缓存的代码块内容");
    }
  } catch (error) {
    console.warn(
      "⚠️ 无法从IDE获取当前文件内容，使用所有缓存的代码块内容:",
      error,
    );
    allCodeSnippets = correspondingCodeChunks.map((chunk) => chunk.content);
  }

  // 将所有代码片段合并，用适当的分隔符分开
  if (allCodeSnippets.length === 0) {
    return "";
  } else if (allCodeSnippets.length === 1) {
    return allCodeSnippets[0];
  } else {
    // 多个代码片段时，用注释和空行分隔
    const combinedCode = allCodeSnippets
      .map((snippet, index) => {
        return `// --- 代码片段 ${index + 1} ---\n${snippet}`;
      })
      .join("\n\n");

    console.log(
      `📦 合并了 ${allCodeSnippets.length} 个代码片段，总长度: ${combinedCode.length}`,
    );
    return combinedCode;
  }
}

//异步对用户需求和当前知识状态进行生成
export const paraphraseUserIntent = createAsyncThunk<
  void,
  {
    programRequirement: ProgramRequirement;
  },
  ThunkApiType
>(
  "codeAware/ParaphraseUserIntent",
  async ({ programRequirement }, { dispatch, extra, getState }) => {
    try {
      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      //send request
      const prompt = constructParaphraseUserIntentPrompt(programRequirement);

      console.log(
        "paraphraseUserIntent called with programRequirement:",
        prompt,
      );
      const result = await extra.ideMessenger.request("llm/complete", {
        prompt: prompt,
        completionOptions: {},
        title: defaultModel.title,
      });

      if (result.status !== "success") {
        throw new Error("LLM request failed");
      }

      console.log("LLM response:", result.content);
      dispatch(submitRequirementContent(result.content));
      dispatch(setUserRequirementStatus("confirmed")); // 直接设置为confirmed，跳过AI处理步骤
    } catch (error) {
      console.error("Error during LLM request:", error);
      dispatch(setUserRequirementStatus("editing"));
      throw new Error("Failed to fetch LLM response");
      //CATODO: 这里应该有一个UI提示，告诉用户请求失败了
    }
  },
);

//在确认了requirement之后，llm来生成步骤list，需要将其parse成StepItem的列表
// 异步根据用户需求生成步骤
export const generateStepsFromRequirement = createAsyncThunk<
  void,
  {
    userRequirement: string; // 确认的用户需求文本
  },
  ThunkApiType
>(
  "codeAware/generateStepsFromRequirement",
  async ({ userRequirement }, { dispatch, extra, getState }) => {
    try {
      // Log: 用户触发步骤生成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_steps_generation",
        payload: {
          userRequirement,
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // call LLM to generate steps with retry mechanism
      const prompt = constructGenerateStepsPrompt(userRequirement);
      const maxRetries = 3;
      let lastError: Error | null = null;
      let result: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 Attempt ${attempt}/${maxRetries} to generate steps...`,
          );

          result = await extra.ideMessenger.request("llm/complete", {
            prompt: prompt,
            completionOptions: {}, // 根据需要配置
            title: defaultModel.title,
          });

          if (result.status === "success" && result.content) {
            console.log("✅ Steps generation successful on attempt", attempt);
            break;
          } else {
            throw new Error(
              `LLM request failed: status=${result.status}, hasContent=${!!result.content}`,
            );
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ Steps generation attempt ${attempt}/${maxRetries} failed:`,
            lastError.message,
          );

          if (attempt < maxRetries) {
            // Wait before retry (exponential backoff)
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`⏱️ Waiting ${waitTime}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }

      // 提取信息，更新到Slice中
      if (!result || result.status !== "success" || !result.content) {
        dispatch(setUserRequirementStatus("editing"));
        throw new Error(
          `LLM request to generate steps failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`,
        );
      }

      //要初始化设置的一些值，同时要更新的是userRequirement, 并且需要设置learning goal;
      let parsedSteps: StepItem[] = [];
      let initialMappings: CodeAwareMapping[] = [];
      let highLevelStepItems: HighLevelStepItem[] = [];
      let stepToHighLevelMappings: StepToHighLevelMapping[] = [];
      let learningGoal = "";
      let title = "";
      let highLevelSteps: string[] = [];

      // 解析 LLM 返回的 JSON 内容
      try {
        const jsonResponse = JSON.parse(result.content);
        console.log("LLM response JSON:", jsonResponse);
        title = jsonResponse.title || "";
        learningGoal = jsonResponse.learning_goal || "";
        highLevelSteps = jsonResponse.high_level_steps || [];
        const steps = jsonResponse.steps || [];

        // 创建高级步骤项目
        highLevelSteps.forEach((highLevelStep, index) => {
          const highLevelStepId = `r-${index + 1}`;
          highLevelStepItems.push({
            id: highLevelStepId,
            content: highLevelStep,
            isHighlighted: false,
            isCompleted: false, // 初始状态为未完成
          });
        });

        for (const step of steps) {
          const stepTitle = step.title || "";
          const stepAbstract = step.abstract || "";
          const taskCorrespondingHighLevelTask =
            step.task_corresponding_high_level_task || "";

          // 确保每个步骤都有标题和摘要
          if (stepTitle && stepAbstract) {
            const stepId = `s-${parsedSteps.length + 1}`;
            parsedSteps.push({
              id: stepId,
              title: stepTitle,
              abstract: stepAbstract,
              knowledgeCards: [],
              isHighlighted: false,
              stepStatus: "confirmed", // 默认状态为 confirmed
              knowledgeCardGenerationStatus: "empty", // 初始状态为 empty
            });

            // 为每个step的对应high-level task创建映射
            if (taskCorrespondingHighLevelTask) {
              // 找到对应的高级步骤
              const correspondingIndex = highLevelSteps.findIndex(
                (highLevelStep) =>
                  highLevelStep === taskCorrespondingHighLevelTask,
              );

              if (correspondingIndex !== -1) {
                const highLevelStepId = `r-${correspondingIndex + 1}`;

                // 创建步骤到高级步骤的映射
                stepToHighLevelMappings.push({
                  stepId: stepId,
                  highLevelStepId: highLevelStepId,
                  highLevelStepIndex: correspondingIndex + 1, // 序号从1开始
                });

                // 创建传统的 CodeAware 映射 (用于高亮功能)
                initialMappings.push({
                  highLevelStepId: highLevelStepId,
                  stepId: stepId,
                  isHighlighted: false,
                });
              }
            }
          } else {
            console.warn("Step is missing title or abstract:", step);
          }
        }
      } catch (error) {
        console.error("Error during LLM request for generating steps:", error);
        // 在抛出新错误之前，确保 error 是一个 Error 实例，以便保留原始堆栈跟踪
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate steps: ${errorMessage}`);
        // CATODO: UI提示，告知用户请求失败
      }
      console.log("Generated high_level_steps array:", highLevelSteps);
      console.log(
        "Generated step to high level mappings:",
        stepToHighLevelMappings,
      );

      // 更新 Redux 状态
      dispatch(setCodeAwareTitle(title));
      dispatch(setLearningGoal(learningGoal));
      dispatch(setHighLevelSteps(highLevelStepItems));
      dispatch(setStepToHighLevelMappings(stepToHighLevelMappings));
      dispatch(setGeneratedSteps(parsedSteps));
      dispatch(updateCodeAwareMappings(initialMappings));
      dispatch(setUserRequirementStatus("finalized"));

      // Log: 步骤生成完成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_get_steps_generation_result",
        payload: {
          userRequirement,
          title,
          learningGoal,
          stepsCount: parsedSteps.length,
          highLevelStepsCount: highLevelSteps.length,
          // 记录具体的步骤信息
          stepsDetails: parsedSteps.map((step) => ({
            title: step.title,
            abstract: step.abstract
              ? step.abstract.substring(0, 200) +
                (step.abstract.length > 200 ? "..." : "")
              : "",
          })),
          highLevelStepsDetails: highLevelSteps.map((step, index) => ({
            index: index + 1,
            content: step,
          })),
          timestamp: new Date().toISOString(),
        },
      });

      // CodeAware: 通过protocol同步requirement和步骤信息到IDE
      try {
        // 发送用户需求到IDE
        await extra.ideMessenger.request("syncCodeAwareRequirement", {
          userRequirement: userRequirement,
        });

        // 发送当前步骤和下一步骤信息到IDE
        const currentStep =
          parsedSteps.length > 0
            ? `${parsedSteps[0].title}: ${cleanMarkdownText(parsedSteps[0].abstract)}`
            : ""; // 第一步作为当前步骤
        const nextStep =
          parsedSteps.length > 1
            ? `${parsedSteps[1].title}: ${cleanMarkdownText(parsedSteps[1].abstract)}`
            : ""; // 第二步作为下一步骤

        await extra.ideMessenger.request("syncCodeAwareSteps", {
          currentStep: currentStep,
          nextStep: nextStep,
          stepFinished: false, // 刚生成时步骤还没有完成
        });

        console.log(
          "CodeAware: Successfully synced requirement and steps to IDE",
        );
      } catch (error) {
        console.warn("CodeAware: Failed to sync context to IDE:", error);
        // 不影响主流程，只是记录警告
      }
    } catch (error) {
      console.error("Error during LLM request for generating steps:", error);
      dispatch(setUserRequirementStatus("editing"));
    }
  },
);

//异步生成知识卡片具体内容
export const generateKnowledgeCardDetail = createAsyncThunk<
  void,
  {
    stepId: string;
    knowledgeCardId: string;
    knowledgeCardTheme: string; // 知识卡片的主题
    learningGoal: string; // 学习目标
    codeContext: string; // 代码上下文
  },
  ThunkApiType
>(
  "codeAware/GenerateKnowledgeCardDetail",
  async (
    { stepId, knowledgeCardId, knowledgeCardTheme, learningGoal, codeContext },
    { dispatch, extra, getState },
  ) => {
    const maxRetries = 3; // 最大重试次数
    let lastError: Error | null = null;

    try {
      // Log: 用户触发知识卡片内容生成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_knowledge_card_detail_generation",
        payload: {
          knowledgeCardTheme,
          learningGoal,
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // 从state中获取任务描述信息
      const taskDescription =
        state.codeAwareSession.userRequirement?.requirementDescription || "";

      // 设置加载状态
      dispatch(
        setKnowledgeCardLoading({
          stepId,
          cardId: knowledgeCardId,
          isLoading: true,
        }),
      );

      // 构造提示词
      const prompt = constructGenerateKnowledgeCardDetailPrompt(
        knowledgeCardTheme,
        learningGoal,
        codeContext,
        taskDescription,
      );

      console.log("generateKnowledgeCardDetail called with:", {
        stepId,
        knowledgeCardId,
        knowledgeCardTheme,
        learningGoal,
        taskDescription,
        codeContext: codeContext.substring(0, 100) + "...", // 只打印前100个字符
      });

      // 重试机制
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 知识卡片生成尝试 ${attempt}/${maxRetries}`);

          // 添加超时保护
          const timeoutPromise = new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("LLM请求超时")), 30000), // 30秒超时
          );

          const llmPromise = extra.ideMessenger.request("llm/complete", {
            prompt: prompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          const result: any = await Promise.race([llmPromise, timeoutPromise]);

          if (result.status !== "success" || !result.content) {
            throw new Error("LLM request failed or returned empty content");
          }

          console.log("LLM response for knowledge card:", result.content);

          // 解析 LLM 返回的 JSON 内容
          try {
            const jsonResponse = JSON.parse(result.content);
            const content = jsonResponse.content || "";
            const title = jsonResponse.title || knowledgeCardTheme;

            // 更新知识卡片内容（不包含测试题）
            dispatch(
              updateKnowledgeCardContent({
                stepId,
                cardId: knowledgeCardId,
                content,
              }),
            );

            // Log: 知识卡片内容生成完成
            await extra.ideMessenger.request("addCodeAwareLogEntry", {
              eventType: "user_get_knowledge_card_detail_generation_result",
              payload: {
                knowledgeCardTheme,
                title,
                contentLength: content.length,
                // 记录内容摘要（前200字符）
                contentSummary:
                  content.substring(0, 200) +
                  (content.length > 200 ? "..." : ""),
                timestamp: new Date().toISOString(),
              },
            });

            console.log("✅ 知识卡片生成成功");

            return; // 成功，退出函数
          } catch (parseError) {
            throw new Error(
              `解析LLM响应失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            );
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ 知识卡片生成第 ${attempt} 次尝试失败:`,
            lastError.message,
          );

          // 如果不是最后一次尝试，等待一段时间再重试
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最大5秒
            console.log(`⏱️ 等待 ${delay}ms 后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // 如果所有重试都失败了，抛出最后一个错误
      throw lastError || new Error("知识卡片生成失败");
    } catch (error) {
      console.error("❌ 知识卡片生成最终失败:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 多次失败后，将知识卡片重置到生成前状态
      console.log("🔄 重置知识卡片到生成前状态");
      dispatch(
        resetKnowledgeCardContent({
          stepId,
          cardId: knowledgeCardId,
        }),
      );

      // 显示错误信息的时间较短，然后恢复
      dispatch(
        setKnowledgeCardError({
          stepId,
          cardId: knowledgeCardId,
          error: `生成失败（已重试${maxRetries}次）: ${errorMessage}`,
        }),
      );

      // 2秒后清除错误状态，恢复到空内容状态，这样用户下次展开时可以重新生成
      setTimeout(() => {
        dispatch(
          resetKnowledgeCardContent({
            stepId,
            cardId: knowledgeCardId,
          }),
        );
      }, 2000);
    }
  },
);

// 异步生成知识卡片测试题
export const generateKnowledgeCardTests = createAsyncThunk<
  void,
  {
    stepId: string;
    knowledgeCardId: string;
    knowledgeCardTitle: string;
    knowledgeCardContent: string;
    knowledgeCardTheme: string;
    learningGoal: string;
    codeContext: string;
  },
  ThunkApiType
>(
  "codeAware/generateKnowledgeCardTests",
  async (
    {
      stepId,
      knowledgeCardId,
      knowledgeCardTitle,
      knowledgeCardContent,
      knowledgeCardTheme,
      learningGoal,
      codeContext,
    },
    { dispatch, extra, getState },
  ) => {
    const maxRetries = 3;
    let lastError: Error | null = null;

    try {
      // Log: 用户触发知识卡片测试题生成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_knowledge_card_tests_generation",
        payload: {
          knowledgeCardTitle,
          knowledgeCardTheme,
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // 从state中获取任务描述信息
      const taskDescription =
        state.codeAwareSession.userRequirement?.requirementDescription || "";

      // 设置测试题加载状态
      dispatch(
        setKnowledgeCardTestsLoading({
          stepId,
          cardId: knowledgeCardId,
          isLoading: true,
        }),
      );

      // 构造提示词
      const prompt = constructGenerateKnowledgeCardTestsPrompt(
        knowledgeCardTitle,
        knowledgeCardContent,
        knowledgeCardTheme,
        learningGoal,
        codeContext,
        taskDescription,
      );

      console.log("generateKnowledgeCardTests called with:", {
        stepId,
        knowledgeCardId,
        knowledgeCardTitle,
        knowledgeCardTheme,
        learningGoal,
        taskDescription,
        contentLength: knowledgeCardContent.length,
        codeContextLength: codeContext.length,
      });

      // 重试机制
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 知识卡片测试题生成尝试 ${attempt}/${maxRetries}`);

          // 添加超时保护
          const timeoutPromise = new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("LLM请求超时")), 30000), // 30秒超时
          );

          const llmPromise = extra.ideMessenger.request("llm/complete", {
            prompt: prompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          const result: any = await Promise.race([llmPromise, timeoutPromise]);

          if (result.status !== "success" || !result.content) {
            throw new Error("LLM request failed or returned empty content");
          }

          console.log("LLM response for knowledge card tests:", result.content);

          // 解析 LLM 返回的 JSON 内容
          try {
            const jsonResponse = JSON.parse(result.content);
            const testsFromLLM = jsonResponse.tests || [];

            // 为tests添加ID，编号方式为知识卡片ID + "-t-" + 递增编号
            const tests = testsFromLLM.map((test: any, index: number) => ({
              ...test,
              id: `${knowledgeCardId}-t-${index + 1}`,
            }));

            // 更新知识卡片测试题
            dispatch(
              updateKnowledgeCardTests({
                stepId,
                cardId: knowledgeCardId,
                tests,
              }),
            );

            // Log: 知识卡片测试题生成完成
            await extra.ideMessenger.request("addCodeAwareLogEntry", {
              eventType: "user_get_knowledge_card_tests_generation_result",
              payload: {
                knowledgeCardTitle,
                testsCount: tests.length,
                // 记录测试题详情
                testsDetails: tests.map((test: any) => ({
                  questionType: test.question_type,
                  questionStem: test.question.stem,
                  standardAnswer: test.question.standard_answer,
                  options: test.question.options || [],
                })),
                timestamp: new Date().toISOString(),
              },
            });

            console.log("✅ 知识卡片测试题生成成功");

            return; // 成功，退出函数
          } catch (parseError) {
            throw new Error(
              `解析LLM响应失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            );
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ 知识卡片测试题生成第 ${attempt} 次尝试失败:`,
            lastError.message,
          );

          // 如果不是最后一次尝试，等待一段时间再重试
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避，最大5秒
            console.log(`⏱️ 等待 ${delay}ms 后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // 如果所有重试都失败了，抛出最后一个错误
      throw lastError || new Error("知识卡片测试题生成失败");
    } catch (error) {
      console.error("❌ 知识卡片测试题生成最终失败:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 显示错误信息
      dispatch(
        setKnowledgeCardError({
          stepId,
          cardId: knowledgeCardId,
          error: `测试题生成失败（已重试${maxRetries}次）: ${errorMessage}`,
        }),
      );

      // 2秒后清除错误状态
      setTimeout(() => {
        dispatch(
          setKnowledgeCardTestsLoading({
            stepId,
            cardId: knowledgeCardId,
            isLoading: false,
          }),
        );
      }, 2000);
    } finally {
      // 确保清除加载状态
      dispatch(
        setKnowledgeCardTestsLoading({
          stepId,
          cardId: knowledgeCardId,
          isLoading: false,
        }),
      );
    }
  },
);

// 异步生成知识卡片主题列表
export const generateKnowledgeCardThemes = createAsyncThunk<
  void,
  {
    stepId: string;
    stepTitle: string;
    stepAbstract: string;
    learningGoal: string;
  },
  ThunkApiType
>(
  "codeAware/generateKnowledgeCardThemes",
  async (
    { stepId, stepTitle, stepAbstract, learningGoal },
    { dispatch, extra, getState },
  ) => {
    try {
      // Log: 用户触发知识卡片主题生成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_knowledge_card_themes_generation",
        payload: {
          stepTitle,
          stepAbstract: stepAbstract
            ? stepAbstract.substring(0, 200) +
              (stepAbstract.length > 200 ? "..." : "")
            : "",
          learningGoal,
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // 检查是否已经在生成中，防止重复调用
      const currentStep = state.codeAwareSession.steps.find(
        (step) => step.id === stepId,
      );
      if (currentStep?.knowledgeCardGenerationStatus === "generating") {
        console.warn(`⚠️ 步骤 ${stepId} 已经在生成知识卡片主题，跳过重复调用`);
        return;
      }

      // 设置生成状态
      dispatch(
        setKnowledgeCardGenerationStatus({ stepId, status: "generating" }),
      );

      // 获取任务描述
      const taskDescription =
        state.codeAwareSession.userRequirement?.requirementDescription || "";

      // 尝试获取当前步骤对应的代码块内容
      let currentCode: string | undefined;
      try {
        currentCode = await getStepCorrespondingCode(
          stepId,
          state.codeAwareSession.codeAwareMappings,
          state.codeAwareSession.codeChunks,
          extra.ideMessenger,
        );
        // 如果代码为空字符串，设置为 undefined
        if (!currentCode || currentCode.trim() === "") {
          currentCode = undefined;
        }
      } catch (error) {
        console.warn(
          "⚠️ 无法获取步骤对应的代码，将只生成主题不包含代码对应关系:",
          error,
        );
        currentCode = undefined;
      }

      // 构造提示词
      const prompt = constructGenerateKnowledgeCardThemesPrompt(
        taskDescription,
        { title: stepTitle, abstract: stepAbstract },
        learningGoal,
        currentCode,
      );

      console.log("generateKnowledgeCardThemes called with:", {
        stepId,
        stepTitle,
        stepAbstract,
        learningGoal,
        currentStatus: state.codeAwareSession.steps.find((s) => s.id === stepId)
          ?.knowledgeCardGenerationStatus,
      });

      // 重试机制
      const maxRetries = 3;
      let lastError: Error | null = null;
      let result: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 知识卡片主题生成尝试 ${attempt}/${maxRetries}`);

          // 添加超时保护
          const timeoutPromise = new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("LLM请求超时")), 30000), // 30秒超时
          );

          const llmPromise = extra.ideMessenger.request("llm/complete", {
            prompt: prompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          result = await Promise.race([llmPromise, timeoutPromise]);

          if (result.status !== "success" || !result.content) {
            throw new Error("LLM request failed or returned empty content");
          }

          break; // 成功，跳出重试循环
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ 知识卡片主题生成第 ${attempt} 次尝试失败:`,
            lastError.message,
          );

          // 如果不是最后一次尝试，等待一段时间再重试
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避
            console.log(`⏱️ 等待 ${delay}ms 后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // 如果所有重试都失败，抛出错误
      if (!result || result.status !== "success" || !result.content) {
        throw lastError || new Error("知识卡片主题生成失败");
      }

      console.log("LLM response for knowledge card themes:", result.content);

      // 解析 LLM 返回的 JSON 内容
      try {
        const themes = JSON.parse(result.content);

        if (Array.isArray(themes) && themes.length > 0) {
          // 获取当前步骤相关的现有映射
          const state = getState();
          const existingMappings =
            state.codeAwareSession.codeAwareMappings.filter(
              (mapping) => mapping.stepId === stepId,
            );
          const existingCodeChunks = state.codeAwareSession.codeChunks;

          // 检查是否为新格式（包含代码对应关系）
          const isNewFormat =
            themes.length > 0 &&
            typeof themes[0] === "object" &&
            themes[0].theme;

          if (isNewFormat) {
            // 新格式：处理包含代码对应关系的主题
            for (let index = 0; index < themes.length; index++) {
              const themeWithCode = themes[index] as {
                theme: string;
                corresponding_code_snippets?: string[];
              };
              const cardId = `${stepId}-kc-${index + 1}`;

              // 创建知识卡片
              dispatch(
                createKnowledgeCard({
                  stepId,
                  cardId,
                  theme: themeWithCode.theme,
                }),
              );

              // 如果有对应的代码片段，为每个片段创建代码块和映射
              const codeSnippets =
                themeWithCode.corresponding_code_snippets || [];
              if (codeSnippets.length > 0) {
                // 获取当前active文件的内容来推断行号
                let currentFilePath = "";
                let currentFileContents = "";

                try {
                  const currentFileResponse = await extra.ideMessenger.request(
                    "getCurrentFile",
                    undefined,
                  );

                  if (
                    currentFileResponse?.status === "success" &&
                    currentFileResponse.content
                  ) {
                    const currentFile = currentFileResponse.content;
                    currentFilePath = currentFile.path || "";
                    currentFileContents = currentFile.contents || "";
                  } else {
                    console.warn("⚠️ 无法获取当前文件内容，使用默认行号范围");
                  }
                } catch (fileError) {
                  console.warn(
                    "⚠️ 获取当前文件信息失败，使用默认行号范围:",
                    fileError,
                  );
                }

                // 为每个代码片段创建代码块和映射
                for (const codeSnippet of codeSnippets) {
                  if (codeSnippet && codeSnippet.trim() !== "") {
                    let codeChunkRange: [number, number] = [
                      1,
                      codeSnippet.split("\n").length,
                    ];

                    // 使用当前文件内容来计算准确的行号范围
                    if (currentFileContents) {
                      codeChunkRange = calculateCodeChunkRange(
                        currentFileContents,
                        codeSnippet.trim(),
                      );
                      console.log(
                        `📍 为知识卡片代码块计算行号范围: ${codeChunkRange[0]}-${codeChunkRange[1]}`,
                      );
                    }

                    // 创建新的代码块
                    dispatch(
                      createOrGetCodeChunk({
                        content: codeSnippet.trim(),
                        range: codeChunkRange,
                        filePath: currentFilePath,
                      }),
                    );

                    // 获取新创建的代码块
                    const updatedState = getState();
                    const trimmedSnippet = codeSnippet.trim();
                    const newCodeChunk =
                      updatedState.codeAwareSession.codeChunks.find(
                        (chunk) =>
                          chunk.content === trimmedSnippet &&
                          chunk.range[0] === codeChunkRange[0] &&
                          chunk.range[1] === codeChunkRange[1],
                      );

                    if (newCodeChunk) {
                      // 查找该步骤对应的requirement chunk ID
                      const updatedMappings =
                        updatedState.codeAwareSession.codeAwareMappings;
                      const stepRequirementMapping = updatedMappings.find(
                        (mapping) =>
                          mapping.stepId === stepId &&
                          mapping.highLevelStepId &&
                          !mapping.codeChunkId &&
                          !mapping.knowledgeCardId,
                      );

                      // 创建映射关系
                      dispatch(
                        createCodeAwareMapping({
                          codeChunkId: newCodeChunk.id,
                          stepId,
                          knowledgeCardId: cardId,
                          highLevelStepId:
                            stepRequirementMapping?.highLevelStepId,
                          isHighlighted: false,
                        }),
                      );

                      console.log(
                        `🔗 创建知识卡片代码映射: ${cardId} -> ${newCodeChunk.id}`,
                        {
                          stepId,
                          knowledgeCardId: cardId,
                          codeChunkId: newCodeChunk.id,
                          highLevelStepId:
                            stepRequirementMapping?.highLevelStepId,
                        },
                      );
                    } else {
                      console.warn(
                        "⚠️ 无法找到新创建的代码块，为该代码片段创建基础映射",
                      );
                    }
                  }
                }

                // 如果没有成功创建任何映射，创建基础映射
                const updatedState = getState();
                const cardMappings =
                  updatedState.codeAwareSession.codeAwareMappings.filter(
                    (mapping) => mapping.knowledgeCardId === cardId,
                  );
                if (cardMappings.length === 0) {
                  // 查找该步骤对应的requirement chunk ID
                  const stepRequirementMapping =
                    updatedState.codeAwareSession.codeAwareMappings.find(
                      (mapping) =>
                        mapping.stepId === stepId &&
                        mapping.highLevelStepId &&
                        !mapping.codeChunkId &&
                        !mapping.knowledgeCardId,
                    );

                  dispatch(
                    createCodeAwareMapping({
                      stepId,
                      knowledgeCardId: cardId,
                      highLevelStepId: stepRequirementMapping?.highLevelStepId,
                      isHighlighted: false,
                    }),
                  );

                  console.log(`🔗 创建基础知识卡片映射: ${cardId}`, {
                    stepId,
                    knowledgeCardId: cardId,
                    highLevelStepId: stepRequirementMapping?.highLevelStepId,
                  });
                }
              } else {
                // 没有代码对应关系，使用现有映射或创建基础映射
                if (existingMappings.length > 0) {
                  existingMappings.forEach((existingMapping) => {
                    dispatch(
                      createCodeAwareMapping({
                        codeChunkId: existingMapping.codeChunkId,
                        highLevelStepId: existingMapping.highLevelStepId,
                        stepId,
                        knowledgeCardId: cardId,
                        isHighlighted: false,
                      }),
                    );
                  });
                } else {
                  // 查找该步骤对应的requirement chunk ID
                  const currentState = getState();
                  const stepRequirementMapping =
                    currentState.codeAwareSession.codeAwareMappings.find(
                      (mapping) =>
                        mapping.stepId === stepId &&
                        mapping.highLevelStepId &&
                        !mapping.codeChunkId &&
                        !mapping.knowledgeCardId,
                    );

                  dispatch(
                    createCodeAwareMapping({
                      stepId,
                      knowledgeCardId: cardId,
                      highLevelStepId: stepRequirementMapping?.highLevelStepId,
                      isHighlighted: false,
                    }),
                  );

                  console.log(`🔗 创建知识卡片基础映射: ${cardId}`, {
                    stepId,
                    knowledgeCardId: cardId,
                    highLevelStepId: stepRequirementMapping?.highLevelStepId,
                  });
                }
              }
            }
          } else {
            // 旧格式：处理简单的字符串主题列表
            themes.forEach((theme: string, index: number) => {
              const cardId = `${stepId}-kc-${index + 1}`;

              // 创建知识卡片
              dispatch(
                createKnowledgeCard({
                  stepId,
                  cardId,
                  theme,
                }),
              );

              // 为每个现有映射创建包含新知识卡片的映射关系
              if (existingMappings.length > 0) {
                existingMappings.forEach((existingMapping) => {
                  dispatch(
                    createCodeAwareMapping({
                      codeChunkId: existingMapping.codeChunkId,
                      highLevelStepId: existingMapping.highLevelStepId,
                      stepId,
                      knowledgeCardId: cardId,
                      isHighlighted: false,
                    }),
                  );
                });
              } else {
                // 如果没有现有映射，创建基础映射关系
                // 查找该步骤对应的requirement chunk ID
                const currentState = getState();
                const stepRequirementMapping =
                  currentState.codeAwareSession.codeAwareMappings.find(
                    (mapping) =>
                      mapping.stepId === stepId &&
                      mapping.highLevelStepId &&
                      !mapping.codeChunkId &&
                      !mapping.knowledgeCardId,
                  );

                dispatch(
                  createCodeAwareMapping({
                    stepId,
                    knowledgeCardId: cardId,
                    highLevelStepId: stepRequirementMapping?.highLevelStepId,
                    isHighlighted: false,
                  }),
                );

                console.log(`🔗 创建旧格式知识卡片基础映射: ${cardId}`, {
                  stepId,
                  knowledgeCardId: cardId,
                  highLevelStepId: stepRequirementMapping?.highLevelStepId,
                });
              }
            });
          }

          console.log(
            `✅ 生成 ${themes.length} 个知识卡片主题，步骤: ${stepId}`,
          );

          // Log: 知识卡片主题生成完成
          await extra.ideMessenger.request("addCodeAwareLogEntry", {
            eventType: "user_get_knowledge_card_themes_generation_result",
            payload: {
              stepTitle,
              themesCount: themes.length,
              // 记录生成的知识卡片主题详情
              themesDetails: themes.map((theme) => ({
                title: theme,
              })),
              isNewFormat,
              timestamp: new Date().toISOString(),
            },
          });

          // 知识卡片主题生成完成后，检查并映射代码
          try {
            await dispatch(checkAndMapKnowledgeCardsToCode({ stepId }));
            console.log(`✅ 完成步骤 ${stepId} 新生成知识卡片的代码映射检查`);
          } catch (mappingError) {
            console.warn(
              `⚠️ 步骤 ${stepId} 新生成知识卡片的代码映射检查失败:`,
              mappingError,
            );
            // 不抛出错误，让知识卡片生成操作继续完成
          }

          // 设置生成完成状态 - 移到最后确保状态正确设置
          dispatch(
            setKnowledgeCardGenerationStatus({ stepId, status: "ready" }),
          );

          // Log knowledge card themes generation completion
          // We'll add the log in the calling component
        } else {
          console.warn("No valid themes returned from LLM");
          dispatch(
            setKnowledgeCardGenerationStatus({ stepId, status: "ready" }),
          );
        }
      } catch (parseError) {
        console.error("Error parsing LLM response:", parseError);
        // 解析失败后回到empty状态，这样用户下次展开时可以重新生成
        dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
        throw new Error("解析LLM响应失败");
      }
    } catch (error) {
      console.error("❌ 知识卡片主题生成最终失败:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // 失败后回到empty状态，这样用户下次展开时可以重新生成
      dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
    } finally {
      // 确保无论如何都不会卡在generating状态，但不要覆盖已经正确设置的状态
      const finalState = getState();
      const currentStep = finalState.codeAwareSession.steps.find(
        (step) => step.id === stepId,
      );
      if (currentStep?.knowledgeCardGenerationStatus === "generating") {
        console.warn(
          `⚠️ 检测到步骤 ${stepId} 仍处于generating状态，重置为empty以允许重试`,
        );
        dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
      }
      // 如果状态是 "checked"，说明已经成功完成，不要修改
      console.log(
        `🔍 最终状态检查 - 步骤 ${stepId} 的知识卡片生成状态: ${currentStep?.knowledgeCardGenerationStatus}`,
      );
    }
  },
);

// 异步根据用户问题生成相关的知识卡片主题
export const generateKnowledgeCardThemesFromQuery = createAsyncThunk<
  void,
  {
    stepId: string;
    queryContext: {
      selectedCode: string;
      selectedText: string;
      query: string;
    };
    currentStep: {
      title: string;
      abstract: string;
    };
    existingThemes: string[];
    learningGoal: string;
    task: string;
  },
  ThunkApiType
>(
  "codeAware/generateKnowledgeCardThemesFromQuery",
  async (
    { stepId, queryContext, currentStep, existingThemes, learningGoal, task },
    { dispatch, extra, getState },
  ) => {
    try {
      // Log: 用户从问题触发主题生成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_knowledge_card_themes_from_query_generation",
        payload: {
          query: queryContext.query,
          selectedCode: queryContext.selectedCode
            ? queryContext.selectedCode.substring(0, 200) +
              (queryContext.selectedCode.length > 200 ? "..." : "")
            : "",
          currentStepTitle: currentStep.title,
          existingThemesCount: existingThemes.length,
          // 记录现有主题详情
          existingThemesDetails: existingThemes.map((theme) => ({
            title: theme,
          })),
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // 检查是否已经在生成中，防止重复调用
      /*
            const currentStepInfo = state.codeAwareSession.steps.find(step => step.id === stepId);
            if (currentStepInfo?.knowledgeCardGenerationStatus === "generating") {
                console.warn(`⚠️ 步骤 ${stepId} 已经在生成知识卡片主题，跳过重复调用`);
                return;
            }*/

      // 设置生成状态
      dispatch(
        setKnowledgeCardGenerationStatus({ stepId, status: "generating" }),
      );

      // 获取当前步骤对应的代码块内容
      const currentCode = await getStepCorrespondingCode(
        stepId,
        state.codeAwareSession.codeAwareMappings,
        state.codeAwareSession.codeChunks,
        extra.ideMessenger,
      );

      // 构造提示词并发送请求
      const prompt = constructGenerateKnowledgeCardThemesFromQueryPrompt(
        queryContext,
        currentStep,
        currentCode,
        existingThemes,
        learningGoal,
        task,
      );

      console.log("generateKnowledgeCardThemesFromQuery called with:", {
        stepId,
        queryContext,
        currentStep,
        currentCode:
          currentCode.substring(0, 100) +
          (currentCode.length > 100 ? "..." : ""), // 只记录前100个字符用于调试
        existingThemes,
        learningGoal,
        task,
        currentStatus: state.codeAwareSession.steps.find((s) => s.id === stepId)
          ?.knowledgeCardGenerationStatus,
      });

      // 重试机制
      const maxRetries = 3;
      let lastError: Error | null = null;
      let result: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 基于查询的知识卡片主题生成尝试 ${attempt}/${maxRetries}`,
          );

          // 添加超时保护
          const timeoutPromise = new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("LLM请求超时")), 30000), // 30秒超时
          );

          const llmPromise = extra.ideMessenger.request("llm/complete", {
            prompt: prompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          result = await Promise.race([llmPromise, timeoutPromise]);

          if (result.status !== "success" || !result.content) {
            throw new Error("LLM request failed or returned empty content");
          }

          break; // 成功，跳出重试循环
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ 基于查询的知识卡片主题生成第 ${attempt} 次尝试失败:`,
            lastError.message,
          );

          // 如果不是最后一次尝试，等待一段时间再重试
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避
            console.log(`⏱️ 等待 ${delay}ms 后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // 如果所有重试都失败，抛出错误
      if (!result || result.status !== "success" || !result.content) {
        throw lastError || new Error("基于查询的知识卡片主题生成失败");
      }

      console.log(
        "LLM response for knowledge card themes from query:",
        result.content,
      );

      // 解析 LLM 返回的 JSON 内容
      try {
        const themeResponses = JSON.parse(result.content);

        if (Array.isArray(themeResponses) && themeResponses.length > 0) {
          // 获取当前状态以确保实时性
          const currentState = getState();
          const existingMappings =
            currentState.codeAwareSession.codeAwareMappings.filter(
              (mapping) => mapping.stepId === stepId,
            );

          // 收集新创建的知识卡片ID，用于后续高亮
          const newlyCreatedCardIds: string[] = [];

          // 为每个新主题创建知识卡片并处理代码对应关系
          const stepIndex = currentState.codeAwareSession.steps.findIndex(
            (step) => step.id === stepId,
          );
          if (stepIndex !== -1) {
            const existingCardCount =
              currentState.codeAwareSession.steps[stepIndex].knowledgeCards
                .length;

            for (let index = 0; index < themeResponses.length; index++) {
              const themeResponse = themeResponses[index];
              const theme =
                themeResponse.title || themeResponse.theme || themeResponse;
              const correspondingCodeChunks =
                themeResponse.corresponding_code_snippets || [];

              const cardId = `${stepId}-kc-${existingCardCount + index + 1}`;
              newlyCreatedCardIds.push(cardId); // 收集新创建的卡片ID

              // 创建新的知识卡片
              dispatch(
                createKnowledgeCard({
                  stepId,
                  cardId,
                  theme,
                }),
              );

              // 处理代码块对应关系
              if (correspondingCodeChunks.length > 0) {
                // 获取当前active文件的内容来推断行号
                let currentFilePath = "";
                let currentFileContents = "";

                try {
                  const currentFileResponse = await extra.ideMessenger.request(
                    "getCurrentFile",
                    undefined,
                  );

                  if (
                    currentFileResponse?.status === "success" &&
                    currentFileResponse.content
                  ) {
                    const currentFile = currentFileResponse.content;
                    currentFilePath = currentFile.path || "";
                    currentFileContents = currentFile.contents || "";
                  } else {
                    console.warn("⚠️ 无法获取当前文件内容，使用默认行号范围");
                  }
                } catch (fileError) {
                  console.warn(
                    "⚠️ 获取当前文件信息失败，使用默认行号范围:",
                    fileError,
                  );
                }

                // 为每个代码片段处理映射关系
                for (const correspondingCodeChunk of correspondingCodeChunks) {
                  if (correspondingCodeChunk && correspondingCodeChunk.trim()) {
                    let codeChunkRange: [number, number] = [
                      1,
                      correspondingCodeChunk.split("\n").length,
                    ];

                    // 使用当前文件内容来计算准确的行号范围
                    if (currentFileContents) {
                      codeChunkRange = calculateCodeChunkRange(
                        currentFileContents,
                        correspondingCodeChunk.trim(),
                      );
                      console.log(
                        `📍 为代码块计算行号范围: ${codeChunkRange[0]}-${codeChunkRange[1]}`,
                      );
                    }

                    // 尝试在现有代码块中找到匹配或重叠的代码块
                    const matchingChunk =
                      currentState.codeAwareSession.codeChunks.find(
                        (chunk) =>
                          chunk.content.includes(
                            correspondingCodeChunk.trim(),
                          ) ||
                          correspondingCodeChunk.trim().includes(chunk.content),
                      );

                    if (matchingChunk) {
                      // 如果找到了匹配的代码块，使用现有的映射或创建新的
                      const existingMapping = existingMappings.find(
                        (mapping) => mapping.codeChunkId === matchingChunk.id,
                      );

                      if (existingMapping) {
                        // 基于现有映射创建新的映射
                        dispatch(
                          createCodeAwareMapping({
                            codeChunkId: existingMapping.codeChunkId,
                            highLevelStepId: existingMapping.highLevelStepId,
                            stepId,
                            knowledgeCardId: cardId,
                            isHighlighted: false,
                          }),
                        );
                      } else {
                        // 创建基础映射，查找该步骤对应的requirement chunk ID
                        const stepRequirementMapping = existingMappings.find(
                          (mapping) =>
                            mapping.stepId === stepId &&
                            mapping.highLevelStepId &&
                            !mapping.codeChunkId &&
                            !mapping.knowledgeCardId,
                        );

                        dispatch(
                          createCodeAwareMapping({
                            codeChunkId: matchingChunk.id,
                            stepId,
                            knowledgeCardId: cardId,
                            highLevelStepId:
                              stepRequirementMapping?.highLevelStepId,
                            isHighlighted: false,
                          }),
                        );

                        console.log(
                          `🔗 创建基础知识卡片映射 (匹配代码块): ${cardId} -> ${matchingChunk.id}`,
                          {
                            stepId,
                            knowledgeCardId: cardId,
                            codeChunkId: matchingChunk.id,
                            highLevelStepId:
                              stepRequirementMapping?.highLevelStepId,
                          },
                        );
                      }
                    } else {
                      // 如果没有找到匹配的代码块，创建新的代码块

                      // 创建新代码块，使用准确计算的行号范围和文件路径
                      dispatch(
                        createOrGetCodeChunk({
                          content: correspondingCodeChunk.trim(),
                          range: codeChunkRange,
                          filePath: currentFilePath,
                        }),
                      );

                      // 获取新创建的代码块（通过内容和范围匹配）
                      const updatedState = getState();
                      const newCodeChunk =
                        updatedState.codeAwareSession.codeChunks.find(
                          (chunk) =>
                            chunk.content === correspondingCodeChunk.trim() &&
                            chunk.range[0] === codeChunkRange[0] &&
                            chunk.range[1] === codeChunkRange[1],
                        );

                      if (newCodeChunk) {
                        // 查找该步骤对应的requirement chunk ID
                        const stepRequirementMapping =
                          updatedState.codeAwareSession.codeAwareMappings.find(
                            (mapping) =>
                              mapping.stepId === stepId &&
                              mapping.highLevelStepId &&
                              !mapping.codeChunkId &&
                              !mapping.knowledgeCardId,
                          );

                        // 创建映射关系
                        dispatch(
                          createCodeAwareMapping({
                            codeChunkId: newCodeChunk.id,
                            stepId,
                            knowledgeCardId: cardId,
                            highLevelStepId:
                              stepRequirementMapping?.highLevelStepId,
                            isHighlighted: false,
                          }),
                        );

                        console.log(
                          `✅ 为知识卡片 ${cardId} 创建了新代码块: ${newCodeChunk.id} (${codeChunkRange[0]}-${codeChunkRange[1]}行)`,
                          {
                            stepId,
                            knowledgeCardId: cardId,
                            codeChunkId: newCodeChunk.id,
                            highLevelStepId:
                              stepRequirementMapping?.highLevelStepId,
                          },
                        );
                      }
                    }
                  }
                }
              } else {
                // 如果没有对应的代码块，使用现有映射或创建基础映射
                if (existingMappings.length > 0) {
                  existingMappings.forEach((existingMapping) => {
                    dispatch(
                      createCodeAwareMapping({
                        codeChunkId: existingMapping.codeChunkId,
                        highLevelStepId: existingMapping.highLevelStepId,
                        stepId,
                        knowledgeCardId: cardId,
                        isHighlighted: false,
                      }),
                    );
                  });
                } else {
                  // 创建基础映射关系，查找该步骤对应的requirement chunk ID
                  const stepRequirementMapping = existingMappings.find(
                    (mapping) =>
                      mapping.stepId === stepId &&
                      mapping.highLevelStepId &&
                      !mapping.codeChunkId &&
                      !mapping.knowledgeCardId,
                  );

                  dispatch(
                    createCodeAwareMapping({
                      stepId,
                      knowledgeCardId: cardId,
                      highLevelStepId: stepRequirementMapping?.highLevelStepId,
                      isHighlighted: false,
                    }),
                  );

                  console.log(`🔗 创建基础知识卡片映射 (无代码): ${cardId}`, {
                    stepId,
                    knowledgeCardId: cardId,
                    highLevelStepId: stepRequirementMapping?.highLevelStepId,
                  });
                }
              }
            }
          }

          console.log(
            `✅ 基于查询生成 ${themeResponses.length} 个知识卡片主题，步骤: ${stepId}`,
          );

          // Log: 问题主题生成完成
          await extra.ideMessenger.request("addCodeAwareLogEntry", {
            eventType:
              "user_get_knowledge_card_themes_from_query_generation_result",
            payload: {
              query: queryContext.query,
              themesCount: themeResponses.length,
              // 记录生成的主题详情
              themesDetails: themeResponses.map((theme) => ({
                title: theme,
              })),
              timestamp: new Date().toISOString(),
            },
          });

          // 知识卡片主题生成完成后，检查并映射代码
          try {
            await dispatch(checkAndMapKnowledgeCardsToCode({ stepId }));
            console.log(
              `✅ 完成步骤 ${stepId} 基于查询生成知识卡片的代码映射检查`,
            );
          } catch (mappingError) {
            console.warn(
              `⚠️ 步骤 ${stepId} 基于查询生成知识卡片的代码映射检查失败:`,
              mappingError,
            );
            // 不抛出错误，让知识卡片生成操作继续完成
          }

          // 触发高亮事件：展开对应的步骤并高亮所有新生成的知识卡片
          const finalState = getState();
          const targetStep = finalState.codeAwareSession.steps.find(
            (s) => s.id === stepId,
          );
          if (targetStep) {
            // 构建高亮事件列表：包括步骤本身和所有新生成的知识卡片
            const highlightEvents = [
              // 首先高亮步骤以展开它
              {
                sourceType: "step" as const,
                identifier: stepId,
                additionalInfo: targetStep,
              },
              // 然后高亮所有新生成的知识卡片
              ...newlyCreatedCardIds.map((cardId) => {
                const knowledgeCard = targetStep.knowledgeCards.find(
                  (kc) => kc.id === cardId,
                );
                return {
                  sourceType: "knowledgeCard" as const,
                  identifier: cardId,
                  additionalInfo: knowledgeCard,
                };
              }),
            ];

            dispatch(updateHighlight(highlightEvents));
            console.log(
              `✨ 触发了步骤 ${stepId} 和 ${newlyCreatedCardIds.length} 个新知识卡片的高亮事件`,
            );
          }

          // 设置生成完成状态 - 移到最后确保状态正确设置
          dispatch(
            setKnowledgeCardGenerationStatus({ stepId, status: "ready" }),
          );
        } else {
          console.warn("No valid themes returned from LLM");
          dispatch(
            setKnowledgeCardGenerationStatus({ stepId, status: "ready" }),
          );
        }
      } catch (parseError) {
        console.error("Error parsing LLM response:", parseError);
        // 解析失败后回到empty状态，这样用户可以重试
        dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
        throw new Error("解析LLM响应失败");
      }
    } catch (error) {
      console.error("❌ 基于查询的知识卡片主题生成最终失败:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // 失败后回到empty状态，这样用户可以重试
      dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
    } finally {
      // 确保无论如何都不会卡在generating状态，但不要覆盖已经正确设置的状态
      const finalState = getState();
      const currentStep = finalState.codeAwareSession.steps.find(
        (step) => step.id === stepId,
      );
      if (currentStep?.knowledgeCardGenerationStatus === "generating") {
        console.warn(
          `⚠️ 检测到步骤 ${stepId} 仍处于generating状态，重置为empty以允许重试`,
        );
        dispatch(setKnowledgeCardGenerationStatus({ stepId, status: "empty" }));
      }
      // 如果状态是 "checked"，说明已经成功完成，不要修改
      console.log(
        `🔍 最终状态检查 - 步骤 ${stepId} 的知识卡片生成状态: ${currentStep?.knowledgeCardGenerationStatus}`,
      );
    }
  },
);

// 辅助函数：检查并清理卡住的知识卡片生成状态
export const checkAndClearStuckGeneratingStatus = createAsyncThunk<
  void,
  void,
  ThunkApiType
>(
  "codeAware/checkAndClearStuckGeneratingStatus",
  async (_, { dispatch, getState }) => {
    const state = getState();
    const steps = state.codeAwareSession.steps;

    // 查找所有处于generating状态的步骤
    const stuckSteps = steps.filter(
      (step) => step.knowledgeCardGenerationStatus === "generating",
    );

    if (stuckSteps.length > 0) {
      console.warn(
        `🔧 发现 ${stuckSteps.length} 个步骤卡在generating状态，正在清理...`,
      );

      stuckSteps.forEach((step) => {
        console.log(`🔄 重置步骤 ${step.id} (${step.title}) 的生成状态`);
        dispatch(
          setKnowledgeCardGenerationStatus({
            stepId: step.id,
            status: "empty",
          }),
        );
      });

      console.log(`✅ 已清理 ${stuckSteps.length} 个卡住的生成状态`);
    } else {
      console.log("✅ 没有发现卡住的生成状态");
    }
  },
);

// 异步根据现有代码和步骤生成新代码（重构版本：使用流式生成和tool calls）
export const generateCodeFromSteps = createAsyncThunk<
  {
    changedCode: string;
    stepsCorrespondingCode: Array<{
      id: string;
      code: string;
    }>;
  },
  {
    existingCode: string;
    filepath: string;
    orderedSteps: Array<{
      id: string;
      title: string;
      abstract: string;
    }>;
    previouslyGeneratedSteps?: Array<{
      id: string;
      title: string;
      abstract: string;
      current_corresponding_code?: string;
    }>;
  },
  ThunkApiType
>(
  "codeAware/generateCodeFromSteps",
  async (
    { existingCode, filepath, orderedSteps, previouslyGeneratedSteps },
    { dispatch, extra, getState },
  ) => {
    try {
      // Log: 用户触发代码生成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_code_generation",
        payload: {
          existingCodeLength: existingCode.length,
          filepath,
          stepsCount: orderedSteps.length,
          previouslyGeneratedStepsCount: previouslyGeneratedSteps?.length || 0,
          stepsDetails: orderedSteps.map((step) => ({
            title: step.title,
            abstract: step.abstract
              ? step.abstract.substring(0, 200) +
                (step.abstract.length > 200 ? "..." : "")
              : "",
          })),
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();

      console.log("generateCodeFromSteps called with:", {
        existingCodeLength: existingCode.length,
        filepath: filepath,
        stepsCount: orderedSteps.length,
        previouslyGeneratedStepsCount: previouslyGeneratedSteps?.length || 0,
        steps: orderedSteps.map((s) => ({
          id: s.id,
          title: s.title,
          abstract: s.abstract,
        })),
      });

      // 获取任务描述
      const taskDescription =
        state.codeAwareSession.userRequirement?.requirementDescription || "";

      // 判断是否是最后一步
      const allSteps = state.codeAwareSession.steps;
      const maxStepIndex = Math.max(...allSteps.map((_, index) => index));
      const lastStepId = allSteps[maxStepIndex]?.id;
      const isLastStep = orderedSteps.some((step) => step.id === lastStepId);

      console.log("🔍 步骤判断信息:", {
        allStepsCount: allSteps.length,
        maxStepIndex,
        lastStepId,
        currentStepsIds: orderedSteps.map((s) => s.id),
        isLastStep,
      });

      // 使用新的流式生成thunk
      console.log("🚀 开始使用流式生成方式生成代码...");

      // 动态导入以避免循环依赖
      const { streamCodeGenerationThunk } = await import(
        "./streamCodeGeneration"
      );

      await dispatch(
        streamCodeGenerationThunk({
          orderedSteps,
          filepath,
          previouslyGeneratedSteps: previouslyGeneratedSteps?.map((s) => ({
            id: s.id,
            title: s.title,
            abstract: s.abstract,
          })),
          taskDescription,
          isLastStep,
        }),
      ).unwrap();

      console.log("✅ 流式代码生成完成");

      // ⚠️⚠️⚠️ 以下逻辑已被注释掉，因为不再需要映射关系 ⚠️⚠️⚠️
      /*
      // 第二步：并行为每个步骤找到相关的代码行
      // 第三步：处理所有结果，创建代码块和映射关系
      // ... 映射关系创建逻辑 ...
      */
      // ⚠️⚠️⚠️ 以上逻辑已被注释掉 ⚠️⚠️⚠️

      // 标记所有相关步骤为已生成
      orderedSteps.forEach((step) => {
        dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
      });
      console.log("✅ 所有步骤状态已更新为 'generated'");

      // 调用各个步骤的 checkAndMapKnowledgeCardsToCode
      console.log("🧭 开始为所有步骤检查和映射知识卡片...");
      orderedSteps.forEach((step) => {
        dispatch(checkAndMapKnowledgeCardsToCode({ stepId: step.id }));
        console.log(`🎯 已触发步骤 ${step.id} 的知识卡片映射检查`);
      });

      console.log("✅ generateCodeFromSteps 简化版本执行完成");

      // Log: 代码生成完成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_get_code_generation_result",
        payload: {
          filepath,
          stepsCount: orderedSteps.length,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        changedCode: "", // 不再返回代码，由tool call处理
        stepsCorrespondingCode: [], // 不再返回映射关系
      };
    } catch (error) {
      console.error("❌ generateCodeFromSteps 执行失败:", error);
      // 重置步骤状态
      orderedSteps.forEach((step) => {
        dispatch(setStepStatus({ stepId: step.id, status: "confirmed" }));
      });
      throw error;
    }
  },
);

// 异步重新运行步骤 - 根据步骤抽象的变化更新代码和映射关系
export const rerunStep = createAsyncThunk<
  {
    changedCode: string;
    stepsCorrespondingCode: Array<{
      id: string;
      code: string;
    }>;
  },
  {
    stepId: string;
    changedStepAbstract: string;
    existingCode: string;
    filepath: string;
  },
  ThunkApiType
>(
  "codeAware/rerunStep",
  async (
    { stepId, changedStepAbstract, existingCode, filepath },
    { dispatch, extra, getState },
  ) => {
    try {
      // Log: 用户触发步骤重新运行
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_step_rerun",
        payload: {
          changedStepAbstract: changedStepAbstract
            ? changedStepAbstract.substring(0, 200) +
              (changedStepAbstract.length > 200 ? "..." : "")
            : "",
          existingCodeLength: existingCode.length,
          filepath,
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // 从Redux状态中获取步骤信息
      const steps = state.codeAwareSession.steps;
      const targetStep = steps.find((step) => step.id === stepId);
      if (!targetStep) {
        throw new Error(`Step with id ${stepId} not found`);
      }

      // 获取原始的abstract（用于生成代码时的abstract）
      const originalAbstract =
        targetStep.previousStepAbstract || targetStep.abstract;

      console.log("rerunStep called with:", {
        stepId,
        stepTitle: targetStep.title,
        originalAbstract: originalAbstract,
        currentAbstract: targetStep.abstract,
        changedAbstract: changedStepAbstract,
        knowledgeCardsCount: targetStep.knowledgeCards.length,
        existingCodeLength: existingCode.length,
        filepath: filepath,
      });

      // 第一步：生成更新的代码
      console.log("📝 第一步：开始生成更新的代码...");
      let updatedCode = "";

      // 准备所有步骤信息（不包含知识卡片）
      const allStepsForCodeGeneration = steps.map((step) => ({
        id: step.id,
        title: step.title,
        abstract: step.id === stepId ? changedStepAbstract : step.abstract,
      }));

      // 获取任务描述
      const taskDescription =
        state.codeAwareSession.userRequirement?.requirementDescription || "";

      // 构造第一步的提示词 - 专门为 rerun step 场景设计
      const codePrompt = constructRerunStepCodeUpdatePromptLocal(
        existingCode,
        allStepsForCodeGeneration,
        stepId,
        originalAbstract,
        changedStepAbstract,
        taskDescription,
      );

      // 第一步：调用LLM生成代码，带重试机制
      const maxRetries = 3;
      let lastError: Error | null = null;
      let codeResult: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 代码生成尝试 ${attempt}/${maxRetries}`);

          // 添加超时保护
          const timeoutPromise = new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("LLM请求超时")), 60000), // 60秒超时
          );

          const llmPromise = extra.ideMessenger.request("llm/complete", {
            prompt: codePrompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          codeResult = await Promise.race([llmPromise, timeoutPromise]);

          if (codeResult.status !== "success" || !codeResult.content) {
            throw new Error("LLM request failed or returned empty content");
          }

          break; // 成功，跳出重试循环
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ 代码生成第 ${attempt} 次尝试失败:`,
            lastError.message,
          );

          // 如果不是最后一次尝试，等待一段时间再重试
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数退避
            console.log(`⏱️ 等待 ${delay}ms 后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      if (
        !codeResult ||
        codeResult.status !== "success" ||
        !codeResult.content
      ) {
        throw lastError || new Error("代码生成失败");
      }

      // 解析第一步的响应
      try {
        const codeResponse = JSON.parse(codeResult.content);
        updatedCode = codeResponse.complete_code || "";

        if (!updatedCode) {
          throw new Error("LLM返回的代码为空");
        }

        console.log("✅ 第一步代码生成成功，代码长度:", updatedCode.length);
      } catch (parseError) {
        console.error(
          "解析第一步LLM响应失败:",
          parseError,
          "响应内容:",
          codeResult.content,
        );
        throw new Error("解析LLM代码生成响应失败");
      }

      // 第二步：并行为每个步骤找到相关的代码行
      console.log("🎯 第二步：开始并行查找步骤相关代码行...");

      // 准备所有需要处理的步骤（使用更新后的abstract）
      const allStepsToProcess = steps.map((step) => ({
        id: step.id,
        title: step.title,
        abstract: step.id === stepId ? changedStepAbstract : step.abstract,
      }));

      console.log(
        "📝 准备处理的步骤:",
        allStepsToProcess.map((s) => ({ id: s.id, title: s.title })),
      );

      // 为每个步骤并行创建查找相关代码行的请求
      const stepCodeLinePromises = allStepsToProcess.map(
        async (
          step,
        ): Promise<{
          stepId: string;
          stepTitle: string;
          stepAbstract: string;
          result: any | null;
        }> => {
          const prompt = constructFindStepRelatedCodeLinesPrompt(
            updatedCode,
            step.title,
            step.abstract,
          );

          console.log(`🔍 为步骤 ${step.id} 创建查找代码行请求...`);

          // 为每个步骤的请求添加重试机制
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const result = await extra.ideMessenger.request("llm/complete", {
                prompt: prompt,
                completionOptions: {},
                title: defaultModel.title,
              });

              if (result.status === "success" && result.content) {
                console.log(`✅ 步骤 ${step.id} 代码行查找成功`);
                return {
                  stepId: step.id,
                  stepTitle: step.title,
                  stepAbstract: step.abstract,
                  result: result,
                };
              } else {
                throw new Error(
                  `LLM request failed for step ${step.id}: status=${result.status}`,
                );
              }
            } catch (error) {
              console.warn(
                `⚠️ 步骤 ${step.id} 代码行查找尝试 ${attempt}/${maxRetries} 失败:`,
                error,
              );

              if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000;
                await new Promise((resolve) => setTimeout(resolve, waitTime));
              } else {
                console.error(`❌ 步骤 ${step.id} 代码行查找最终失败`);
                return {
                  stepId: step.id,
                  stepTitle: step.title,
                  stepAbstract: step.abstract,
                  result: null,
                };
              }
            }
          }

          // 不应该到达这里，但为了类型安全
          return {
            stepId: step.id,
            stepTitle: step.title,
            stepAbstract: step.abstract,
            result: null,
          };
        },
      );

      // 等待所有并行请求完成
      console.log("⏳ 等待所有步骤的代码行查找完成...");
      const stepCodeLineResults = await Promise.all(stepCodeLinePromises);

      // 第三步：处理所有结果，创建代码块和映射关系
      console.log("📦 第三步：处理查找结果并创建代码块...");

      const stepsCorrespondingCode: Array<{ id: string; code: string }> = [];
      const allCreatedCodeChunks: Array<{
        id: string;
        content: string;
        range: [number, number];
        stepIds: string[];
      }> = [];

      // 处理每个步骤的结果
      for (const stepResult of stepCodeLineResults) {
        if (
          !stepResult ||
          !stepResult.result ||
          stepResult.result.status !== "success"
        ) {
          console.warn(
            `⚠️ 跳过步骤 ${stepResult?.stepId || "unknown"}，因为没有有效结果`,
          );
          continue;
        }

        try {
          // 解析LLM返回的代码行
          let jsonContent = stepResult.result.content.trim();

          // 清理JSON内容
          if (jsonContent.startsWith("```json")) {
            jsonContent = jsonContent
              .replace(/^```json\s*/, "")
              .replace(/\s*```$/, "");
          } else if (jsonContent.startsWith("```")) {
            jsonContent = jsonContent
              .replace(/^```\s*/, "")
              .replace(/\s*```$/, "");
          }

          const jsonStart = jsonContent.indexOf("{");
          const jsonEnd = jsonContent.lastIndexOf("}") + 1;

          if (jsonStart !== -1 && jsonEnd > jsonStart) {
            jsonContent = jsonContent.substring(jsonStart, jsonEnd);
          }

          const parsedResponse = JSON.parse(jsonContent);
          const relatedCodeLines = parsedResponse.related_code_lines || [];

          console.log(
            `📝 步骤 ${stepResult.stepId} 找到 ${relatedCodeLines.length} 行相关代码`,
          );

          if (relatedCodeLines.length > 0) {
            // 使用 createCodeChunksFromLineArray 创建代码块
            const codeChunks = createCodeChunksFromLineArray(
              relatedCodeLines,
              updatedCode,
              `step-${stepResult.stepId}`,
            );

            // 为每个代码块添加步骤ID
            codeChunks.forEach((chunk) => {
              allCreatedCodeChunks.push({
                ...chunk,
                stepIds: [stepResult.stepId],
              });
            });

            // 合并所有代码行作为步骤对应的代码
            const combinedCode = relatedCodeLines.join("\n");
            if (combinedCode.trim()) {
              stepsCorrespondingCode.push({
                id: stepResult.stepId,
                code: combinedCode,
              });
            }
          }
        } catch (parseError) {
          console.error(
            `❌ 解析步骤 ${stepResult.stepId} 代码行响应失败:`,
            parseError,
          );
          console.warn(`⚠️ 跳过步骤 ${stepResult.stepId}，因为解析失败`);
        }
      }

      console.log("✅ rerunStep 第二步并行查找和第三步处理完成:", {
        stepsWithCode: stepsCorrespondingCode.length,
        createdCodeChunks: allCreatedCodeChunks.length,
      });

      // 清理现有的代码块和映射关系，但保留要求映射
      console.log("🗑️ 保存要求映射关系并清除现有的代码块和代码映射...");

      // 首先清理所有知识卡片的代码映射，因为代码重新生成后这些映射可能失效
      console.log("🧹 清理知识卡片代码映射...");
      dispatch(clearKnowledgeCardCodeMappings());

      const currentState = getState();
      // 保留 requirement-step 映射关系
      const requirementStepMappings =
        currentState.codeAwareSession.codeAwareMappings.filter(
          (mapping: any) =>
            mapping.highLevelStepId &&
            mapping.stepId &&
            !mapping.codeChunkId &&
            !mapping.knowledgeCardId,
        );
      // 保留 requirement-step-knowledgeCard 映射关系（没有代码块的）
      const requirementKnowledgeCardMappings =
        currentState.codeAwareSession.codeAwareMappings.filter(
          (mapping: any) =>
            mapping.highLevelStepId &&
            mapping.stepId &&
            mapping.knowledgeCardId &&
            !mapping.codeChunkId,
        );

      console.log("💾 保存的要求映射关系:", {
        requirementStepMappings: requirementStepMappings.length,
        requirementKnowledgeCardMappings:
          requirementKnowledgeCardMappings.length,
      });

      dispatch(clearAllCodeChunks());
      dispatch(clearAllCodeAwareMappings());

      // 重新添加要求映射关系
      requirementStepMappings.forEach((mapping: any) => {
        dispatch(createCodeAwareMapping(mapping));
      });
      // 重新添加要求-知识卡片映射关系
      requirementKnowledgeCardMappings.forEach((mapping: any) => {
        dispatch(createCodeAwareMapping(mapping));
      });

      // 创建所有代码块
      allCreatedCodeChunks.forEach((chunk) => {
        dispatch(
          createOrGetCodeChunk({
            content: chunk.content,
            range: chunk.range,
            filePath: filepath,
            id: chunk.id,
          }),
        );
        console.log(
          `📋 创建代码块 ${chunk.id}，范围: [${chunk.range[0]}, ${chunk.range[1]}]`,
        );
      });

      // 创建映射关系
      console.log("🔗 开始创建映射关系...");
      const updatedState = getState();
      const existingRequirementMappings =
        updatedState.codeAwareSession.codeAwareMappings.filter(
          (mapping: any) =>
            mapping.highLevelStepId && mapping.stepId && !mapping.codeChunkId,
        );

      // 为所有创建的代码块创建映射关系
      allCreatedCodeChunks.forEach((chunk) => {
        chunk.stepIds.forEach((stepId) => {
          // 找到对应的需求块ID
          const existingReqMapping = existingRequirementMappings.find(
            (mapping) => mapping.stepId === stepId,
          );

          const stepMapping: CodeAwareMapping = {
            codeChunkId: chunk.id,
            stepId: stepId,
            highLevelStepId: existingReqMapping?.highLevelStepId,
            isHighlighted: false,
          };

          dispatch(createCodeAwareMapping(stepMapping));
          console.log(`🔗 创建步骤映射: ${chunk.id} -> ${stepId}`);
        });
      });

      // 应用生成的代码到IDE
      console.log("🚀 开始将更新的代码应用到IDE文件...");

      try {
        // 使用diff方式应用代码变更，更安全且支持undo
        await extra.ideMessenger.request("applyDiffChanges", {
          filepath: filepath,
          oldCode: existingCode,
          newCode: updatedCode,
        });

        console.log("✅ 代码已成功应用到IDE文件");
      } catch (error) {
        console.error("❌ 应用代码到IDE失败:", error);
      }

      // 更新步骤的抽象内容
      dispatch(
        setStepAbstract({
          stepId: stepId,
          abstract: changedStepAbstract,
        }),
      );
      console.log(`📄 步骤抽象已更新为: "${changedStepAbstract}"`);

      // 检查知识卡片是否需要重新生成内容
      const updatedStep = targetStep.knowledgeCards;
      if (updatedStep && updatedStep.length > 0) {
        // 设置知识卡片为需要重新生成内容状态
        dispatch(
          setKnowledgeCardGenerationStatus({
            stepId: stepId,
            status: "empty",
          }),
        );
        console.log(`🔄 知识卡片标记为需要重新生成内容`);
      }

      console.log("✅ 步骤重新运行完成");

      // Log: 步骤重新运行完成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_get_step_rerun_result",
        payload: {
          updatedCodeLength: updatedCode.length,
          changedStepAbstract: changedStepAbstract
            ? changedStepAbstract.substring(0, 200) +
              (changedStepAbstract.length > 200 ? "..." : "")
            : "",
          createdCodeChunksCount: allCreatedCodeChunks.length,
          timestamp: new Date().toISOString(),
        },
      });

      // 标记步骤为已生成
      dispatch(setStepStatus({ stepId: stepId, status: "generated" }));
      console.log(`✅ 步骤 ${stepId} 状态已更新为 'generated'`);

      // 调用 checkAndMapKnowledgeCardsToCode
      console.log(`🧭 为步骤 ${stepId} 检查和映射知识卡片...`);
      dispatch(checkAndMapKnowledgeCardsToCode({ stepId: stepId }));
      console.log(`🎯 已触发步骤 ${stepId} 的知识卡片映射检查`);

      // 触发highlight事件，以step为source高亮重新运行的步骤变化
      const latestState = getState();
      const rerunStepInfo = latestState.codeAwareSession.steps.find(
        (s) => s.id === stepId,
      );
      if (rerunStepInfo) {
        dispatch(
          updateHighlight({
            sourceType: "step",
            identifier: stepId,
            additionalInfo: rerunStepInfo,
          }),
        );
        console.log(`✨ 触发了步骤 ${stepId} 的highlight事件`);
      }

      return {
        changedCode: updatedCode,
        stepsCorrespondingCode,
      };
    } catch (error) {
      console.error("❌ rerunStep 执行失败:", error);
      // 重置步骤状态
      dispatch(setStepStatus({ stepId: stepId, status: "generated" }));
      throw error;
    }
  },
);

// Process code updates when steps are marked as code_dirty
export const processCodeUpdates = createAsyncThunk<
  void,
  {
    currentFilePath: string;
    previousContent: string;
    currentContent: string;
    codeDiff: string;
  },
  ThunkApiType
>(
  "codeAware/processCodeUpdates",
  async (
    { currentFilePath, previousContent, currentContent, codeDiff },
    { getState, dispatch, extra },
  ) => {
    try {
      const state = getState();
      const steps = state.codeAwareSession.steps;
      const mappings = state.codeAwareSession.codeAwareMappings;
      const codeChunks = state.codeAwareSession.codeChunks;

      // Find steps that are marked as code_dirty
      const codeDirtySteps = steps.filter(
        (step) => step.stepStatus === "code_dirty",
      );

      if (codeDirtySteps.length === 0) {
        console.log("No code_dirty steps found, skipping update");
        return;
      }

      console.log(
        "🔄 Processing code updates for dirty steps:",
        codeDirtySteps.map((s) => s.id),
      );

      // Disable code chunks and remove mappings for code_dirty steps
      for (const step of codeDirtySteps) {
        // Find all mappings related to this step (including knowledge cards)
        const relatedMappings = mappings.filter(
          (mapping) =>
            mapping.stepId === step.id ||
            (mapping.knowledgeCardId &&
              mapping.knowledgeCardId.startsWith(`${step.id}-kc-`)),
        );

        // Disable related code chunks
        relatedMappings.forEach((mapping) => {
          if (mapping.codeChunkId) {
            dispatch(
              setCodeChunkDisabled({
                codeChunkId: mapping.codeChunkId,
                disabled: true,
              }),
            );
          }
        });

        // Remove mappings for this step
        dispatch(removeCodeAwareMappings({ stepId: step.id }));

        console.log(
          `🚫 Disabled ${relatedMappings.length} code chunks and removed mappings for step ${step.id}`,
        );
      }

      // Prepare data for LLM call
      const relevantSteps = codeDirtySteps.map((step) => ({
        id: step.id,
        title: step.title,
        abstract: step.abstract,
        knowledge_cards: step.knowledgeCards.map((kc) => ({
          id: kc.id,
          title: kc.title,
        })),
      }));

      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // Call LLM to analyze code changes and update steps with retry mechanism
      const prompt = constructProcessCodeChangesPrompt(
        previousContent,
        currentContent,
        codeDiff,
        relevantSteps,
      );
      const maxRetries = 3;
      let lastError: Error | null = null;
      let result: any = null;

      console.log("🤖 Calling LLM to process code changes...", prompt);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 Attempt ${attempt}/${maxRetries} to call LLM...`);

          result = await extra.ideMessenger.request("llm/complete", {
            prompt: prompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          if (result.status === "success" && result.content) {
            console.log("✅ LLM request successful on attempt", attempt);
            break;
          } else {
            throw new Error(
              `LLM request failed: status=${result.status}, hasContent=${!!result.content}`,
            );
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(
            `⚠️ Attempt ${attempt}/${maxRetries} failed:`,
            lastError.message,
          );

          if (attempt < maxRetries) {
            // Wait before retry (exponential backoff)
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`⏱️ Waiting ${waitTime}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!result || result.status !== "success" || !result.content) {
        // If all retries failed, restore step status and throw error
        console.error(
          "❌ All LLM retry attempts failed, restoring step status...",
        );
        for (const step of codeDirtySteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
        }
        throw new Error(
          `LLM request failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`,
        );
      }

      console.log("LLM response for code update analysis:", result.content);

      // Parse LLM response with error handling
      try {
        const jsonResponse = JSON.parse(result.content);
        const updatedSteps = jsonResponse.updated_steps || [];
        const knowledgeCards = jsonResponse.knowledge_cards || [];

        console.log("✅ Code update analysis completed:", {
          updatedStepsCount: updatedSteps.length,
          knowledgeCardsCount: knowledgeCards.length,
          stepsBroken: updatedSteps.filter((s: any) => s.code_broken).length,
        });

        // Validate response structure
        if (!Array.isArray(updatedSteps) || !Array.isArray(knowledgeCards)) {
          throw new Error(
            "Invalid LLM response structure: expected arrays for updated_steps and knowledge_cards",
          );
        }

        // Process updated steps
        let codeChunkCounter = state.codeAwareSession.codeChunks.length + 1;
        const newCodeChunks: CodeChunk[] = []; // 跟踪新创建的代码块

        for (const stepUpdate of updatedSteps) {
          const stepId = stepUpdate.id;

          try {
            // Check if step's code is broken
            if (stepUpdate.code_broken) {
              console.log(
                `� Step ${stepId} code is broken, marking as confirmed for regeneration`,
              );
              dispatch(setStepStatus({ stepId, status: "confirmed" }));
              continue; // Skip further processing for this step as its code is broken
            }

            // Update step title and abstract if needed
            if (stepUpdate.needs_update) {
              if (stepUpdate.title) {
                dispatch(setStepTitle({ stepId, title: stepUpdate.title }));
              }
              if (stepUpdate.abstract) {
                dispatch(
                  setStepAbstract({ stepId, abstract: stepUpdate.abstract }),
                );
              }
              console.log(
                `📝 Updated step ${stepId}: title="${stepUpdate.title}", abstract updated`,
              );
            }

            // Create new code chunk and mapping for the step
            if (
              stepUpdate.corresponding_code &&
              stepUpdate.corresponding_code.trim()
            ) {
              const stepCodeContent = stepUpdate.corresponding_code.trim();
              const stepRange = calculateCodeChunkRange(
                currentContent,
                stepCodeContent,
              );
              const stepCodeChunkId = `c-${codeChunkCounter++}`;

              const newChunk: CodeChunk = {
                id: stepCodeChunkId,
                content: stepCodeContent,
                range: stepRange,
                filePath: currentFilePath,
                disabled: false,
                isHighlighted: false,
              };

              dispatch(
                createOrGetCodeChunk({
                  content: stepCodeContent,
                  range: stepRange,
                  filePath: currentFilePath,
                  id: stepCodeChunkId,
                }),
              );

              // 添加到新代码块跟踪列表
              newCodeChunks.push(newChunk);

              // Find requirement chunk for mapping
              const existingStepMapping = mappings.find(
                (mapping) =>
                  mapping.stepId === stepId && mapping.highLevelStepId,
              );
              const highLevelStepId = existingStepMapping?.highLevelStepId;

              // Create step mapping
              const stepMapping: CodeAwareMapping = {
                codeChunkId: stepCodeChunkId,
                stepId: stepId,
                highLevelStepId: highLevelStepId,
                isHighlighted: false,
              };

              dispatch(createCodeAwareMapping(stepMapping));
              console.log(
                `🔗 Created new step mapping: ${stepCodeChunkId} -> ${stepId}`,
              );
            }

            // Set step status to generated (only if code is not broken)
            dispatch(setStepStatus({ stepId, status: "generated" }));

            // 调用 checkAndMapKnowledgeCardsToCode
            console.log(`🧭 为步骤 ${stepId} 检查和映射知识卡片...`);
            dispatch(checkAndMapKnowledgeCardsToCode({ stepId: stepId }));
            console.log(`🎯 已触发步骤 ${stepId} 的知识卡片映射检查`);
          } catch (stepError) {
            console.error(`❌ Error processing step ${stepId}:`, stepError);
            // Set this step back to generated status if processing fails
            dispatch(setStepStatus({ stepId, status: "generated" }));
          }
        }

        // Process knowledge cards
        for (const cardUpdate of knowledgeCards) {
          const cardId = cardUpdate.id;
          const stepId = cardId.split("-kc-")[0]; // Extract step ID from card ID

          try {
            if (cardUpdate.needs_update) {
              // Update knowledge card title and clear content
              if (cardUpdate.title) {
                dispatch(
                  updateKnowledgeCardTitle({
                    stepId,
                    cardId,
                    title: cardUpdate.title,
                  }),
                );
                console.log(
                  `🏷️ Updated knowledge card title: ${cardId} -> "${cardUpdate.title}"`,
                );
              }

              // Mark for content regeneration
              dispatch(
                setKnowledgeCardGenerationStatus({
                  stepId,
                  status: "generating",
                }),
              );
            }

            // Create new code chunk and mapping for the knowledge card
            if (
              cardUpdate.corresponding_code &&
              cardUpdate.corresponding_code.trim()
            ) {
              const cardCodeContent = cardUpdate.corresponding_code.trim();
              const cardRange = calculateCodeChunkRange(
                currentContent,
                cardCodeContent,
              );
              const cardCodeChunkId = `c-${codeChunkCounter++}`;

              const newKnowledgeCardChunk: CodeChunk = {
                id: cardCodeChunkId,
                content: cardCodeContent,
                range: cardRange,
                filePath: currentFilePath,
                disabled: false,
                isHighlighted: false,
              };

              dispatch(
                createOrGetCodeChunk({
                  content: cardCodeContent,
                  range: cardRange,
                  filePath: currentFilePath,
                  id: cardCodeChunkId,
                }),
              );

              // 添加到新代码块跟踪列表
              newCodeChunks.push(newKnowledgeCardChunk);

              // Find requirement chunk for mapping
              const existingCardMapping = mappings.find(
                (mapping) => mapping.knowledgeCardId === cardId,
              );
              const highLevelStepId = existingCardMapping?.highLevelStepId;

              // Create knowledge card mapping
              const cardMapping: CodeAwareMapping = {
                codeChunkId: cardCodeChunkId,
                stepId,
                knowledgeCardId: cardId,
                highLevelStepId: highLevelStepId,
                isHighlighted: false,
              };

              dispatch(createCodeAwareMapping(cardMapping));
              console.log(
                `🎯 Created new knowledge card mapping: ${cardCodeChunkId} -> ${cardId}`,
              );
            }
          } catch (cardError) {
            console.error(
              `❌ Error processing knowledge card ${cardId}:`,
              cardError,
            );
            // Continue processing other cards even if one fails
          }
        }

        console.log("✅ Code updates processed successfully");

        // 触发highlight事件，以code为source高亮更新的代码部分
        // 收集所有新创建的代码块用于highlight
        const codeHighlightEvents = newCodeChunks.map((chunk) => ({
          sourceType: "code" as const,
          identifier: chunk.id,
          additionalInfo: chunk,
        }));

        if (codeHighlightEvents.length > 0) {
          dispatch(updateHighlight(codeHighlightEvents));
          console.log(
            `✨ 触发了 ${codeHighlightEvents.length} 个代码块的highlight事件`,
          );
        }
      } catch (parseError) {
        console.error("Error parsing LLM response:", parseError);

        // Restore step status for all code_dirty steps
        console.log("🔄 Restoring step status for failed code update...");
        for (const step of codeDirtySteps) {
          dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
        }

        throw new Error("解析LLM代码更新响应失败");
      }
    } catch (error) {
      console.error("❌ Error processing code updates:", error);

      // Restore step status for all code_dirty steps if any error occurs
      console.log(
        "🔄 Restoring step status for all code_dirty steps due to error...",
      );
      const currentState = getState();
      const currentSteps = currentState.codeAwareSession.steps;
      const currentCodeDirtySteps = currentSteps.filter(
        (step) => step.stepStatus === "code_dirty",
      );

      for (const step of currentCodeDirtySteps) {
        dispatch(setStepStatus({ stepId: step.id, status: "generated" }));
      }

      throw new Error(
        `处理代码更新失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
);

// Process SAQ submission - evaluate user answer using LLM
export const processSaqSubmission = createAsyncThunk<
  void,
  {
    testId: string;
    userAnswer: string;
  },
  ThunkApiType
>(
  "codeAware/processSaqSubmission",
  async ({ testId, userAnswer }, { getState, dispatch, extra }) => {
    const maxRetries = 3; // 最大重试次数
    let lastError: Error | null = null;

    try {
      // Log: 用户提交简答题答案
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_saq_submission_processing",
        payload: {
          testId,
          userAnswer,
          timestamp: new Date().toISOString(),
        },
      });

      const state = getState();
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("Default model not defined");
      }

      // Get test information using the selector
      const testInfo = selectTestByTestId(state, testId);
      if (!testInfo || !testInfo.test) {
        console.error("❌ [CodeAware] Test not found for testId:", testId);
        return;
      }

      const { stepId, knowledgeCardId, test } = testInfo;

      if (test.question_type !== "shortAnswer") {
        console.error(
          "❌ [CodeAware] Test is not a short answer question:",
          testId,
        );
        return;
      }

      // Set loading state
      dispatch(
        setSaqTestLoading({
          stepId,
          knowledgeCardId,
          testId,
          isLoading: true,
        }),
      );

      console.log("🔄 [CodeAware] Evaluating SAQ answer for test:", testId);

      // Create prompt for LLM evaluation
      const prompt = constructEvaluateSaqAnswerPrompt(
        test.stem,
        test.standard_answer,
        userAnswer,
      );

      // 重试机制
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 [CodeAware] SAQ评估尝试 ${attempt}/${maxRetries} for test: ${testId}`,
          );

          // Get LLM response
          const result = await extra.ideMessenger.request("llm/complete", {
            prompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          if (result.status !== "success" || !result.content) {
            throw new Error("LLM request failed");
          }

          console.log(
            "📝 [CodeAware] LLM evaluation response:",
            result.content,
          );

          // Parse the response
          try {
            const evaluationResult = JSON.parse(result.content.trim()) as {
              isCorrect: boolean;
              remarks: string;
            };

            // Update the test result in Redux store
            dispatch(
              updateSaqTestResult({
                stepId,
                knowledgeCardId,
                testId,
                userAnswer,
                isCorrect: evaluationResult.isCorrect,
                remarks: evaluationResult.remarks,
              }),
            );

            // Log: 简答题评估完成
            await extra.ideMessenger.request("addCodeAwareLogEntry", {
              eventType: "user_get_saq_submission_processing_result",
              payload: {
                testId,
                userAnswer,
                isCorrect: evaluationResult.isCorrect,
                remarks: evaluationResult.remarks,
                timestamp: new Date().toISOString(),
              },
            });

            console.log("✅ [CodeAware] SAQ evaluation completed:", {
              testId,
              isCorrect: evaluationResult.isCorrect,
              remarks: evaluationResult.remarks,
            });

            // 成功，跳出重试循环
            break;
          } catch (parseError) {
            console.error(
              `❌ [CodeAware] SAQ评估尝试 ${attempt} 解析失败:`,
              parseError,
            );

            if (attempt === maxRetries) {
              // 最后一次尝试仍然失败，使用fallback
              console.log(
                "🔄 [CodeAware] 所有重试失败，使用fallback保存用户答案",
              );
              dispatch(
                updateSaqTestResult({
                  stepId,
                  knowledgeCardId,
                  testId,
                  userAnswer,
                  isCorrect: false,
                  remarks: `无法评估答案（已重试${maxRetries}次），请稍后重试。`,
                }),
              );
              break;
            } else {
              // 继续重试
              throw parseError;
            }
          }
        } catch (attemptError) {
          lastError =
            attemptError instanceof Error
              ? attemptError
              : new Error(String(attemptError));
          console.warn(
            `⚠️ [CodeAware] SAQ评估尝试 ${attempt} 失败:`,
            lastError.message,
          );

          if (attempt === maxRetries) {
            console.error(
              `❌ [CodeAware] SAQ评估最终失败，已重试 ${maxRetries} 次`,
            );
            // 最后一次尝试仍然失败，使用fallback
            dispatch(
              updateSaqTestResult({
                stepId,
                knowledgeCardId,
                testId,
                userAnswer,
                isCorrect: false,
                remarks: `评估失败（已重试${maxRetries}次）: ${lastError.message}`,
              }),
            );
            break;
          }

          // 等待一段时间再重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }

      // Clear loading state
      dispatch(
        setSaqTestLoading({
          stepId,
          knowledgeCardId,
          testId,
          isLoading: false,
        }),
      );
    } catch (error) {
      console.error("❌ [CodeAware] processSaqSubmission failed:", error);

      // Clear loading state on error
      const state = getState();
      const testInfo = selectTestByTestId(state, testId);
      if (testInfo) {
        dispatch(
          setSaqTestLoading({
            stepId: testInfo.stepId,
            knowledgeCardId: testInfo.knowledgeCardId,
            testId,
            isLoading: false,
          }),
        );
      }

      throw error;
    }
  },
);

// 异步处理全局提问 - 根据问题选择相关步骤并生成知识卡片主题
export const processGlobalQuestion = createAsyncThunk<
  { selectedStepId: string; themes: string[]; knowledgeCardIds: string[] },
  {
    question: string;
    currentCode: string;
  },
  ThunkApiType
>(
  "codeAware/processGlobalQuestion",
  async ({ question, currentCode }, { getState, dispatch, extra }) => {
    const maxRetries = 3; // 最大重试次数
    let lastError: Error | null = null;

    try {
      // Log: 用户提交全局问题
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_order_global_question_processing",
        payload: {
          question,
          currentCodeLength: currentCode.length,
          timestamp: new Date().toISOString(),
        },
      });

      console.log("🔍 [CodeAware] Processing global question:", question);

      const state = getState();
      const steps = state.codeAwareSession.steps;
      const learningGoal = state.codeAwareSession.learningGoal || "";
      const taskDescription =
        state.codeAwareSession.userRequirement?.requirementDescription || "";
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);

      if (!defaultModel) {
        throw new Error("没有可用的默认模型");
      }

      if (steps.length === 0) {
        throw new Error("没有可用的步骤，请先生成步骤");
      }

      // 构建所有步骤的信息
      const allStepsInfo = steps.map((step) => ({
        id: step.id,
        title: step.title,
        abstract: step.abstract,
      }));

      // 构建全局提问的prompt
      const prompt = constructGlobalQuestionPrompt(
        question,
        allStepsInfo,
        taskDescription,
      );

      console.log("📤 [CodeAware] Sending global question request to LLM");

      // 重试机制
      let result: any = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 [CodeAware] 全局提问尝试 ${attempt}/${maxRetries}`);

          // 发送请求到LLM
          result = await extra.ideMessenger.request("llm/complete", {
            prompt: prompt,
            completionOptions: {},
            title: defaultModel.title,
          });

          console.log(
            "📥 [CodeAware] Received global question response:",
            result,
          );

          if (
            result.status !== "success" ||
            !result.content ||
            !result.content.trim()
          ) {
            throw new Error("LLM 返回了空响应或失败状态");
          }

          // 如果到达这里，说明请求成功，跳出重试循环
          break;
        } catch (attemptError) {
          lastError =
            attemptError instanceof Error
              ? attemptError
              : new Error(String(attemptError));
          console.warn(
            `⚠️ [CodeAware] 全局提问尝试 ${attempt} 失败:`,
            lastError.message,
          );

          if (attempt === maxRetries) {
            console.error(
              `❌ [CodeAware] 全局提问最终失败，已重试 ${maxRetries} 次`,
            );
            throw lastError;
          }

          // 等待一段时间再重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }

      // 如果所有重试都失败了，抛出最后一个错误
      if (!result || result.status !== "success" || !result.content) {
        throw lastError || new Error("全局提问处理失败");
      }

      const fullResponse = result.content;

      // 解析响应（带重试机制）
      let parsedResponse: {
        selected_step_id: string;
        knowledge_card_themes: string[];
      };

      for (let parseAttempt = 1; parseAttempt <= maxRetries; parseAttempt++) {
        try {
          parsedResponse = JSON.parse(fullResponse);
          break; // 解析成功，跳出循环
        } catch (parseError) {
          console.error(
            `❌ [CodeAware] 全局提问响应解析尝试 ${parseAttempt} 失败:`,
            parseError,
          );

          if (parseAttempt === maxRetries) {
            throw new Error(
              `无法解析 LLM 响应（已重试${maxRetries}次），请重试`,
            );
          }

          // 对于解析错误，我们不能重新发送请求，因为响应内容是固定的
          // 但我们可以稍等一下再试，以防是临时的处理问题
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const { selected_step_id, knowledge_card_themes } = parsedResponse!;

      if (
        !selected_step_id ||
        !knowledge_card_themes ||
        !Array.isArray(knowledge_card_themes)
      ) {
        throw new Error("LLM 响应格式不正确");
      }

      // 验证选择的步骤ID是否有效
      const selectedStep = steps.find((step) => step.id === selected_step_id);
      if (!selectedStep) {
        throw new Error(`无效的步骤ID: ${selected_step_id}`);
      }

      console.log(
        `✅ [CodeAware] Selected step: ${selected_step_id}, themes:`,
        knowledge_card_themes,
      );

      // 为选择的步骤创建知识卡片
      const createdCardIds: string[] = [];
      const currentState = getState();
      const selectedStepForCards = currentState.codeAwareSession.steps.find(
        (s) => s.id === selected_step_id,
      );
      const existingCardCount =
        selectedStepForCards?.knowledgeCards?.length || 0;

      for (let index = 0; index < knowledge_card_themes.length; index++) {
        const theme = knowledge_card_themes[index];
        const cardId = `${selected_step_id}-kc-${existingCardCount + index + 1}`;
        createdCardIds.push(cardId);

        dispatch(
          createKnowledgeCard({
            stepId: selected_step_id,
            cardId,
            theme,
          }),
        );

        // 查找该步骤对应的requirement chunk ID
        const stepRequirementMapping =
          currentState.codeAwareSession.codeAwareMappings.find(
            (mapping) =>
              mapping.stepId === selected_step_id &&
              mapping.highLevelStepId &&
              !mapping.codeChunkId &&
              !mapping.knowledgeCardId,
          );

        // 创建知识卡片与步骤的映射关系
        dispatch(
          createCodeAwareMapping({
            stepId: selected_step_id,
            knowledgeCardId: cardId,
            highLevelStepId: stepRequirementMapping?.highLevelStepId,
            isHighlighted: false,
          }),
        );

        console.log(`🔗 创建全局问题知识卡片映射: ${cardId}`, {
          stepId: selected_step_id,
          knowledgeCardId: cardId,
          highLevelStepId: stepRequirementMapping?.highLevelStepId,
        });
      }

      // 设置知识卡片生成状态为checked
      dispatch(
        setKnowledgeCardGenerationStatus({
          stepId: selected_step_id,
          status: "ready",
        }),
      );

      console.log("✅ [CodeAware] Global question processed successfully");

      // Log: 全局问题处理完成
      await extra.ideMessenger.request("addCodeAwareLogEntry", {
        eventType: "user_get_global_question_processing_result",
        payload: {
          question,
          selectedStepId: selected_step_id,
          themesCount: knowledge_card_themes.length,
          knowledgeCardIds: createdCardIds,
          timestamp: new Date().toISOString(),
        },
      });

      // 全局提问知识卡片生成完成后，检查并映射代码
      try {
        await dispatch(
          checkAndMapKnowledgeCardsToCode({ stepId: selected_step_id }),
        );
        console.log(
          `✅ 完成步骤 ${selected_step_id} 全局提问知识卡片的代码映射检查`,
        );
      } catch (mappingError) {
        console.warn(
          `⚠️ 步骤 ${selected_step_id} 全局提问知识卡片的代码映射检查失败:`,
          mappingError,
        );
        // 不抛出错误，让全局提问处理继续完成
      }

      // 触发高亮事件：展开对应的步骤并高亮所有新生成的知识卡片
      const finalState = getState();
      const targetStep = finalState.codeAwareSession.steps.find(
        (s) => s.id === selected_step_id,
      );
      if (targetStep) {
        // 构建高亮事件列表：包括步骤本身和所有新生成的知识卡片
        const highlightEvents = [
          // 首先高亮步骤以展开它
          {
            sourceType: "step" as const,
            identifier: selected_step_id,
            additionalInfo: targetStep,
          },
          // 然后高亮所有新生成的知识卡片
          ...createdCardIds.map((cardId) => {
            const knowledgeCard = targetStep.knowledgeCards.find(
              (kc) => kc.id === cardId,
            );
            return {
              sourceType: "knowledgeCard" as const,
              identifier: cardId,
              additionalInfo: knowledgeCard,
            };
          }),
        ];

        dispatch(updateHighlight(highlightEvents));
        console.log(
          `✨ 全局问题处理：触发了步骤 ${selected_step_id} 和 ${createdCardIds.length} 个新知识卡片的高亮事件`,
        );
      }

      // 返回选择的步骤ID和创建的知识卡片ID，用于高亮和展开
      return {
        selectedStepId: selected_step_id,
        themes: knowledge_card_themes,
        knowledgeCardIds: createdCardIds,
      };
    } catch (error) {
      console.error("❌ [CodeAware] processGlobalQuestion failed:", error);
      throw error;
    }
  },
);

// 异步检查并映射知识卡片到代码块 - 当步骤展开时检查知识卡片是否有对应的代码映射
export const checkAndMapKnowledgeCardsToCode = createAsyncThunk<
  void,
  {
    stepId: string;
  },
  ThunkApiType
>(
  "codeAware/checkAndMapKnowledgeCardsToCode",
  async ({ stepId }, { getState, dispatch, extra }) => {
    try {
      console.log(`🔍 检查步骤 ${stepId} 的知识卡片代码映射...`);

      const state = getState();
      const steps = state.codeAwareSession.steps;
      const allMappings = state.codeAwareSession.codeAwareMappings;
      const codeChunks = state.codeAwareSession.codeChunks;

      // 找到对应的步骤
      const step = steps.find((s) => s.id === stepId);
      if (!step) {
        console.warn(`步骤 ${stepId} 未找到`);
        return;
      }

      // 如果该步骤没有知识卡片，直接返回
      if (!step.knowledgeCards || step.knowledgeCards.length === 0) {
        console.log(`步骤 ${stepId} 没有知识卡片，跳过检查`);
        return;
      }

      // 找出没有代码映射的知识卡片
      const knowledgeCardsWithoutMapping = step.knowledgeCards.filter(
        (card) => {
          const hasMapping = allMappings.some(
            (mapping) =>
              mapping.knowledgeCardId === card.id && mapping.codeChunkId,
          );
          return !hasMapping;
        },
      );

      if (knowledgeCardsWithoutMapping.length === 0) {
        console.log(`步骤 ${stepId} 的所有知识卡片都已有代码映射`);
        return;
      }

      console.log(
        `步骤 ${stepId} 中有 ${knowledgeCardsWithoutMapping.length} 个知识卡片缺少代码映射:`,
        knowledgeCardsWithoutMapping.map((card) => card.title),
      );

      // 获取该步骤对应的所有代码
      const stepCorrespondingCode = await getStepCorrespondingCode(
        stepId,
        allMappings,
        codeChunks,
        extra.ideMessenger,
      );

      if (!stepCorrespondingCode || stepCorrespondingCode.trim().length === 0) {
        console.warn(`步骤 ${stepId} 没有对应的代码，无法进行映射`);
        return;
      }

      // 将代码按行分割
      const codeLines = stepCorrespondingCode.split("\n");
      const knowledgeCardTitles = knowledgeCardsWithoutMapping.map(
        (card) => card.title,
      );

      // 构建prompt并调用LLM
      const prompt = constructMapKnowledgeCardsToCodePrompt(
        codeLines,
        knowledgeCardTitles,
      );

      console.log("🤖 调用LLM进行知识卡片代码映射...");
      const defaultModel =
        selectJsonGenerationModel(state) || selectSelectedChatModel(state);
      if (!defaultModel) {
        throw new Error("No default model available");
      }

      const result = await extra.ideMessenger.request("llm/complete", {
        prompt: prompt,
        completionOptions: {},
        title: defaultModel.title,
      });

      if (result.status !== "success") {
        throw new Error(`LLM request failed: ${result.status}`);
      }

      // 解析LLM响应
      let mappingResults;
      try {
        mappingResults = JSON.parse(result.content);
      } catch (parseError) {
        console.error("解析LLM映射响应失败:", parseError);
        throw new Error("Failed to parse LLM mapping response");
      }

      if (
        !mappingResults.knowledge_card_mappings ||
        !Array.isArray(mappingResults.knowledge_card_mappings)
      ) {
        console.warn("LLM返回的映射结果格式不正确");
        return;
      }

      // 获取当前文件信息以计算代码块行号
      let currentFilePath = "";
      let currentFileContents = "";

      try {
        const currentFileResponse = await extra.ideMessenger.request(
          "getCurrentFile",
          undefined,
        );
        if (
          currentFileResponse?.status === "success" &&
          currentFileResponse.content
        ) {
          currentFilePath = currentFileResponse.content.path || "";
          currentFileContents = currentFileResponse.content.contents || "";
        }
      } catch (fileError) {
        console.warn("无法获取当前文件内容，将使用默认范围");
      }

      // 处理每个知识卡片的映射结果
      for (const mappingResult of mappingResults.knowledge_card_mappings) {
        const { title, code_snippets } = mappingResult;

        // 找到对应的知识卡片
        const knowledgeCard = knowledgeCardsWithoutMapping.find(
          (card) => card.title === title,
        );
        if (!knowledgeCard) {
          console.warn(`未找到标题为 "${title}" 的知识卡片`);
          continue;
        }

        // 如果没有对应的代码片段，跳过
        if (!code_snippets || code_snippets.length === 0) {
          console.log(`知识卡片 "${title}" 没有找到对应的代码片段`);
          continue;
        }

        // 为每个代码片段创建代码块并建立映射
        for (const codeSnippet of code_snippets) {
          if (!codeSnippet || codeSnippet.trim().length === 0) {
            continue;
          }

          // 计算代码片段在完整代码中的行号范围
          let codeRange: [number, number];
          if (currentFileContents) {
            codeRange = calculateCodeChunkRange(
              currentFileContents,
              codeSnippet.trim(),
            );
          } else {
            // 如果无法获取当前文件内容，使用默认范围
            const lineIndex = codeLines.findIndex(
              (line) => line.trim() === codeSnippet.trim(),
            );
            if (lineIndex >= 0) {
              codeRange = [lineIndex + 1, lineIndex + 1];
            } else {
              codeRange = [1, 1];
            }
          }

          // 检查是否已存在相同的代码块
          const existingCodeChunk = codeChunks.find(
            (chunk) =>
              chunk.content.trim() === codeSnippet.trim() &&
              chunk.range[0] === codeRange[0] &&
              chunk.range[1] === codeRange[1],
          );

          let codeChunkId: string;
          if (existingCodeChunk) {
            codeChunkId = existingCodeChunk.id;
            console.log(`🔄 使用现有代码块: ${codeChunkId}`);
          } else {
            // 创建新的代码块，使用当前代码块数量+1作为顺序编号
            const currentState = getState();
            const newCodeChunkId = `c-${currentState.codeAwareSession.codeChunks.length + 1}`;
            dispatch(
              createOrGetCodeChunk({
                content: codeSnippet.trim(),
                range: codeRange,
                filePath: currentFilePath,
                id: newCodeChunkId,
              }),
            );
            codeChunkId = newCodeChunkId;
            console.log(
              `✅ 创建新代码块: ${codeChunkId} (${codeRange[0]}-${codeRange[1]}行)`,
            );
          }

          // 查找该知识卡片对应的requirement chunk ID
          // 首先查找是否已有 requirement-step-knowledgeCard 的映射关系
          const existingKnowledgeCardMapping = allMappings.find(
            (mapping) =>
              mapping.stepId === stepId &&
              mapping.knowledgeCardId === knowledgeCard.id &&
              mapping.highLevelStepId &&
              !mapping.codeChunkId,
          );

          let highLevelStepId: string | undefined;
          if (existingKnowledgeCardMapping) {
            highLevelStepId = existingKnowledgeCardMapping.highLevelStepId;
            console.log(
              `📋 从现有知识卡片映射中找到 highLevelStepId: ${highLevelStepId}`,
            );
          } else {
            // 如果没有找到知识卡片映射，尝试从步骤映射中查找
            const existingStepMapping = allMappings.find(
              (mapping) =>
                mapping.stepId === stepId &&
                mapping.highLevelStepId &&
                !mapping.codeChunkId &&
                !mapping.knowledgeCardId,
            );
            if (existingStepMapping) {
              highLevelStepId = existingStepMapping.highLevelStepId;
              console.log(
                `📋 从步骤映射中找到 highLevelStepId: ${highLevelStepId}`,
              );
            }
          }

          // 创建知识卡片到代码块的映射
          const knowledgeCardMapping: CodeAwareMapping = {
            codeChunkId: codeChunkId,
            stepId: stepId,
            knowledgeCardId: knowledgeCard.id,
            highLevelStepId: highLevelStepId,
            isHighlighted: false,
          };

          dispatch(createCodeAwareMapping(knowledgeCardMapping));

          console.log(
            `🔗 创建知识卡片映射: ${knowledgeCard.title} -> ${codeChunkId}`,
            {
              stepId,
              knowledgeCardId: knowledgeCard.id,
              codeChunkId,
              highLevelStepId,
            },
          );
        }
      }

      console.log(`✅ 完成步骤 ${stepId} 的知识卡片代码映射检查`);
    } catch (error) {
      console.error(
        `❌ 检查步骤 ${stepId} 的知识卡片代码映射时发生错误:`,
        error,
      );
      throw error;
    }
  },
);
