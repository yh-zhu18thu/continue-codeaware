import {
  StepIcon,
  Typography
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { HighlightEvent } from "core";
import { useCallback, useEffect, useRef } from "react";
import styled, { css, keyframes } from "styled-components";
import {
  defaultBorderRadius
} from "../../../../components";
import { useAppSelector } from "../../../../redux/hooks";
import { selectHighLevelSteps } from "../../../../redux/slices/codeAwareSlice";
import { useCodeAwareLogger } from "../../../../util/codeAwareWebViewLogger";

// Flickering animation for highlight state changes
const flicker = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

// Custom step icon component with flickering animation
const AnimatedStepIcon = styled(StepIcon)<{ isHighlighted: boolean }>`
  // 高亮状态样式
  ${props => props.isHighlighted ? `
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
  ` : `
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
  flex-shrink: 0;
  
  &:hover {
    transform: scale(1.05);
  }
`;

// Custom theme for Material UI components to match VS Code colors
const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00BFFF', // Brighter blue
    },
    background: {
      default: '#1e1e1e',
      paper: '#2d2d30',
    },
    text: {
      primary: '#cccccc',
      secondary: '#969696',
    },
  },
  components: {
    MuiStepIcon: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          '&.Mui-active': {
            color: '#00BFFF',
          },
          '&.Mui-completed': {
            color: '#00BFFF',
          },
        },
        text: {
          fill: '#ffffff',
          fontWeight: 'bold',
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          color: '#ffffff', // White text
        },
      },
    },
  },
});

const SummaryContainer = styled.div`
  position: sticky;
  top: 0; /* 紧贴前一个 sticky 元素 (PageHeader) */
  z-index: 90;
  background-color: rgba(45, 45, 48, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  overflow-x: auto;
  overflow-y: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  
  /* 隐藏滚动条但保持滚动功能 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* Internet Explorer 10+ */
  
  &::-webkit-scrollbar {
    display: none; /* Safari and Chrome */
  }
`;

const SummaryItem = styled.div<{ isHighlighted: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: ${defaultBorderRadius};
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
  white-space: nowrap;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  ${props => props.isHighlighted && css`
    background-color: rgba(0, 191, 255, 0.2);
    border: 1px solid rgba(0, 191, 255, 0.5);
    transform: scale(1.02); /* 轻微放大高亮项 */
    box-shadow: 0 2px 8px rgba(0, 191, 255, 0.3); /* 添加蓝色阴影 */
  `}
`;

const SummaryText = styled(Typography)<{ isHighlighted: boolean }>`
  font-size: 14px !important;
  line-height: 1.2 !important;
  max-width: 180px; /* 减小最大宽度以容纳更多项目 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${props => props.isHighlighted ? '#00BFFF' : '#ffffff'} !important;
  font-weight: ${props => props.isHighlighted ? 'bold' : 'normal'} !important;
`;

interface RequirementSummaryProps {
  onChunkFocus?: (highlight: HighlightEvent) => void;
  onClearHighlight?: () => void;
}

export default function RequirementSummary({
  onChunkFocus,
  onClearHighlight,
}: RequirementSummaryProps) {
  const highLevelSteps = useAppSelector(selectHighLevelSteps);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightedItemRef = useRef<HTMLDivElement>(null);
  
  // CodeAware logger
  const logger = useCodeAwareLogger();

  const handleChunkClick = useCallback(async (chunkId: string) => {
    // Find the chunk to get its content for logging
  const highLevelStep = highLevelSteps.find(step => step.id === chunkId);
    
    // Log high level step viewing start  
    await logger.addLogEntry("user_view_and_highlight_high_level_step", {
      stepId: chunkId,
      stepContent: (highLevelStep?.content || "").substring(0, 200), // First 200 chars for analysis
      isFromHighLevelSteps: true,
      isFromHighlightChunks: false,
      sourceComponent: "RequirementSummary",
      timestamp: new Date().toISOString()
    });
    
    if (onChunkFocus) {
      const highlightEvent: HighlightEvent = {
        sourceType: "highLevelStep",
        identifier: chunkId,
      };
      onChunkFocus(highlightEvent);
    }
  }, [onChunkFocus, logger, highLevelSteps]);

  const handleChunkKeyDown = useCallback((event: React.KeyboardEvent, chunkId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleChunkClick(chunkId);
    }
  }, [handleChunkClick]);

  // Create steps from highlight chunks
  const createSteps = useCallback(() => {
    if (!highLevelSteps.length) {
      return [];
    }

    // Sort chunks by their position in the text and create steps
    const sortedChunks = [...highLevelSteps].sort((a, b) => {
      // 简单按 ID 排序，或者可以根据内容位置排序
      return a.id.localeCompare(b.id);
    });

    return sortedChunks.map((chunk, index) => ({
      id: chunk.id,
      content: chunk.content,
      isHighlighted: chunk.isHighlighted,
      index: index + 1,
    }));
  }, [highLevelSteps]);

  const steps = createSteps();

  // 自动滚动到高亮的步骤
  useEffect(() => {
    const highlightedStep = steps.find(step => step.isHighlighted);
    
    if (highlightedStep && highlightedItemRef.current && containerRef.current) {
      // 使用 setTimeout 来防抖，避免频繁滚动
      const scrollTimeout = setTimeout(() => {
        const container = containerRef.current;
        const highlightedElement = highlightedItemRef.current;
        
        if (!container || !highlightedElement) return;
        
        // 获取容器和高亮元素的位置信息
        const containerRect = container.getBoundingClientRect();
        const elementRect = highlightedElement.getBoundingClientRect();
        
        // 计算相对于容器的位置
        const elementLeftInContainer = elementRect.left - containerRect.left + container.scrollLeft;
        const elementRightInContainer = elementLeftInContainer + elementRect.width;
        
        // 检查元素是否在可见区域内
        const containerWidth = containerRect.width;
        const scrollLeft = container.scrollLeft;
        const scrollRight = scrollLeft + containerWidth;
        
        let newScrollLeft = scrollLeft;
        
        // 如果元素在左侧超出视野，滚动到元素左边缘
        if (elementLeftInContainer < scrollLeft) {
          newScrollLeft = elementLeftInContainer - 20; // 留一些边距
        }
        // 如果元素在右侧超出视野，滚动使元素右边缘可见
        else if (elementRightInContainer > scrollRight) {
          newScrollLeft = elementRightInContainer - containerWidth + 20; // 留一些边距
        }
        
        // 只有在需要滚动时才执行
        if (newScrollLeft !== scrollLeft) {
          container.scrollTo({
            left: Math.max(0, newScrollLeft), // 确保不会滚动到负值
            behavior: 'smooth'
          });
        }
      }, 100); // 100ms 防抖延迟
      
      return () => clearTimeout(scrollTimeout);
    }
  }, [steps]); // 依赖 steps，当步骤的高亮状态变化时触发

  // 如果没有任何步骤，则不显示缩略模式
  if (steps.length === 0) {
    return null;
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <SummaryContainer ref={containerRef}>
        {steps.map((step) => (
          <SummaryItem
            key={step.id}
            ref={step.isHighlighted ? highlightedItemRef : undefined}
            isHighlighted={step.isHighlighted}
            onClick={() => handleChunkClick(step.id)}
            onKeyDown={(e) => handleChunkKeyDown(e, step.id)}
            tabIndex={0}
            role="button"
            aria-label={`任务 ${step.index}: ${step.content}`}
          >
            <AnimatedStepIcon
              icon={step.index}
              isHighlighted={step.isHighlighted}
            />
            <SummaryText isHighlighted={step.isHighlighted}>
              {step.content}
            </SummaryText>
          </SummaryItem>
        ))}
      </SummaryContainer>
    </ThemeProvider>
  );
}
