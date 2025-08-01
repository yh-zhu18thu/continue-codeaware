import {
    Paper,
    Step,
    StepIcon,
    StepLabel,
    Stepper,
    Typography
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { HighlightEvent } from "core";
import { useEffect, useRef, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import {
    defaultBorderRadius,
    vscForeground
} from "../../../../components";
import { useAppSelector } from "../../../../redux/hooks";
import { selectRequirementHighlightChunks, selectRequirementText } from "../../../../redux/slices/codeAwareSlice";
// import RequirementDisplayToolBar from "./RequirementDisplayToolbar"; // 移除工具栏导入

// Flickering animation for highlight state changes
const flicker = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

// Custom step icon component with flickering animation
const AnimatedStepIcon = styled(StepIcon)<{ isFlickering: boolean; isHighlighted: boolean }>`
  ${props => props.isFlickering && css`
    animation: ${flicker} 0.6s ease-in-out 3;
  `}
  
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
  
  &:hover {
    transform: scale(1.05);
  }
`;

// Highlighted step content styling - removed as we only need labels now

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
    MuiStepLabel: {
      styleOverrides: {
        root: {
          padding: '2px 0', // Further reduce padding
        },
        label: {
          color: '#ffffff', // White text
          fontSize: '16px', // Larger font size
          lineHeight: '1.3',
          '&.Mui-active': {
            color: '#ffffff',
          },
          '&.Mui-completed': {
            color: '#ffffff',
          },
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
    MuiStepConnector: {
      styleOverrides: {
        root: {
          marginLeft: '10px', // 保持图标中心对齐
          flex: '1 1 auto',
        },
        line: {
          borderColor: '#888888', // Brighter and clearer line color
          borderWidth: '2px', // Thicker line
          minHeight: '15px', // 缩短连接线长度，让步骤更紧凑
          borderLeftWidth: '2px', // 确保左边框宽度
          marginTop: '-2px', // 向上调整，接触上方图标
          marginBottom: '-2px', // 向下调整，接触下方图标
        },
      },
    },
    MuiStep: {
      styleOverrides: {
        root: {
          paddingBottom: '0px', // 移除底部内边距，让连接线更紧密
          paddingTop: '0px', // 移除顶部内边距
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

interface RequirementDisplayProps {
    onEdit: () => void;
    // onRegenerate: () => void; // 移除重新生成功能
    onChunkFocus?: (highlight: HighlightEvent) => void;
    onClearHighlight?: () => void;
    disabled?: boolean; // Optional disabled state
}

export default function RequirementDisplay({
    onEdit,
    // onRegenerate, // 移除重新生成功能
    onChunkFocus,
    onClearHighlight,
    disabled = false,
}: RequirementDisplayProps) {
    const requirementText = useAppSelector(selectRequirementText);
    const highlightChunks = useAppSelector(selectRequirementHighlightChunks);

    // Track previous highlight states for flickering animation using useRef to avoid circular dependency
    const previousHighlightStatesRef = useRef<Map<string, boolean>>(new Map());
    const [flickeringChunks, setFlickeringChunks] = useState<Set<string>>(new Set());
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Monitor highlight state changes and trigger flickering
    useEffect(() => {
        console.log("Highlight chunks updated:", highlightChunks);

        const newFlickering = new Set<string>();
        
        // Check each chunk for state changes - only flicker items that become highlighted
        highlightChunks.forEach(chunk => {
            const previousState = previousHighlightStatesRef.current.get(chunk.id);
            // Only add to flickering if the chunk becomes highlighted (false -> true)
            if (previousState === false && chunk.isHighlighted === true) {
                console.log(`Chunk ${chunk.id} became highlighted: ${previousState} -> ${chunk.isHighlighted}`);
                newFlickering.add(chunk.id);
            }
        });

        // Only update flickering state if there are actually new flickering chunks
        if (newFlickering.size > 0) {
            console.log("Setting flickering chunks:", Array.from(newFlickering));
            setFlickeringChunks(prev => {
                // Merge with existing flickering chunks to avoid conflicts
                const merged = new Set([...prev, ...newFlickering]);
                return merged;
            });
            
            // Clear flickering after animation completes
            setTimeout(() => {
                setFlickeringChunks(prev => {
                    const updated = new Set(prev);
                    newFlickering.forEach(id => updated.delete(id));
                    return updated;
                });
            }, 1800); // 3 cycles of 0.6s animation
        }

        // Update previous states after processing
        const newPreviousStates = new Map(previousHighlightStatesRef.current);
        highlightChunks.forEach(chunk => {
            newPreviousStates.set(chunk.id, chunk.isHighlighted);
        });
        previousHighlightStatesRef.current = newPreviousStates;
    }, [highlightChunks]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (blurTimeoutRef.current) {
                clearTimeout(blurTimeoutRef.current);
            }
        };
    }, []);

    const handleChunkClick = (chunkId: string) => {
        if (onChunkFocus) {
            // construct a HighlightEvent
            const highlightEvent: HighlightEvent = {
                sourceType: "requirement",
                identifier: chunkId,
            }
            onChunkFocus(highlightEvent);
        }
    };

    const handleChunkKeyDown = (event: React.KeyboardEvent, chunkId: string) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleChunkClick(chunkId);
        }
    };

    const handleChunkBlur = () => {
        // Clear any existing timeout
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current);
        }
        
        // Set a delay before clearing highlights to avoid immediate clearing
        // when focus moves between related elements
        blurTimeoutRef.current = setTimeout(() => {
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

    // Create steps from highlight chunks or fallback to requirement text sections
    const createSteps = () => {
        if (!highlightChunks.length) {
            // If no highlight chunks, split requirement text by lines or sentences
            const sentences = requirementText.split(/[.!?]+/).filter(s => s.trim().length > 0);
            return sentences.map((sentence, index) => ({
                id: `sentence-${index}`,
                content: sentence.trim(),
                isHighlighted: false,
                label: sentence.trim(), // Use sentence content as label
            }));
        }

        // Sort chunks by their position in the text and create steps
        const sortedChunks = [...highlightChunks].sort((a, b) => {
            const indexA = requirementText.indexOf(a.content);
            const indexB = requirementText.indexOf(b.content);
            return indexA - indexB;
        });

        return sortedChunks.map((chunk, index) => ({
            id: chunk.id,
            content: chunk.content,
            isHighlighted: chunk.isHighlighted,
            label: chunk.content, // Use chunk content as label
        }));
    };

    const steps = createSteps();

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
                    <ThemeProvider theme={muiTheme}>
                        <Paper 
                            elevation={0} 
                            sx={{ 
                                backgroundColor: 'transparent',
                                padding: 0
                            }}
                        >
                            <Stepper orientation="vertical" sx={{ width: '100%' }}>
                                {steps.map((step, index) => {
                                    const isFlickering = flickeringChunks.has(step.id);
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
                                                        onKeyDown={(e: React.KeyboardEvent) => handleChunkKeyDown(e, step.id)}
                                                        tabIndex={0}
                                                        role="button"
                                                        aria-label={`需求步骤 ${index + 1}: ${step.content}`}
                                                    />
                                                )}
                                                onClick={() => handleStepClick(step.id)}
                                                onBlur={handleChunkBlur}
                                                onFocus={handleChunkFocus}
                                                sx={{ 
                                                    cursor: 'pointer',
                                                    '&:hover': {
                                                        // Remove background color on hover
                                                    }
                                                }}
                                            >
                                                <Typography 
                                                    variant="body2" 
                                                    component="span"
                                                    sx={{
                                                        color: isHighlighted ? '#00BFFF' : '#ffffff', // Brighter highlight color
                                                        fontWeight: isHighlighted ? 'bold' : 'normal',
                                                        fontSize: '16px', // Larger font size
                                                        lineHeight: '1.3',
                                                        display: 'block',
                                                        maxWidth: '500px',
                                                        wordBreak: 'break-word',
                                                    }}
                                                >
                                                    {step.label}
                                                </Typography>
                                            </StepLabel>
                                        </Step>
                                    );
                                })}
                            </Stepper>
                        </Paper>
                    </ThemeProvider>
                    
                    {/* 移除 RequirementDisplayToolBar */}
                </ContentDisplayDiv>
            </DisplayContainerDiv>
        </div>
    );
}