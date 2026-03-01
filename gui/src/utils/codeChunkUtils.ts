/**
 * Code Chunk 分割和管理工具
 *
 * 用于将代码文件动态分割为 chunks，不存储在 Redux state 中，
 * 而是根据需要从 editor 实时读取和分割。
 */

import { CodeChunk } from "core";

/**
 * Code Chunk 分割策略接口
 */
export interface CodeChunkSplitStrategy {
  name: string;
  split: (code: string, filePath: string) => CodeChunk[];
}

/**
 * 策略1: 按空行分割（默认策略）
 *
 * 规则：
 * - 遇到空行（trim 后为空）时结束当前 chunk
 * - 每个 chunk 包含连续的非空行
 * - chunk ID 格式: `${filePath}-chunk-${index}`
 * - 记录起始和结束行号（1-based）
 */
export const splitByBlankLine: CodeChunkSplitStrategy = {
  name: "blank-line",
  split: (code: string, filePath: string): CodeChunk[] => {
    const lines = code.split("\n");
    const chunks: CodeChunk[] = [];
    let currentChunk: string[] = [];
    let startLine = 1;
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim() === "") {
        // 遇到空行，结束当前 chunk
        if (currentChunk.length > 0) {
          chunks.push({
            id: `${filePath}-chunk-${chunkIndex}`,
            content: currentChunk.join("\n"),
            filePath,
            range: [startLine, startLine + currentChunk.length - 1],
            isHighlighted: false,
            disabled: false,
          });
          chunkIndex++;
          currentChunk = [];
        }
        startLine = i + 2; // 下一行开始（1-based）
      } else {
        currentChunk.push(line);
      }
    }

    // 处理最后一个 chunk
    if (currentChunk.length > 0) {
      chunks.push({
        id: `${filePath}-chunk-${chunkIndex}`,
        content: currentChunk.join("\n"),
        filePath,
        range: [startLine, startLine + currentChunk.length - 1],
        isHighlighted: false,
        disabled: false,
      });
    }

    return chunks;
  },
};

/**
 * 策略2: 按固定行数分割（备选策略）
 *
 * 规则：
 * - 每个 chunk 包含固定行数（默认 50 行）
 * - 最后一个 chunk 可能少于指定行数
 * - 不考虑代码语义，纯粹按行数切分
 */
export const splitByLineCount = (
  linesPerChunk: number = 50,
): CodeChunkSplitStrategy => ({
  name: "line-count",
  split: (code: string, filePath: string): CodeChunk[] => {
    const lines = code.split("\n");
    const chunks: CodeChunk[] = [];
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i += linesPerChunk) {
      const chunkLines = lines.slice(i, i + linesPerChunk);
      const startLine = i + 1; // 1-based
      const endLine = startLine + chunkLines.length - 1;

      chunks.push({
        id: `${filePath}-chunk-${chunkIndex}`,
        content: chunkLines.join("\n"),
        filePath,
        range: [startLine, endLine],
        isHighlighted: false,
        disabled: false,
      });
      chunkIndex++;
    }

    return chunks;
  },
});

/**
 * 策略3: 按语义块分割（未来扩展）
 *
 * 可以基于：
 * - AST 节点（函数、类、方法等）
 * - 注释块
 * - 缩进层级
 * - 代码语义相似度
 */
export const splitBySemanticBlock: CodeChunkSplitStrategy = {
  name: "semantic-block",
  split: (code: string, filePath: string): CodeChunk[] => {
    // TODO: 实现基于 AST 或其他语义信息的分割
    // 目前先降级到按空行分割
    console.warn("语义块分割策略尚未实现，降级到按空行分割");
    return splitByBlankLine.split(code, filePath);
  },
};

/**
 * 当前使用的默认策略
 * 可以根据配置动态切换
 */
export let currentStrategy: CodeChunkSplitStrategy = splitByBlankLine;

/**
 * 设置当前使用的分割策略
 * @param strategy 要使用的策略
 */
export function setCurrentStrategy(strategy: CodeChunkSplitStrategy): void {
  currentStrategy = strategy;
  console.log(`✅ 切换 Code Chunk 分割策略为: ${strategy.name}`);
}

/**
 * 根据策略名称获取策略实例
 * @param name 策略名称
 * @returns 策略实例，如果不存在则返回默认策略
 */
export function getStrategyByName(name: string): CodeChunkSplitStrategy {
  const strategies: Record<string, CodeChunkSplitStrategy> = {
    "blank-line": splitByBlankLine,
    "line-count": splitByLineCount(50),
    "semantic-block": splitBySemanticBlock,
  };

  return strategies[name] || splitByBlankLine;
}

/**
 * 从文件内容动态生成 code chunks
 * 这是主要的导出函数，供查找逻辑使用
 *
 * @param fileContent 文件内容
 * @param filePath 文件路径
 * @param strategy 可选的策略名称，默认使用 currentStrategy
 * @returns CodeChunk 数组
 */
export function generateCodeChunks(
  fileContent: string,
  filePath: string,
  strategy?: string,
): CodeChunk[] {
  const strategyToUse = strategy
    ? getStrategyByName(strategy)
    : currentStrategy;

  const chunks = strategyToUse.split(fileContent, filePath);

  console.log(
    `📦 使用策略 [${strategyToUse.name}] 分割文件 ${filePath}，生成 ${chunks.length} 个 chunks`,
  );

  return chunks;
}

/**
 * 验证 code chunk 是否仍然存在于当前代码中
 *
 * @param chunkId 要验证的 chunk ID
 * @param currentChunks 当前从代码中分割出的 chunks
 * @returns 是否仍然存在
 */
export function isChunkStillValid(
  chunkId: string,
  currentChunks: CodeChunk[],
): boolean {
  return currentChunks.some((chunk) => chunk.id === chunkId);
}

/**
 * 通过内容相似度验证 chunk（容忍小修改）
 *
 * @param oldChunk 旧的 chunk
 * @param currentChunks 当前的 chunks
 * @param similarityThreshold 相似度阈值（0-1），默认 0.8
 * @returns 相似的 chunk 或 null
 */
export function findSimilarChunk(
  oldChunk: CodeChunk,
  currentChunks: CodeChunk[],
  similarityThreshold: number = 0.8,
): CodeChunk | null {
  let bestMatch: CodeChunk | null = null;
  let bestSimilarity = 0;

  for (const currentChunk of currentChunks) {
    // 首先检查文件路径是否匹配
    if (currentChunk.filePath !== oldChunk.filePath) {
      continue;
    }

    // 计算内容相似度（简单字符串比对）
    const similarity = calculateStringSimilarity(
      oldChunk.content,
      currentChunk.content,
    );

    if (similarity > bestSimilarity && similarity >= similarityThreshold) {
      bestSimilarity = similarity;
      bestMatch = currentChunk;
    }
  }

  return bestMatch;
}

/**
 * 计算两个字符串的相似度（使用 Levenshtein 距离的简化版本）
 *
 * @param str1 字符串1
 * @param str2 字符串2
 * @returns 相似度（0-1）
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  // 简单实现：基于最长公共子序列
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0 && len2 === 0) return 1;
  if (len1 === 0 || len2 === 0) return 0;

  // 完全相同
  if (str1 === str2) return 1;

  // 简化版本：计算共同字符的比例
  const set1 = new Set(str1.split(""));
  const set2 = new Set(str2.split(""));
  const intersection = new Set([...set1].filter((x) => set2.has(x)));

  const unionSize = set1.size + set2.size - intersection.size;
  return intersection.size / unionSize;
}

/**
 * 根据行号范围查找对应的 code chunk
 *
 * @param filePath 文件路径
 * @param startLine 起始行（1-based）
 * @param endLine 结束行（1-based）
 * @param chunks 当前的 chunks
 * @returns 匹配的 chunk 或 null
 */
export function findChunkByLineRange(
  filePath: string,
  startLine: number,
  endLine: number,
  chunks: CodeChunk[],
): CodeChunk | null {
  for (const chunk of chunks) {
    if (chunk.filePath !== filePath) {
      continue;
    }

    const [chunkStart, chunkEnd] = chunk.range;

    // 检查范围是否重叠
    if (startLine <= chunkEnd && endLine >= chunkStart) {
      return chunk;
    }
  }

  return null;
}

/**
 * 检查一个 chunk 是否包含另一个 chunk（用于层级关系推导）
 *
 * @param parentChunk 父 chunk
 * @param childChunk 子 chunk
 * @returns 是否包含
 */
export function isChunkContained(
  parentChunk: CodeChunk,
  childChunk: CodeChunk,
): boolean {
  if (parentChunk.filePath !== childChunk.filePath) {
    return false;
  }

  const [parentStart, parentEnd] = parentChunk.range;
  const [childStart, childEnd] = childChunk.range;

  return parentStart <= childStart && parentEnd >= childEnd;
}
