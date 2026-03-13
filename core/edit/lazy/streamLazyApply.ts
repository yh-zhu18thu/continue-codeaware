import {
  filterLeadingAndTrailingNewLineInsertion,
  filterLeadingNewline,
  removeTrailingWhitespace,
} from "../../autocomplete/filtering/streamTransforms/lineStream.js";
import { myersDiff } from "../../diff/myers.js";
import { streamDiff } from "../../diff/streamDiff.js";
import { generateLines, LineStream, streamLines } from "../../diff/util.js";
import { DiffLine, ILLM } from "../../index.js";
import { renderChatMessage } from "../../util/messageContent.js";
import { stopAtLinesWithMarkdownSupport } from "../../utils/streamMarkdownUtils.js";

import { lazyApplyPromptForModel, UNCHANGED_CODE } from "./prompts.js";
import { BUFFER_LINES_BELOW, getReplacementWithLlm } from "./replace.js";
/**
 * Detects if LLM output is in JSON format and attempts to extract code.
 * This is a workaround for LLMs that incorrectly return JSON instead of plain code.
 */
function detectAndHandleJsonOutput(output: string): {
  isJson: boolean;
  extractedCode?: string;
} {
  const trimmed = output.trim();

  // Check if it looks like JSON
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { isJson: false };
  }

  try {
    const parsed = JSON.parse(trimmed);
    console.log("[CA:Apply] Detected JSON output from LLM:", {
      keys: Object.keys(parsed),
      hasCodeField: "code" in parsed,
      hasResultField: "result" in parsed,
      hasUpdatedCodeField: "updated_code" in parsed,
      hasContentField: "content" in parsed,
      hasChangesField: "changes" in parsed,
      hasLanguageField: "language" in parsed,
    });

    // Try to extract code from common JSON structures
    if (typeof parsed === "object" && parsed !== null) {
      // List of possible field names that might contain the code
      const codeFieldNames = [
        "code",
        "result",
        "updated_code",
        "updatedCode",
        "content",
        "file_content",
        "fileContent",
        "new_code",
        "newCode",
      ];

      for (const fieldName of codeFieldNames) {
        if (parsed[fieldName] && typeof parsed[fieldName] === "string") {
          console.log(`[CA:Apply] Extracted code from JSON.${fieldName} field`);
          console.log(
            `[CA:Apply] Extracted code length: ${parsed[fieldName].length}`,
          );
          console.log(
            `[CA:Apply] Extracted code preview:`,
            parsed[fieldName].substring(0, 200),
          );
          return { isJson: true, extractedCode: parsed[fieldName] };
        }
      }

      // Special case: if there's only one string field, use that
      const stringFields = Object.entries(parsed)
        .filter(
          ([key, value]) => typeof value === "string" && value.length > 50,
        )
        .map(([key]) => key);

      if (stringFields.length === 1) {
        const fieldName = stringFields[0];
        console.log(
          `[CA:Apply] Found single large string field: ${fieldName}, using as code`,
        );
        return { isJson: true, extractedCode: parsed[fieldName] };
      }
    }

    console.error("[CA:Apply] JSON detected but no code field found:", {
      availableFields: Object.keys(parsed),
      fieldTypes: Object.entries(parsed).map(([k, v]) => `${k}: ${typeof v}`),
    });
    return { isJson: true };
  } catch (e) {
    // Not valid JSON
    return { isJson: false };
  }
}
export async function* streamLazyApply(
  oldCode: string,
  filename: string,
  newCode: string,
  llm: ILLM,
  abortController: AbortController,
): AsyncGenerator<DiffLine> {
  console.log("[CA:Apply] START");
  console.log("[CA:Apply] Input:", {
    filename,
    oldCodeLength: oldCode.length,
    newCodeType: typeof newCode,
    newCodeLength: newCode?.length,
    newCodePreview: newCode?.substring(0, 300),
  });

  const promptFactory = lazyApplyPromptForModel(llm.model, llm.providerName);
  if (!promptFactory) {
    throw new Error(`Lazy apply not supported for model ${llm.model}`);
  }

  const promptMessages = promptFactory(oldCode, filename, newCode);
  console.log("[CA:Apply] Generated prompt for LLM");
  console.log("[CA:Apply] Prompt preview:", {
    userContentPreview: promptMessages[0]?.content
      ?.toString()
      .substring(0, 300),
    assistantContentPreview: promptMessages[1]?.content
      ?.toString()
      .substring(0, 200),
  });
  const lazyCompletion = llm.streamChat(promptMessages, abortController.signal);

  // First, collect the entire LLM output to check for JSON
  console.log("[CA:Apply] Collecting LLM output...");
  let fullOutput = "";
  let messageCount = 0;
  for await (const message of lazyCompletion) {
    messageCount++;
    const rendered = renderChatMessage(message);
    fullOutput += rendered;
    if (messageCount <= 3) {
      console.log(
        `[CA:Apply] Message #${messageCount}:`,
        rendered.substring(0, 200),
      );
    }
  }

  console.log("[CA:Apply] LLM output complete:", {
    totalMessages: messageCount,
    outputLength: fullOutput.length,
    outputPreview: fullOutput.substring(0, 500),
    looksLikeJSON:
      fullOutput.trim().startsWith("{") || fullOutput.trim().startsWith("["),
  });

  // Check for JSON format and extract code if needed
  const jsonCheck = detectAndHandleJsonOutput(fullOutput);

  if (jsonCheck.isJson) {
    console.error("[CA:Apply] JSON format detected in LLM output!");
    console.error(
      "[CA:Apply] This indicates the LLM did not follow instructions.",
    );
    if (jsonCheck.extractedCode) {
      console.warn("[CA:Apply] Successfully extracted code from JSON!");
      console.warn(
        "[CA:Apply] Extracted code length:",
        jsonCheck.extractedCode.length,
      );
      console.warn(
        "[CA:Apply] Extracted code preview:",
        jsonCheck.extractedCode.substring(0, 300),
      );

      // Use Myers diff directly instead of complex stream processing
      // This is more reliable when dealing with extracted JSON
      console.warn("[CA:Apply] Using direct Myers diff for extracted code");
      const diffLines = myersDiff(oldCode, jsonCheck.extractedCode);
      console.warn(
        "[CA:Apply] Myers diff computed successfully:",
        diffLines.length,
        "lines",
      );

      // Return diff as async generator
      return generateLines(diffLines);
    } else {
      console.error("[CA:Apply] Could not extract code from JSON!");
      console.error(
        "[CA:Apply] Last resort: trying direct Myers diff with original newCode",
      );
      console.error(
        "[CA:Apply] This may produce incorrect results if newCode contains lazy text",
      );

      try {
        const diffLines = myersDiff(oldCode, newCode);
        console.warn(
          "[CA:Apply] Fallback Myers diff computed:",
          diffLines.length,
          "lines",
        );
        return generateLines(diffLines);
      } catch (e) {
        console.error("[CA:Apply] Fallback also failed:", e);
        console.error(
          "[CA:Apply] Continuing with broken JSON output (will show incorrect diff)",
        );
      }
    }
  }

  // Convert the output back to a stream for normal processing
  let processedOutput = fullOutput;
  async function* stringToStream(text: string) {
    yield text;
  }

  const capturedCompletion = stringToStream(processedOutput);

  // Do find and replace over the lazy edit response
  async function* replacementFunction(
    oldCode: string,
    linesBefore: string[],
    linesAfter: string[],
  ): AsyncGenerator<string> {
    for await (const line of getReplacementWithLlm(
      oldCode,
      linesBefore,
      linesAfter,
      llm,
      abortController,
    )) {
      yield line;
    }
  }

  let lazyCompletionLines = streamLines(capturedCompletion, true);
  console.log("[CA:Apply] streamLines created");

  lazyCompletionLines = stopAtLinesWithMarkdownSupport(
    lazyCompletionLines,
    filename,
  );
  console.log("[CA:Apply] Applied stopAtLinesWithMarkdownSupport");

  lazyCompletionLines = filterLeadingNewline(lazyCompletionLines);
  lazyCompletionLines = removeTrailingWhitespace(lazyCompletionLines);
  console.log("[CA:Apply] Applied filters");

  // Fill in unchanged code
  console.log("[CA:Apply] Filling in unchanged code");
  let lines = streamFillUnchangedCode(
    lazyCompletionLines,
    oldCode,
    replacementFunction,
  );

  // Convert output to diff
  console.log("[CA:Apply] Converting to diff");
  const oldLines = oldCode.split(/\r?\n/);
  let diffLines = streamDiff(oldLines, lines);
  diffLines = filterLeadingAndTrailingNewLineInsertion(diffLines);

  let diffLineCount = 0;
  for await (const diffLine of diffLines) {
    diffLineCount++;
    if (diffLineCount <= 5) {
      console.log(`[CA:Apply] Diff line #${diffLineCount}:`, {
        type: diffLine.type,
        line: diffLine.line.substring(0, 100),
      });
    }
    yield diffLine;
  }
  console.log("[CA:Apply] END", {
    totalDiffLines: diffLineCount,
  });
}

async function* streamFillUnchangedCode(
  lines: LineStream,
  oldCode: string,
  replacementFunction: (
    oldCode: string,
    linesBefore: string[],
    linesAfter: string[],
  ) => AsyncGenerator<string>,
): LineStream {
  const newLines = [];
  let buffer = [];
  let waitingForBuffer = false;

  for await (const line of lines) {
    if (waitingForBuffer) {
      buffer.push(line);

      if (buffer.length >= BUFFER_LINES_BELOW) {
        // Find the replacement and continue streaming once we have it
        const replacementLines = replacementFunction(oldCode, newLines, buffer);
        let replacement = "";
        for await (const replacementLine of replacementLines) {
          yield replacementLine;
          newLines.push(replacementLine);
          replacement += replacementLine + "\n";
        }
        // Yield the buffered lines
        for (const bufferedLine of buffer) {
          yield bufferedLine;
          newLines.push(bufferedLine);
        }

        waitingForBuffer = false;
        buffer = [];
        continue;
      } else {
        continue;
      }
    }

    if (line.includes(UNCHANGED_CODE)) {
      // Buffer so we can give the context of BUFFER_LINES_BELOW lines below
      waitingForBuffer = true;
      // TODO: If the UNCHANGED CODE is at the very top of the file we need to handle a bit differently
    } else {
      yield line;
      newLines.push(line);
    }
  }

  if (waitingForBuffer) {
    // If we're still waiting for a buffer, we've reached the end of the stream
    // and we should just look for the replacement with what we have
    const replacementLines = replacementFunction(oldCode, newLines, buffer);
    for await (const replacementLine of replacementLines) {
      yield replacementLine;
      newLines.push(replacementLine);
    }
    // Yield the buffered lines
    for (const bufferedLine of buffer) {
      yield bufferedLine;
      newLines.push(bufferedLine);
    }
  }
}
