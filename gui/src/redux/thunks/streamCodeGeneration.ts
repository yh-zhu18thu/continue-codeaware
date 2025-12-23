import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import {
  ContextItemWithId,
  DefaultContextProvider,
  LLMFullCompletionOptions,
  MessageContent,
  MessagePart,
} from "core";
import { modelSupportsNativeTools } from "core/llm/toolSupport";
import { addSystemMessageToolsToSystemMessage } from "core/tools/systemMessageTools/buildToolsSystemMessage";
import { interceptSystemToolCalls } from "core/tools/systemMessageTools/interceptSystemToolCalls";
import { SystemMessageToolCodeblocksFramework } from "core/tools/systemMessageTools/toolCodeblocks";
import { stripImages } from "core/util/messageContent";
import { selectActiveTools } from "../selectors/selectActiveTools";
import {
  selectApplyStateByToolCallId,
  selectCurrentToolCalls,
  selectDoneApplyStates,
  selectPendingToolCalls,
} from "../selectors/selectToolCalls";
import {
  appendCodeGenerationDebugLog,
  clearCodeGenerationDebugLogs,
  setCodeGenerationMessage,
  setCodeGenerationProgress,
  setCodeGenerationStatus,
} from "../slices/codeAwareSlice";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  setActive,
  setInactive,
  setToolGenerated,
  streamUpdate,
  submitEditorAndInitAtIndex,
  updateHistoryItemAtIndex,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { constructMessages } from "../util/constructMessages";
import { callToolById } from "./callToolById";
import { evaluateToolPolicies } from "./evaluateToolPolicies";
import { preprocessToolCalls } from "./preprocessToolCallArgs";
import { streamResponseAfterToolCall } from "./streamResponseAfterToolCall";

/**
 * Constructs the prompt for CodeAware code generation
 */
function constructCodeAwareGenerationPrompt(
  orderedSteps: Array<{ id: string; title: string; abstract: string }>,
  previouslyGeneratedSteps:
    | Array<{ id: string; title: string; abstract: string }>
    | undefined,
  taskDescription: string,
  isLastStep: boolean,
): string {
  const stepsText = orderedSteps
    .map(
      (s, i) => `
${i + 1}. **${s.title}**
   ${s.abstract}`,
    )
    .join("\n");

  const previousStepsText = previouslyGeneratedSteps?.length
    ? `
**Previously Implemented Steps** (already done, do not repeat):
${previouslyGeneratedSteps.map((s, i) => `${i + 1}. ${s.title}`).join("\n")}
`
    : "";

  return `You are a code generation assistant. Your task is to implement the following programming steps by editing the current file.

**Task Description**: 
${taskDescription}

**Steps to Implement** (implement EXACTLY these steps, no more, no less):
${stepsText}
${previousStepsText}

**Important Instructions**:
- Implement ONLY the steps listed above
- ${isLastStep ? "This is the final step - ensure all functionality is complete and working" : "Focus only on the current steps"}
- Use the edit_existing_file or multi_edit tool to make your changes
- Ensure code is correct, idiomatic, and maintains consistency
- Do NOT explain what you're doing, just make the edits

Begin implementing the steps now by editing the file.`;
}

/**
 * Resolves context for CodeAware code generation
 * Similar to resolveEditorContent but simplified for code generation
 */
async function resolveCodeAwareContext({
  prompt,
  ideMessenger,
  defaultContextProviders,
  dispatch,
  getState,
}: {
  prompt: string;
  ideMessenger: any;
  defaultContextProviders: DefaultContextProvider[];
  dispatch: any;
  getState: any;
}): Promise<{
  selectedContextItems: ContextItemWithId[];
  content: MessageContent;
}> {
  // Convert prompt to MessagePart format
  const parts: MessagePart[] = [
    {
      type: "text",
      text: prompt,
    },
  ];

  // Gather context items
  console.log("[CodeAware] Starting context collection for code generation...");
  dispatch(setCodeGenerationStatus("collecting-context"));
  dispatch(setCodeGenerationMessage("正在收集上下文..."));

  const state = getState();
  const isInAgentMode = false; // CodeAware doesn't use agent mode

  let contextItems: ContextItemWithId[] = [];

  // Add default context providers
  for (const provider of defaultContextProviders) {
    const result = await ideMessenger.request("context/getContextItems", {
      name: provider.name,
      query: provider.query ?? "",
      fullInput: stripImages(parts),
      selectedCode: [],
      isInAgentMode,
    });

    if (result.status === "success") {
      contextItems.push(...result.content);
      console.log(
        `[CodeAware] Collected ${result.content.length} items from provider: ${provider.name}`,
      );
    }
  }

  // Deduplicate context items
  const deduplicatedOutputs = contextItems.reduce<ContextItemWithId[]>(
    (acc, item) => {
      if (
        !acc.some(
          (i) =>
            (i.id.providerTitle === item.id.providerTitle &&
              i.id.itemId === item.id.itemId) ||
            (i.uri &&
              item.uri &&
              i.uri.type === item.uri.type &&
              i.uri.value === item.uri.value),
        )
      ) {
        acc.push(item);
      }
      return acc;
    },
    [],
  );

  console.log(
    `[CodeAware] Total context items collected: ${deduplicatedOutputs.length}`,
  );
  deduplicatedOutputs.forEach((item) => {
    console.log(
      `[CodeAware]  - ${item.id.providerTitle}: ${item.description || item.name}`,
    );
  });

  return {
    selectedContextItems: deduplicatedOutputs,
    content: parts,
  };
}

/**
 * Performs the actual code generation using streaming
 * Similar to streamNormalInput but simplified for CodeAware
 */
async function streamCodeAwareGeneration({
  content,
  selectedContextItems,
  dispatch,
  extra,
  getState,
}: {
  content: MessageContent;
  selectedContextItems: ContextItemWithId[];
  dispatch: any;
  extra: any;
  getState: any;
}): Promise<void> {
  const depth = 0;
  const pushDebug = (message: string) => {
    dispatch(appendCodeGenerationDebugLog(message));
  };
  const formatEvent = (value: any): string => {
    try {
      if (!value) return "<empty>";
      // Tool-call delta style
      const fnName = value?.function?.name || value?.name || value?.toolName;
      const args =
        value?.function?.arguments || value?.arguments || value?.delta;
      if (fnName || args) {
        const argsStr = typeof args === "string" ? args : JSON.stringify(args);
        return `tool-delta name=${fnName || "<unknown>"} args=${(argsStr || "").slice(0, 2000)}`;
      }
      // Text/completion delta
      const text =
        value?.delta || value?.completion || value?.content || value?.text;
      if (text) {
        const txt = typeof text === "string" ? text : JSON.stringify(text);
        return `text-delta ${(txt || "").slice(0, 2000)}`;
      }
      // Fallback
      return JSON.stringify(value).slice(0, 1500);
    } catch {
      return "<unserializable event>";
    }
  };
  const logIfToolRelated = (event: any) => {
    if (!event) return;
    const type = (event as any).type ?? "unknown";
    const toolCallId = (event as any).toolCallId || (event as any).id;
    const name =
      (event as any).name || (event as any).toolName || (event as any).function;
    const hasToolType =
      typeof type === "string" && type.toLowerCase().includes("tool");
    if (hasToolType || toolCallId || name) {
      console.log("[CodeAware][Stream] Tool-related event", {
        type,
        toolCallId,
        name,
        keys: Object.keys(event || {}),
      });
    }
  };

  const state = getState();
  const selectedChatModel = selectSelectedChatModel(state);

  if (!selectedChatModel) {
    throw new Error("No chat model selected");
  }

  console.log(
    "[CodeAware] Starting code generation with model:",
    selectedChatModel.title,
  );
  pushDebug(`[model] ${selectedChatModel.title}`);

  // Get active tools
  const activeTools = selectActiveTools(state);
  console.log("[CodeAware] Active tools", {
    count: activeTools.length,
    names: activeTools.map((t) => {
      const toolAny = t as any;
      return (
        toolAny?.function?.name ||
        toolAny?.name ||
        toolAny?.title ||
        "<unknown>"
      );
    }),
  });

  // Determine if we should use native tools or system message tools
  const useNativeTools = state.config.config.experimental
    ?.onlyUseSystemMessageTools
    ? false
    : modelSupportsNativeTools(selectedChatModel);
  console.log("[CodeAware] Tool routing decision", {
    useNativeTools,
    onlyUseSystemMessageTools:
      state.config.config.experimental?.onlyUseSystemMessageTools ?? false,
    systemToolsFrameworkEnabled: !useNativeTools,
  });
  pushDebug(
    `tool-routing useNative=${useNativeTools} systemFramework=${!useNativeTools}`,
  );
  const systemToolsFramework = !useNativeTools
    ? new SystemMessageToolCodeblocksFramework()
    : undefined;

  // Build completion options with tools
  let completionOptions: LLMFullCompletionOptions = {};
  if (useNativeTools && activeTools.length > 0) {
    completionOptions = {
      tools: activeTools,
    };
  }
  console.log("[CodeAware] Completion options", {
    useNativeTools,
    toolCount: activeTools.length,
    hasSystemToolsFramework: !!systemToolsFramework,
  });
  pushDebug(
    `completion-options native=${useNativeTools} tools=${activeTools.length} systemFW=${!!systemToolsFramework}`,
  );

  // Build system message
  const baseSystemMessage = `You are a helpful coding assistant specialized in implementing code changes based on specific requirements.`;
  const systemMessage = systemToolsFramework
    ? addSystemMessageToolsToSystemMessage(
        systemToolsFramework,
        baseSystemMessage,
        activeTools,
      )
    : baseSystemMessage;

  // Construct messages
  const { messages } = constructMessages(
    [
      {
        message: {
          role: "user",
          content,
        },
        contextItems: selectedContextItems,
      },
    ],
    systemMessage,
    state.config.config.rules || [],
    state.ui.ruleSettings,
    systemToolsFramework,
  );

  console.log("[CodeAware] Compiling chat messages...");

  // Compile chat
  const precompiledRes = await extra.ideMessenger.request("llm/compileChat", {
    messages,
    options: completionOptions,
  });

  if (precompiledRes.status === "error") {
    throw new Error(precompiledRes.error);
  }

  const { compiledChatMessages } = precompiledRes.content;

  console.log("[CodeAware] Starting streaming generation...");
  // Mark session streaming active so tool-call reducers behave like chat
  dispatch(setActive());
  dispatch(setCodeGenerationStatus("generating"));
  dispatch(setCodeGenerationMessage("正在生成代码..."));
  dispatch(setCodeGenerationProgress(10));

  // Create a new AbortController for this generation
  const streamAborter = new AbortController();

  try {
    let gen = extra.ideMessenger.llmStreamChat(
      {
        completionOptions,
        title: selectedChatModel.title,
        messages: compiledChatMessages,
        messageOptions: { precompiled: true },
      },
      streamAborter.signal,
    );

    if (systemToolsFramework && activeTools.length > 0) {
      gen = interceptSystemToolCalls(gen, streamAborter, systemToolsFramework);
      console.log("[CodeAware] Using system tool framework for interception");
    }

    let progress = 10;
    let next = await gen.next();

    while (!next.done) {
      logIfToolRelated(next.value);
      pushDebug(`stream-chunk ${formatEvent(next.value)}`);
      // Mirror streamNormalInput: forward stream updates so tool calls are captured and executed
      dispatch(streamUpdate(next.value));
      const toolState = selectCurrentToolCalls(getState());
      if (toolState.length > 0) {
        console.log(
          "[CodeAware][Stream] tool calls in state",
          toolState.map((t) => ({
            id: t.toolCallId,
            name: (t as any).function?.name,
            status: t.status,
            argsLen: (t as any).function?.arguments?.length,
          })),
        );
        pushDebug(
          `tool-state count=${toolState.length} sample=${JSON.stringify(toolState.slice(0, 2).map((t) => ({ id: t.toolCallId, name: (t as any).function?.name, status: t.status })))} `,
        );
      }
      // Update progress (simulate progress, real progress is hard to track)
      progress = Math.min(progress + 2, 95);
      dispatch(setCodeGenerationProgress(progress));

      // Don't dispatch streamUpdate to avoid UI updates
      // Just continue consuming the stream
      next = await gen.next();
    }

    // Log final event for visibility
    logIfToolRelated(next.value);
    pushDebug(`stream-final ${formatEvent(next.value || {})}`);

    // Tool-call execution pipeline (mirrors streamNormalInput) to ensure edits actually run
    const stateAfterStream = getState();
    const originalToolCalls = selectCurrentToolCalls(stateAfterStream);
    const streamAborted = streamAborter.signal.aborted;

    console.log("[CodeAware][Tools] After stream", {
      streamAborted,
      currentToolCalls: originalToolCalls.length,
    });
    pushDebug(
      `after-stream toolCalls=${originalToolCalls.length} aborted=${streamAborted} sample=${JSON.stringify(originalToolCalls.slice(0, 2).map((t) => ({ id: t.toolCallId, name: (t as any).function?.name, status: t.status, argsLen: (t as any).function?.arguments?.length })))} `,
    );

    if (streamAborted) {
      console.log("[CodeAware][Tools] Stream aborted, skip tool execution");
      return;
    }

    const generatingCalls = originalToolCalls.filter(
      (tc) => tc.status === "generating",
    );
    for (const { toolCallId } of generatingCalls) {
      dispatch(
        setToolGenerated({
          toolCallId,
          tools: state.config.config.tools,
        }),
      );
    }

    const stateAfterGenerated = getState();
    if (streamAborter.signal.aborted) return;
    const generatedCalls2 = selectPendingToolCalls(stateAfterGenerated);
    console.log("[CodeAware][Tools] Pending after generation", {
      count: generatedCalls2.length,
    });
    pushDebug(`pending-after-generation=${generatedCalls2.length}`);
    await preprocessToolCalls(dispatch, extra.ideMessenger, generatedCalls2);

    const stateAfterPreprocess = getState();
    if (streamAborter.signal.aborted) return;
    const generatedCalls3 = selectPendingToolCalls(stateAfterPreprocess);
    const toolPolicies = stateAfterPreprocess.ui.toolSettings;
    const policies = await evaluateToolPolicies(
      dispatch,
      extra.ideMessenger,
      activeTools,
      generatedCalls3,
      toolPolicies,
    );
    const anyRequireApproval = policies.find(
      ({ policy }) => policy === "allowedWithPermission",
    );
    pushDebug(
      `policies checked calls=${generatedCalls3.length} requireApproval=${!!anyRequireApproval}`,
    );

    if (originalToolCalls.length === 0 || anyRequireApproval) {
      console.log(
        "[CodeAware][Tools] Setting inactive (no tools or needs approval)",
      );
      dispatch(setInactive());
    } else {
      const stateBeforeExecute = getState();
      const generatedCalls4 = selectPendingToolCalls(stateBeforeExecute);
      if (streamAborter.signal.aborted) return;
      if (generatedCalls4.length > 0) {
        console.log("[CodeAware][Tools] Auto-approving tool calls", {
          count: generatedCalls4.length,
        });
        pushDebug(`execute auto-approved toolCalls=${generatedCalls4.length}`);
        await Promise.all(
          generatedCalls4.map(async ({ toolCallId }) => {
            unwrapResult(
              await dispatch(
                callToolById({
                  toolCallId,
                  isAutoApproved: true,
                  depth: depth + 1,
                }),
              ),
            );
            // After execution, summarize apply state for visibility
            const applyState = selectApplyStateByToolCallId(
              getState(),
              toolCallId,
            );
            if (applyState) {
              pushDebug(
                `apply-status tool=${toolCallId} status=${applyState.status} file=${applyState.filepath || ""} diffs=${applyState.numDiffs ?? 0}`,
              );
            } else {
              pushDebug(`apply-status tool=${toolCallId} <no-apply-state>`);
            }
          }),
        );
        // Summarize done apply states across session
        const doneStates = selectDoneApplyStates(getState());
        if (doneStates.length) {
          pushDebug(
            `apply-done-total=${doneStates.length} sample=${JSON.stringify(
              doneStates.slice(0, 2).map((s) => ({
                file: s.filepath,
                diffs: s.numDiffs,
                status: s.status,
              })),
            ).slice(0, 400)}`,
          );
        }
      } else {
        console.log(
          "[CodeAware][Tools] No pending calls, stream response after tool call",
        );
        pushDebug("execute streamResponseAfterToolCall for original calls");
        for (const { toolCallId } of originalToolCalls) {
          unwrapResult(
            await dispatch(
              streamResponseAfterToolCall({
                toolCallId,
                depth: depth + 1,
              }),
            ),
          );
        }
      }
    }

    console.log("[CodeAware] Code generation completed successfully");
    dispatch(setCodeGenerationProgress(100));
    dispatch(setCodeGenerationMessage("代码生成完成"));
    dispatch(setCodeGenerationStatus("completed"));
    pushDebug("status:completed");
    dispatch(setInactive());
  } catch (e) {
    console.error("[CodeAware] Code generation failed:", e);
    dispatch(setCodeGenerationStatus("error"));
    dispatch(
      setCodeGenerationMessage(e instanceof Error ? e.message : "生成失败"),
    );
    pushDebug(
      `status:error ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`,
    );
    dispatch(setInactive());
    throw e;
  }
}

/**
 * Main thunk for streaming code generation in CodeAware
 */
export const streamCodeGenerationThunk = createAsyncThunk<
  void,
  {
    orderedSteps: Array<{ id: string; title: string; abstract: string }>;
    filepath: string;
    previouslyGeneratedSteps?: Array<{
      id: string;
      title: string;
      abstract: string;
    }>;
    taskDescription: string;
    isLastStep: boolean;
  },
  ThunkApiType
>(
  "codeAware/streamCodeGeneration",
  async (
    {
      orderedSteps,
      filepath,
      previouslyGeneratedSteps,
      taskDescription,
      isLastStep,
    },
    { dispatch, extra, getState },
  ) => {
    console.log("[CodeAware] Starting streamCodeGenerationThunk...");
    console.log("[CodeAware] Steps to generate:", orderedSteps.length);
    console.log("[CodeAware] Filepath:", filepath);
    console.log("[CodeAware] Is last step:", isLastStep);

    try {
      // Reset code generation state
      dispatch(setCodeGenerationStatus("idle"));
      dispatch(setCodeGenerationProgress(0));
      dispatch(setCodeGenerationMessage(""));
      dispatch(clearCodeGenerationDebugLogs());

      // Step 1: Construct the prompt
      const prompt = constructCodeAwareGenerationPrompt(
        orderedSteps,
        previouslyGeneratedSteps,
        taskDescription,
        isLastStep,
      );

      console.log("[CodeAware] Prompt constructed, length:", prompt.length);

      dispatch(
        appendCodeGenerationDebugLog(
          `prompt-length:${prompt.length} steps:${orderedSteps.length} prev:${previouslyGeneratedSteps?.length || 0}`,
        ),
      );

      console.log("[CodeAware] Prompt:", prompt);

      // Initialize a session history item so tool calls can attach like chat
      const inputIndex = getState().session.history.length;
      const editorState = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: prompt.slice(0, 3000) }],
          },
        ],
      } as any;
      dispatch(submitEditorAndInitAtIndex({ index: inputIndex, editorState }));

      // Step 2: Resolve context
      const defaultContextProviders: DefaultContextProvider[] = [
        { name: "currentFile", params: {}, query: "" },
      ];

      const { selectedContextItems, content } = await resolveCodeAwareContext({
        prompt,
        ideMessenger: extra.ideMessenger,
        defaultContextProviders,
        dispatch,
        getState,
      });

      console.log(
        "[CodeAware] Context resolved, items:",
        selectedContextItems.length,
      );

      // Attach the user message + context items to the initialized history item
      dispatch(
        updateHistoryItemAtIndex({
          index: inputIndex,
          updates: {
            message: {
              role: "user",
              content,
              id:
                getState().session.history[inputIndex]?.message?.id ||
                undefined,
            } as any,
            contextItems: selectedContextItems,
          },
        }),
      );

      // Step 3: Stream code generation
      await streamCodeAwareGeneration({
        content,
        selectedContextItems,
        dispatch,
        extra,
        getState,
      });

      console.log(
        "[CodeAware] streamCodeGenerationThunk completed successfully",
      );
    } catch (error) {
      console.error("[CodeAware] streamCodeGenerationThunk failed:", error);
      dispatch(setCodeGenerationStatus("error"));
      dispatch(
        setCodeGenerationMessage(
          error instanceof Error ? error.message : "未知错误",
        ),
      );
      throw error;
    }
  },
);
