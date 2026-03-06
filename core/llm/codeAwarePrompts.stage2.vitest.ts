import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  constructExtractKnowledgePointsPrompt,
  constructGenerateStepsPrompt,
  constructMapCodeChunksToStepsPrompt,
  constructSplitCodeIntoChunksPrompt,
} from "./codeAwarePrompts.js";

describe("Stage2 Prompt Functions", () => {
  it("should generate all stage2 prompts and export for playground", () => {
    const testCode = `
def calculate_sum(a, b):
    return a + b

def main():
    result = calculate_sum(3, 5)
    print(result)
`;

    const testSteps = [
      {
        id: "s-1",
        title: "定义求和函数",
        abstract: "创建一个函数用于计算两个数的和",
      },
      {
        id: "s-2",
        title: "测试求和函数",
        abstract: "在主函数中调用并测试求和功能",
      },
    ];

    const promptGenerateSteps = constructGenerateStepsPrompt(
      "实现一个命令行 Todo 应用，支持新增、删除、列表展示和本地 JSON 持久化",
    );

    const promptSplitChunks = constructSplitCodeIntoChunksPrompt(
      testCode,
      1,
      testSteps,
    );

    const testChunks = [
      {
        id: "c-1",
        description: "定义求和函数",
        codePreview: "def calculate_sum(a, b):\n    return a + b",
      },
      {
        id: "c-2",
        description: "主函数",
        codePreview: "def main():\n    result = calculate_sum(3, 5)",
      },
    ];

    const promptMapChunks = constructMapCodeChunksToStepsPrompt(
      testChunks,
      testSteps,
    );

    const promptExtractKnowledge = constructExtractKnowledgePointsPrompt(
      testSteps[0],
      "def calculate_sum(a, b):\n    return a + b",
    );

    console.log("=== 测试优化后的步骤分解 Prompt ===");
    console.log("长度:", promptGenerateSteps.length, "字符");

    console.log("\n=== 测试代码块分割 Prompt ===");
    console.log("长度:", promptSplitChunks.length, "字符");

    console.log("\n=== 测试代码块映射 Prompt ===");
    console.log("长度:", promptMapChunks.length, "字符");

    console.log("\n=== 测试知识点提取 Prompt ===");
    console.log("长度:", promptExtractKnowledge.length, "字符");

    expect(promptGenerateSteps.length).toBeGreaterThan(500);
    expect(promptSplitChunks.length).toBeGreaterThan(500);
    expect(promptMapChunks.length).toBeGreaterThan(500);
    expect(promptExtractKnowledge.length).toBeGreaterThan(500);

    const exportContent = [
      "# Stage 2 Prompt Exports",
      "",
      `Exported at: ${new Date().toISOString()}`,
      "",
      "## 1) constructGenerateStepsPrompt（优化后）",
      "",
      "```text",
      promptGenerateSteps,
      "```",
      "",
      "## 2) constructSplitCodeIntoChunksPrompt",
      "",
      "```text",
      promptSplitChunks,
      "```",
      "",
      "## 3) constructMapCodeChunksToStepsPrompt",
      "",
      "```text",
      promptMapChunks,
      "```",
      "",
      "## 4) constructExtractKnowledgePointsPrompt",
      "",
      "```text",
      promptExtractKnowledge,
      "```",
      "",
    ].join("\n");

    const outputPath = path.resolve(
      process.cwd(),
      "llm/stage2-prompts-playground.md",
    );

    fs.writeFileSync(outputPath, exportContent, "utf-8");

    console.log("\n✅ 所有 Prompt 函数测试通过");
    console.log(`✅ Prompt 已导出到: ${outputPath}`);
  });
});
