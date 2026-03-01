import { useAppDispatch } from "../redux/hooks";
import { clearAllHighlights } from "../redux/slices/codeAwareSlice";
import { useCodeAwareLogger } from "../util/codeAwareWebViewLogger";
import { useWebviewListener } from "./useWebviewListener";

function useSetup() {
  const dispatch = useAppDispatch();

  // ⚠️ 注意：selectCodeChunks 已废弃，不再静态存储 code chunks
  // const codeChunks = useAppSelector(selectCodeChunks);

  // CodeAware logger
  const logger = useCodeAwareLogger();

  // CodeAware: 监听代码选中事件
  useWebviewListener(
    "codeSelectionCleared",
    async (data) => {
      const { filePath } = data;

      console.log("Code Selection Cleared:", {
        filePath,
        // previousSelection: 已废弃，不再静态存储
      });

      // ⚠️ 注意：不再使用静态存储的 code chunks
      // Log finish viewing events for previously highlighted code chunks 的功能已被废弃

      // 清除所有高亮
      dispatch(clearAllHighlights());
    },
    [dispatch, logger], // 已移除：codeChunks
  );

  // CodeAware: 监听代码选择变化事件
  useWebviewListener(
    "codeSelectionChanged",
    async (data) => {
      const { filePath, selectedLines, selectedContent } = data;

      console.log("Code Selection sent to webview:", {
        filePath,
        selectedLines,
        selectedContent: selectedContent.substring(0, 100) + "...", // 只
        // 显示前100个字符
      });

      // 存储符合条件的代码块
      const fullyContainedChunks = []; // 选区完全包含的代码块
      const overlappingChunks = []; // 有重叠的代码块（包括反向包含的情况）

      // ⚠️ 注意：不再静态存储 code chunks，这个功能已被废弃
      // for (const chunk of codeChunks) {
      //   // 如果 CodeChunk 的文件路径不匹配，跳过
      //   if (chunk.filePath !== filePath) {
      //     continue;
      //   }

      //   // 计算重叠的行数
      //   const overlapStart = Math.max(selectedLines[0], chunk.range[0]);
      //   const overlapEnd = Math.min(selectedLines[1], chunk.range[1]);
      //   const overlapLines = overlapEnd - overlapStart + 1;

      //   // 至少有一行重叠
      //   if (overlapLines > 0) {
      //     // 检查选区是否完全包含该代码块
      //     if (
      //       selectedLines[0] <= chunk.range[0] &&
      //       selectedLines[1] >= chunk.range[1]
      //     ) {
      //       fullyContainedChunks.push(chunk);
      //     } else {
      //       // 计算重叠比例（重叠行数占该chunk总行数的比例）
      //       const chunkTotalLines = chunk.range[1] - chunk.range[0] + 1;
      //       const overlapRatio = overlapLines / chunkTotalLines;

      //       overlappingChunks.push({
      //         chunk,
      //         overlapRatio,
      //         overlapLines,
      //       });
      //     }
      //   }
      // }

      // 准备要高亮的事件列表
      const highlightEvents = [];

      // ⚠️ 以下代码已被废弃，因为不再静态存储 code chunks
      // // 1. 添加所有被选区完全包含的代码块
      // fullyContainedChunks.forEach((chunk) => {
      //   highlightEvents.push({
      //     sourceType: "code" as const,
      //     identifier: chunk.id,
      //     additionalInfo: chunk,
      //   });
      // });

      // // 2. 如果没有完全包含的代码块，或者需要补充重叠的代码块
      // if (overlappingChunks.length > 0) {
      //   // 按重叠比例降序排序
      //   overlappingChunks.sort((a, b) => b.overlapRatio - a.overlapRatio);

      //   // 选择重叠比例最大的代码块
      //   const bestOverlappingChunk = overlappingChunks[0];

      //   // 如果没有完全包含的代码块，或者最佳重叠比例足够高（>= 50%），则添加到高亮列表
      //   if (
      //     fullyContainedChunks.length === 0 ||
      //     bestOverlappingChunk.overlapRatio >= 0.5
      //   ) {
      //     highlightEvents.push({
      //       sourceType: "code" as const,
      //       identifier: bestOverlappingChunk.chunk.id,
      //       additionalInfo: bestOverlappingChunk.chunk,
      //     });
      //   }
      // }

      // ⚠️ 以下代码已被废弃，因为不再静态存储 code chunks
      // // 如果有要高亮的代码块，触发高亮更新
      // if (highlightEvents.length > 0) {
      //   dispatch(updateHighlight(highlightEvents));

      //   // Log code chunk highlighting events
      //   for (const event of highlightEvents) {
      //     if (event.sourceType === "code" && event.additionalInfo) {
      //       await logger.addLogEntry("user_view_and_highlight_code_chunk", {
      //         filePath: event.additionalInfo.filePath,
      //         codeChunkRange: event.additionalInfo.range,
      //         codeChunkContent: event.additionalInfo.content
      //           ? event.additionalInfo.content.length > 200
      //             ? event.additionalInfo.content.substring(0, 200) + "..."
      //             : event.additionalInfo.content
      //           : "",
      //         selectedLines,
      //         selectedContent: selectedContent
      //           ? selectedContent.length > 200
      //             ? selectedContent.substring(0, 200) + "..."
      //             : selectedContent
      //           : "",
      //         timestamp: new Date().toISOString(),
      //       });
      //     }
      //   }
      // }

      // 发送调试信息到控制台
      console.log("Code Selection Changed:", {
        filePath,
        selectedLines,
        selectedContent: selectedContent.substring(0, 100) + "...", // 只显示前100个字符
        // ⚠️ 以下字段已被废弃，因为不再静态存储 code chunks
        // fullyContainedCount: fullyContainedChunks.length,
        // overlappingCount: overlappingChunks.length,
        // highlightEventsCount: highlightEvents.length,
        // bestOverlapRatio:
        //   overlappingChunks.length > 0
        //     ? overlappingChunks[0].overlapRatio
        //     : null,
        // CodeChunks: codeChunks, // 已移除：不再静态存储 code chunks
      });
    },
    [dispatch, logger], // 已移除：codeChunks
  );
}

export default useSetup;
