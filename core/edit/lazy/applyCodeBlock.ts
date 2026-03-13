import { DiffLine, ILLM } from "../..";
import { myersDiff } from "../../diff/myers";
import { generateLines } from "../../diff/util";
import { supportedLanguages } from "../../util/treeSitter";
import { getUriFileExtension } from "../../util/uri";
import { deterministicApplyLazyEdit, isLazyText } from "./deterministic";
import { streamLazyApply } from "./streamLazyApply";
import { applyUnifiedDiff, isUnifiedDiffFormat } from "./unifiedDiffApply";

function canUseInstantApply(filename: string) {
  const fileExtension = getUriFileExtension(filename);
  return supportedLanguages[fileExtension] !== undefined;
}

export async function applyCodeBlock(
  oldFile: string,
  newLazyFile: string,
  filename: string,
  llm: ILLM,
  abortController: AbortController,
): Promise<{
  isInstantApply: boolean;
  diffLinesGenerator: AsyncGenerator<DiffLine>;
}> {
  console.log("[CA:Apply] START");
  console.log("[CA:Apply] Input:", {
    filename,
    oldFileLength: oldFile.length,
    newLazyFileType: typeof newLazyFile,
    newLazyFileLength: newLazyFile?.length,
    newLazyFilePreview: newLazyFile?.substring(0, 300),
    canUseInstant: canUseInstantApply(filename),
  });

  if (canUseInstantApply(filename)) {
    console.log("[CA:Apply] Attempting deterministicApplyLazyEdit");
    const diffLines = await deterministicApplyLazyEdit({
      oldFile,
      newLazyFile,
      filename,
      onlyFullFileRewrite: true,
    });

    if (diffLines !== undefined) {
      console.log(
        "[CA:Apply] deterministicApplyLazyEdit SUCCESS, returning instant apply",
      );
      return {
        isInstantApply: true,
        diffLinesGenerator: generateLines(diffLines!),
      };
    }
    console.log(
      "[CA:Apply] deterministicApplyLazyEdit returned undefined, trying other methods",
    );
  }

  // If the code block is a diff
  console.log("[CA:Apply] Checking if unified diff format:", {
    isUnifiedDiff: isUnifiedDiffFormat(newLazyFile),
  });
  if (isUnifiedDiffFormat(newLazyFile)) {
    console.log("[CA:Apply] Unified diff detected, applying");
    try {
      const diffLines = applyUnifiedDiff(oldFile, newLazyFile);
      console.log("[CA:Apply] Unified diff applied successfully");
      return {
        isInstantApply: true,
        diffLinesGenerator: generateLines(diffLines!),
      };
    } catch (e) {
      console.error("[CA:Apply] Failed to apply unified diff", e);
    }
  }

  // 🚨 SAFETY CHECK: Avoid unstable LLM-based processing
  // Check if newLazyFile contains lazy text placeholders
  const containsLazyText = isLazyText(newLazyFile);
  console.log(
    "[CA:Apply] Safety check - contains lazy text:",
    containsLazyText,
  );

  if (containsLazyText) {
    console.error("[CA:Apply] CRITICAL: Detected lazy text placeholders!");
    console.error(
      "[CA:Apply] This indicates the LLM violated the prompt instruction to provide complete code.",
    );
    console.error(
      "[CA:Apply] Using fallback: Simple Myers diff (may produce incorrect results if placeholders were intended to preserve code).",
    );

    // Use simple Myers diff as a last resort
    // This will likely show the placeholders as actual changes, which is better than
    // invoking another LLM call that might fail or return JSON
    const diffLines = myersDiff(oldFile, newLazyFile);
    return {
      isInstantApply: true,
      diffLinesGenerator: generateLines(diffLines),
    };
  }

  console.log("[CA:Apply] Falling back to streamLazyApply (LLM-based)");
  console.log("[CA:Apply] END");
  return {
    isInstantApply: false,
    diffLinesGenerator: streamLazyApply(
      oldFile,
      filename,
      newLazyFile,
      llm,
      abortController,
    ),
  };
}
