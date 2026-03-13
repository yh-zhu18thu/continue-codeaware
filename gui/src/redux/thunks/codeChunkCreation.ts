/**
 * DEPRECATED: 此文件已废弃
 *
 * 原因：不再静态存储 code chunks，改为实时从 IDE 读取代码并动态分割
 *
 * 请使用 gui/src/utils/codeChunkUtils.ts 中的工具函数代替
 * 请使用 gui/src/redux/thunks/mappingLookup.ts 中的新接口代替
 *
 * @deprecated
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { CodeChunk } from "core";
import { createOrGetCodeChunk } from "../slices/codeAwareSlice";
import { ThunkApiType } from "../store";

/**
 * 从文件内容创建代码块
 *
 * 策略：简单按行数切分（快速实现版本）
 * - 每个chunk最多包含50行代码
 * - 如果文件<50行，整个文件作为一个chunk
 *
 * TODO: 未来可以升级为AST智能切分
 */
export const createCodeChunksFromFile = createAsyncThunk<
  CodeChunk[],
  {
    filePath: string;
    fileContent: string;
  },
  ThunkApiType
>(
  "codeAware/createCodeChunksFromFile",
  async ({ filePath, fileContent }, { dispatch, getState }) => {
    console.log(`[CA:Chunk] 开始为文件创建代码块: ${filePath}`);
    console.log(`[CA:Chunk] 文件内容长度: ${fileContent.length} 字符`);

    const lines = fileContent.split("\n");
    const totalLines = lines.length;
    console.log(`[CA:Chunk] 文件总行数: ${totalLines}`);

    const chunks: CodeChunk[] = [];
    const CHUNK_SIZE = 50; // 每个chunk的最大行数

    // 策略1: 如果文件很小（<= 50行），整个文件作为一个chunk
    if (totalLines <= CHUNK_SIZE) {
      const chunkId = `c-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}-1`;

      dispatch(
        createOrGetCodeChunk({
          id: chunkId,
          content: fileContent,
          range: [1, totalLines],
          filePath: filePath,
        }),
      );

      const state = getState();
      // const createdChunk = state.codeAwareSession.codeChunks.find(
      // (c) => c.id === chunkId,
      // ); // 已移除：不再静态存储 code chunks

      // if (createdChunk) {
      // chunks.push(createdChunk);
      console.log(
        `[CA:Chunk]  createCodeChunksFromFile 已废弃: 创建单个代码块: ${chunkId} (1-${totalLines}行)`,
      );
      // }

      return chunks;
    }

    // 策略2: 按固定行数切分
    let chunkIndex = 1;
    for (let startLine = 1; startLine <= totalLines; startLine += CHUNK_SIZE) {
      const endLine = Math.min(startLine + CHUNK_SIZE - 1, totalLines);
      const chunkContent = lines.slice(startLine - 1, endLine).join("\n");

      // 生成可预测的chunk ID
      const chunkId = `c-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}-${chunkIndex}`;

      dispatch(
        createOrGetCodeChunk({
          id: chunkId,
          content: chunkContent,
          range: [startLine, endLine],
          filePath: filePath,
        }),
      );

      const state = getState();
      // const createdChunk = state.codeAwareSession.codeChunks.find(
      // (c) => c.id === chunkId,
      // ); // 已移除：不再静态存储 code chunks

      // if (createdChunk) {
      // chunks.push(createdChunk);
      console.log(
        `[CA:Chunk]  createCodeChunksFromFile 已废弃: 创建代码块: ${chunkId} (${startLine}-${endLine}行, ${chunkContent.length}字符)`,
      );
      // }

      chunkIndex++;
    }

    console.log(`[CA:Chunk] 完成代码块创建: 共 ${chunks.length} 个代码块`);
    return chunks;
  },
);

/**
 * 从当前编辑器中的文件创建代码块
 */
export const createCodeChunksFromCurrentFile = createAsyncThunk<
  CodeChunk[],
  void,
  ThunkApiType
>(
  "codeAware/createCodeChunksFromCurrentFile",
  async (_, { dispatch, extra }) => {
    console.log("[CA:Chunk] 正在获取当前文件...");

    try {
      const response = await extra.ideMessenger.request(
        "getCurrentFile",
        undefined,
      );

      // 检查是否是错误响应
      if (!response || response.status === "error") {
        console.warn("[CA:Chunk] 未获取到当前文件或获取失败");
        return [];
      }

      const currentFile = response.content;

      // 确认文件路径存在
      if (!currentFile || !currentFile.path) {
        console.warn("[CA:Chunk] 文件路径为空");
        return [];
      }

      console.log(`[CA:Chunk] 获取到文件: ${currentFile.path}`);

      return await dispatch(
        createCodeChunksFromFile({
          filePath: currentFile.path,
          fileContent: currentFile.contents || "",
        }),
      ).unwrap();
    } catch (error) {
      console.error("[CA:Chunk] 创建代码块失败:", error);
      throw error;
    }
  },
);

/**
 * 高级版本：使用AST智能切分（TODO）
 *
 * 优势：
 * - 按语义单元切分（类、函数、方法）
 * - 保持代码完整性
 * - 更符合用户认知
 *
 * 实现思路：
 * 1. 使用 core/indexing/chunk/chunk.ts 中的 chunkDocumentWithoutId
 * 2. 将返回的 ChunkWithoutID 转换为 CodeChunk
 * 3. 处理ID生成逻辑
 */
export const createCodeChunksFromFileWithAST = createAsyncThunk<
  CodeChunk[],
  {
    filePath: string;
    fileContent: string;
    maxChunkSize?: number; // token数量限制
  },
  ThunkApiType
>(
  "codeAware/createCodeChunksFromFileWithAST",
  async (
    { filePath, fileContent, maxChunkSize = 512 },
    { dispatch, getState },
  ) => {
    console.log(`[CA:Chunk] 使用AST智能切分: ${filePath}`);

    // TODO: 实现AST切分
    // 1. 导入 chunkDocumentWithoutId
    // 2. 遍历生成的chunks
    // 3. 创建CodeChunk对象

    console.warn("[CA:Chunk] AST切分功能尚未实现，降级到简单切分");
    return await dispatch(
      createCodeChunksFromFile({ filePath, fileContent }),
    ).unwrap();
  },
);
