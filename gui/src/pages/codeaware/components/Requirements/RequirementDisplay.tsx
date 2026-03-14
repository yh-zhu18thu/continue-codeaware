import { CheckCircle } from "@mui/icons-material";
import { Paper, Step, StepIcon, StepLabel, Stepper } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { HighLevelStepItem, HighlightEvent } from "core";
import { useEffect, useMemo, useRef, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import { defaultBorderRadius, vscForeground } from "../../../../components";
import { useAppDispatch, useAppSelector } from "../../../../redux/hooks";
import {
  clearElementHighlight,
  selectHighLevelStepNarrative,
  selectHighLevelSteps,
  selectRequirementText,
  setHighlightedElement,
} from "../../../../redux/slices/codeAwareSlice";
import { useCodeAwareLogger } from "../../../../util/codeAwareWebViewLogger";
// import RequirementDisplayToolBar from "./RequirementDisplayToolbar"; // 移除工具栏导入

// Flickering animation for highlight state changes
const flicker = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

// Custom step icon component with flickering animation
const AnimatedStepIcon = styled(StepIcon)<{
  isFlickering: boolean;
  isHighlighted: boolean;
}>`
  ${(props) =>
    props.isFlickering &&
    css`
      animation: ${flicker} 0.6s ease-in-out 3;
    `}

  // 高亮状态样式
  ${(props) =>
    props.isHighlighted
      ? `
    &.MuiStepIcon-root {
      color: #00BFFF !important;
      background-color: #00BFFF !important;
      border-radius: 6px !important;
    }
    .MuiStepIcon-root {
      color: #00BFFF !important;
      background-color: #00BFFF !important;
      border-radius: 6px !important;
    }
    .MuiStepIcon-text {
      fill: #ffffff !important;
      font-weight: bold;
    }
    svg {
      color: #00BFFF !important;
      fill: #00BFFF !important;
      border-radius: 6px !important;
    }
    svg circle {
      fill: #00BFFF !important;
      rx: 6 !important;
      ry: 6 !important;
    }
  `
      : `
    &.MuiStepIcon-root {
      color: #888888 !important;
      background-color: #888888 !important;
      border-radius: 6px !important;
    }
    .MuiStepIcon-root {
      color: #888888 !important;
      background-color: #888888 !important;
      border-radius: 6px !important;
    }
    .MuiStepIcon-text {
      fill: #ffffff !important;
    }
    svg {
      color: #888888 !important;
      fill: #888888 !important;
      border-radius: 6px !important;
    }
    svg circle {
      fill: #888888 !important;
      rx: 6 !important;
      ry: 6 !important;
    }
  `}
  
  cursor: pointer;
  transition: all 0.3s ease;
  width: 20px;
  height: 20px;
  border-radius: 6px;

  &:hover {
    transform: scale(1.05);
  }
`;

// Custom animated typography component for step text with flickering animation
const AnimatedStepText = styled.span<{
  isFlickering: boolean;
  isHighlighted: boolean;
}>`
  ${(props) =>
    props.isFlickering &&
    css`
      animation: ${flicker} 0.6s ease-in-out 3;
    `}

  color: ${(props) => (props.isHighlighted ? "#00BFFF" : "#ffffff")} !important;
  font-weight: ${(props) =>
    props.isHighlighted ? "bold" : "normal"} !important;
  font-size: 16px !important;
  line-height: 1.3 !important;
  display: flex !important;
  align-items: center !important;
  max-width: 500px !important;
  word-break: break-word !important;
  transition: all 0.3s ease;
`;

// 完成状态的绿色对钩图标
const CompletionIcon = styled(CheckCircle)`
  color: #4ade80 !important; /* 绿色 */
  margin-left: 8px;
  font-size: 20px !important;
`;

// Highlighted step content styling - removed as we only need labels now

// Custom theme for Material UI components to match VS Code colors
const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#00BFFF", // Brighter blue
    },
    background: {
      default: "#1e1e1e",
      paper: "#2d2d30",
    },
    text: {
      primary: "#cccccc",
      secondary: "#969696",
    },
  },
  components: {
    MuiStepIcon: {
      styleOverrides: {
        root: {
          borderRadius: "6px",
          "&.Mui-active": {
            color: "#00BFFF",
          },
          "&.Mui-completed": {
            color: "#00BFFF",
          },
        },
        text: {
          fill: "#ffffff",
          fontWeight: "bold",
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        root: {
          padding: "2px 0", // Further reduce padding
        },
        label: {
          color: "#ffffff", // White text
          fontSize: "16px", // Larger font size
          lineHeight: "1.3",
          "&.Mui-active": {
            color: "#ffffff",
          },
          "&.Mui-completed": {
            color: "#ffffff",
          },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          color: "#ffffff", // White text
        },
      },
    },
    MuiStepConnector: {
      styleOverrides: {
        root: {
          marginLeft: "10px", // 保持图标中心对齐
          flex: "1 1 auto",
        },
        line: {
          borderColor: "#888888", // Brighter and clearer line color
          borderWidth: "2px", // Thicker line
          minHeight: "15px", // 缩短连接线长度，让步骤更紧凑
          borderLeftWidth: "2px", // 确保左边框宽度
          marginTop: "-2px", // 向上调整，接触上方图标
          marginBottom: "-2px", // 向下调整，接触下方图标
        },
      },
    },
    MuiStep: {
      styleOverrides: {
        root: {
          paddingBottom: "0px", // 移除底部内边距，让连接线更紧密
          paddingTop: "0px", // 移除顶部内边距
        },
      },
    },
  },
});

const DisplayContainerDiv = styled.div<{}>`
  resize: none;
  padding-bottom: 4px;
  font-family: inherit;
  border-radius: ${defaultBorderRadius};
  margin: 12px;
  height: auto;
  background-color: rgba(45, 45, 48, 0.3); // 添加略微深色半透明背景
  color: ${vscForeground};
  border: 1px solid rgba(255, 255, 255, 0.1); // 添加微妙边框

  transition: border-color 0.15s ease-in-out;

  outline: none;
  font-size: 14px;

  display: flex;
  flex-direction: column;
  max-width: 672px; // 相当于 max-w-2xl
  margin-left: auto;
  margin-right: auto;
  margin-top: 1rem;
  // Remove box-shadow
`;

const ContentDisplayDiv = styled.div<{}>`
  max-width: none;
  min-height: 10px;
  border: none; // Remove border
  border-radius: ${defaultBorderRadius};
  padding: 1rem; // 增加内边距
  background-color: rgba(30, 30, 30, 0.2); // 添加更深的半透明背景
  color: ${vscForeground};
  white-space: pre-wrap; // 保留换行符和空格
  line-height: 1.6;
  font-size: 14px;
`;

// ---- Narrative 叙述文段相关类型和工具 ----

type NarrativeSegment =
  | { type: "text"; content: string }
  | { type: "stepRef"; stepId: string; content: string };

/** 解析叙述文段中的 {{r-N:名称}} 标记，返回文本和引用片段的混合数组 */
function parseNarrative(
  narrative: string,
  highLevelSteps: HighLevelStepItem[],
): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];
  const regex = /\{\{(r-\d+):([^}]+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(narrative)) !== null) {
    // 添加标记前的纯文本
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: narrative.slice(lastIndex, match.index),
      });
    }
    const stepId = match[1]; // e.g. "r-1"
    const stepName = match[2]; // e.g. "图像能量分析"
    // 验证 stepId 确实存在于 highLevelSteps 中
    const exists = highLevelSteps.some((s) => s.id === stepId);
    if (exists) {
      segments.push({ type: "stepRef", stepId, content: stepName });
    } else {
      // stepId 不存在，当作普通文本
      segments.push({ type: "text", content: stepName });
    }
    lastIndex = match.index + match[0].length;
  }

  // 添加最后剩余的纯文本
  if (lastIndex < narrative.length) {
    segments.push({ type: "text", content: narrative.slice(lastIndex) });
  }

  return segments;
}

// 叙述文段中可交互的 step 引用样式
const StepRefSpan = styled.span<{
  isHighlighted: boolean;
  isFlickering: boolean;
  isCompleted: boolean;
}>`
  cursor: pointer;
  transition: all 0.3s ease;
  border-radius: 4px;
  padding: 1px 4px;
  margin: 0 1px;

  ${(props) =>
    props.isFlickering &&
    css`
      animation: ${flicker} 0.6s ease-in-out 3;
    `}

  color: ${(props) => (props.isHighlighted ? "#00BFFF" : "#82cfff")} !important;
  font-weight: ${(props) => (props.isHighlighted ? "bold" : "500")} !important;
  background-color: ${(props) =>
    props.isHighlighted ? "rgba(0, 191, 255, 0.15)" : "transparent"};
  text-decoration: ${(props) => (props.isHighlighted ? "none" : "underline")};
  text-decoration-color: rgba(130, 207, 255, 0.4);
  text-underline-offset: 3px;

  &:hover {
    background-color: rgba(0, 191, 255, 0.12);
    color: #00bfff !important;
  }
`;

// 叙述文段容器
const NarrativeText = styled.div`
  font-size: 15px;
  line-height: 1.8;
  color: #d4d4d4;
  word-break: break-word;
`;

interface RequirementDisplayProps {
  onEdit: () => void;
  // onRegenerate: () => void; // 移除重新生成功能
  onChunkFocus?: (highlight: HighlightEvent) => void;
  onClearHighlight?: () => void;
  disabled?: boolean; // Optional disabled state
}

type RenderableStep = {
  id: string;
  content: string;
  isHighlighted: boolean;
  isCompleted: boolean;
  label: string;
  source: "highLevelStep" | "fallback";
};

export default function RequirementDisplay({
  onEdit,
  // onRegenerate, // 移除重新生成功能
  onChunkFocus,
  onClearHighlight,
  disabled = false,
}: RequirementDisplayProps) {
  const requirementText = useAppSelector(selectRequirementText);
  const highLevelSteps = useAppSelector(selectHighLevelSteps);
  const highLevelStepNarrative = useAppSelector(selectHighLevelStepNarrative);

  // CodeAware logger
  const logger = useCodeAwareLogger();
  const dispatch = useAppDispatch();

  // Track previous highlight states for flickering animation using useRef to avoid circular dependency
  const previousHighlightStatesRef = useRef<Map<string, boolean>>(new Map());
  const [flickeringSteps, setFlickeringSteps] = useState<Set<string>>(
    new Set(),
  );
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const steps = useMemo<RenderableStep[]>(() => {
    if (highLevelSteps.length > 0) {
      console.log("📋 Using high level steps as data source");
      return highLevelSteps.map((step) => ({
        id: step.id,
        content: step.content,
        isHighlighted: step.isHighlighted,
        isCompleted: !!step.isCompleted,
        label: step.content,
        source: "highLevelStep" as const,
      }));
    }

    const sentences = requirementText
      .split(/[.!?\\n]+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    console.log("📋 Using requirement text sentences as fallback data source");

    return sentences.map((sentence, index) => ({
      id: `requirement-sentence-${index}`,
      content: sentence,
      isHighlighted: false,
      isCompleted: false,
      label: sentence,
      source: "fallback" as const,
    }));
  }, [highLevelSteps, requirementText]);

  // 解析叙述文段为可渲染的片段（仅当叙述文段存在时）
  const narrativeSegments = useMemo<NarrativeSegment[]>(() => {
    if (!highLevelStepNarrative || highLevelSteps.length === 0) {
      return [];
    }
    return parseNarrative(highLevelStepNarrative, highLevelSteps);
  }, [highLevelStepNarrative, highLevelSteps]);

  // 是否使用叙述文段模式
  const useNarrativeMode = narrativeSegments.length > 0;

  // Monitor highlight state changes and trigger flickering
  useEffect(() => {
    console.log("🔍 RequirementDisplay state updated:");
    console.log(
      "- High level steps:",
      highLevelSteps.map((step) => ({
        id: step.id,
        content: step.content.substring(0, 30) + "...",
        isHighlighted: step.isHighlighted,
      })),
    );
    console.log(
      "- Rendered steps:",
      steps.map((step) => ({
        id: step.id,
        source: step.source,
        isHighlighted: step.isHighlighted,
      })),
    );

    const newFlickering = new Set<string>();
    const highlightedSteps = steps.filter((step) => step.isHighlighted);
    console.log(
      "✨ Highlighted steps:",
      highlightedSteps.map((step) => step.id),
    );

    // Check each step for state changes - only flicker items that become highlighted
    steps.forEach((step) => {
      const previousState = previousHighlightStatesRef.current.get(step.id);
      // Only add to flickering if the step becomes highlighted (false -> true)
      if (previousState === false && step.isHighlighted === true) {
        console.log(`⚡ Step ${step.id} became highlighted, will flicker`);
        newFlickering.add(step.id);
      }
    });

    // Only update flickering state if there are actually new flickering chunks
    if (newFlickering.size > 0) {
      console.log(
        "🎬 Starting flicker animation for:",
        Array.from(newFlickering),
      );
      setFlickeringSteps((prev) => {
        // Merge with existing flickering chunks to avoid conflicts
        const merged = new Set([...prev, ...newFlickering]);
        return merged;
      });

      // Clear flickering after animation completes
      setTimeout(() => {
        setFlickeringSteps((prev) => {
          const updated = new Set(prev);
          newFlickering.forEach((id) => updated.delete(id));
          return updated;
        });

        // After flickering completes, check if any of the steps are 'related' highlights
        // and clear them automatically
        newFlickering.forEach((stepId) => {
          const step = highLevelSteps.find((s) => s.id === stepId);
          if (step && step.highlightType === "related") {
            dispatch(
              clearElementHighlight({ type: "highLevelStep", id: stepId }),
            );
            console.log(
              `🧹 Auto-cleared related highlight for high-level step ${stepId}`,
            );
          }
        });
      }, 1800); // 3 cycles of 0.6s animation
    }

    // Update previous states after processing
    const newPreviousStates = new Map(previousHighlightStatesRef.current);
    steps.forEach((step) => {
      newPreviousStates.set(step.id, step.isHighlighted);
    });
    previousHighlightStatesRef.current = newPreviousStates;
  }, [highLevelSteps, steps, dispatch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const handleChunkClick = async (chunkId: string) => {
    // Find the chunk to get its content for logging
    const step = highLevelSteps.find((s) => s.id === chunkId);
    const renderedStep = steps.find((s) => s.id === chunkId);

    // Log high level step viewing start
    await logger.addLogEntry("user_view_and_highlight_high_level_step", {
      stepId: chunkId,
      stepContent: (step?.content || renderedStep?.content || "").substring(
        0,
        200,
      ), // First 200 chars for analysis
      isFromHighLevelSteps: !!step,
      isFromHighlightChunks: false,
      sourceComponent: "RequirementDisplay",
      timestamp: new Date().toISOString(),
    });

    // 阶段2修改：只高亮 high-level step，不触发代码高亮
    // 保留：滚动到对应的 step（通过闪烁效果自动触发）
    if (step) {
      dispatch(setHighlightedElement({ type: "highLevelStep", id: chunkId }));
    }
  };

  const handleChunkKeyDown = async (
    event: React.KeyboardEvent,
    chunkId: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      await handleChunkClick(chunkId);
    }
  };

  const handleChunkBlur = async () => {
    // Clear any existing timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    // Set a delay before clearing highlights to avoid immediate clearing
    // when focus moves between related elements
    blurTimeoutRef.current = setTimeout(async () => {
      // Log high level step finished viewing event before clearing highlights
      await logger.addLogEntry("user_finished_viewing_high_level_step", {
        sourceComponent: "RequirementDisplay",
        activeHighLevelSteps: highLevelSteps.filter(
          (step) => step.isHighlighted,
        ).length,
        timestamp: new Date().toISOString(),
      });

      if (onClearHighlight) {
        onClearHighlight();
      }
    }, 200); // 200ms delay
  };

  const handleChunkFocus = () => {
    // Clear the blur timeout if chunk gets focus again
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const handleStepClick = (stepId: string) => {
    handleChunkFocus();
    handleChunkClick(stepId);
  };

  const handleStepIconClick = (stepId: string) => {
    handleStepClick(stepId);
  };

  return (
    <div className="px-2.5 pb-1 pt-2">
      <DisplayContainerDiv>
        <ContentDisplayDiv>
          {useNarrativeMode ? (
            /* 叙述文段模式：将 high-level steps 串联成连贯可读的文段 */
            <NarrativeText onBlur={handleChunkBlur} onFocus={handleChunkFocus}>
              {narrativeSegments.map((segment, idx) => {
                if (segment.type === "text") {
                  return <span key={idx}>{segment.content}</span>;
                }
                // stepRef 类型：可交互的 step 引用
                const hlStep = highLevelSteps.find(
                  (s) => s.id === segment.stepId,
                );
                const isHighlighted = hlStep?.isHighlighted ?? false;
                const isCompleted = hlStep?.isCompleted ?? false;
                const isFlickering = flickeringSteps.has(segment.stepId);

                return (
                  <StepRefSpan
                    key={idx}
                    isHighlighted={isHighlighted}
                    isFlickering={isFlickering}
                    isCompleted={isCompleted}
                    onClick={() => handleStepClick(segment.stepId)}
                    onKeyDown={(e) => handleChunkKeyDown(e, segment.stepId)}
                    tabIndex={0}
                    role="button"
                    aria-label={`功能域: ${segment.content}`}
                  >
                    {segment.content}
                    {isCompleted && (
                      <CheckCircle
                        sx={{
                          fontSize: 14,
                          color: "#4ade80",
                          verticalAlign: "middle",
                          marginLeft: "3px",
                        }}
                      />
                    )}
                  </StepRefSpan>
                );
              })}
            </NarrativeText>
          ) : (
            /* Fallback：原有 Stepper 列表模式 */
            <ThemeProvider theme={muiTheme}>
              <Paper
                elevation={0}
                sx={{
                  backgroundColor: "transparent",
                  padding: 0,
                }}
              >
                <Stepper orientation="vertical" sx={{ width: "100%" }}>
                  {steps.map((step, index) => {
                    const isFlickering = flickeringSteps.has(step.id);
                    const isHighlighted = step.isHighlighted;

                    return (
                      <Step key={step.id} active={true} completed={false}>
                        <StepLabel
                          StepIconComponent={(props) => (
                            <AnimatedStepIcon
                              {...props}
                              isFlickering={isFlickering}
                              isHighlighted={isHighlighted}
                              onClick={() => handleStepIconClick(step.id)}
                              onKeyDown={(e: React.KeyboardEvent) =>
                                handleChunkKeyDown(e, step.id)
                              }
                              tabIndex={0}
                              role="button"
                              aria-label={`需求步骤 ${index + 1}: ${step.content}`}
                            />
                          )}
                          onClick={() => handleStepClick(step.id)}
                          onBlur={handleChunkBlur}
                          onFocus={handleChunkFocus}
                          sx={{
                            cursor: "pointer",
                            "&:hover": {
                              // Remove background color on hover
                            },
                          }}
                        >
                          <AnimatedStepText
                            isFlickering={isFlickering}
                            isHighlighted={isHighlighted}
                          >
                            <span style={{ flex: 1 }}>{step.label}</span>
                            {step.isCompleted && <CompletionIcon />}
                          </AnimatedStepText>
                        </StepLabel>
                      </Step>
                    );
                  })}
                </Stepper>
              </Paper>
            </ThemeProvider>
          )}
        </ContentDisplayDiv>
      </DisplayContainerDiv>
    </div>
  );
}
