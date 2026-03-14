import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import styled, { css, keyframes } from "styled-components";

interface NavigationButtonsProps {
  onJumpToSemantic: () => void; // 代码 → 语义（步骤）
  onJumpToCode: () => void; // 语义（步骤）→ 代码
  canJumpToSemantic?: boolean; // 是否有选中的代码可以跳转
  canJumpToCode?: boolean; // 是否有高亮的步骤可以跳转
  isLoading?: boolean;
  /** "left" = sidebar 在左侧, "right" = sidebar 在右侧 */
  sidebarPosition?: "left" | "right";
}

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

/**
 * 整条竖直导航条：贴在 webview 靠近编辑器的那一侧边缘，垂直居中。
 * sidebar 在左 → webview 在编辑器右侧 → 导航条贴在 webview 左边缘（靠近编辑器）
 * sidebar 在右 → webview 在编辑器左侧 → 导航条贴在 webview 右边缘（靠近编辑器）
 */
const Strip = styled.div<{ $side: "left" | "right" }>`
  position: absolute !important;
  ${(p) => (p.$side === "left" ? "left: 0;" : "right: 0;")}
  top: 50%;
  transform: translateY(-50%);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
  /* 与 vscode 编辑器边框融合 */
  background: var(
    --vscode-editorGroupHeader-tabsBackground,
    var(--vscode-sideBar-background)
  );
  border: 1px solid
    var(--vscode-editorWidget-border, var(--vscode-sideBar-border, transparent));
  ${(p) =>
    p.$side === "left"
      ? css`
          border-left: none;
          border-radius: 0 6px 6px 0;
        `
      : css`
          border-right: none;
          border-radius: 6px 0 0 6px;
        `}
`;

const NavButton = styled.button<{ $enabled: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 28px;
  border: none;
  background: transparent;
  color: ${(p) =>
    p.$enabled
      ? "var(--vscode-editor-foreground)"
      : "var(--vscode-disabledForeground, #6e7681)"};
  cursor: ${(p) => (p.$enabled ? "pointer" : "default")};
  opacity: ${(p) => (p.$enabled ? 1 : 0.45)};
  transition:
    background 150ms ease,
    opacity 150ms ease;
  border-radius: 4px;

  &:hover {
    background: ${(p) =>
      p.$enabled
        ? "var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1))"
        : "transparent"};
  }
`;

const Spinner = styled.div`
  width: 14px;
  height: 14px;
  border: 2px solid var(--vscode-disabledForeground, #6e7681);
  border-top-color: var(--vscode-editor-foreground);
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

/**
 * 边缘跳转导航条。贴在 webview 靠近编辑器的那一侧，垂直居中。
 *
 * 箭头语义：
 *   指向编辑器方向 = "跳转到代码"
 *   指向 webview 内部 = "跳转到步骤"
 *
 * sidebar 在左时：
 *   编辑器在 webview 左边 → 左箭头 = 跳到代码, 右箭头 = 跳到步骤
 * sidebar 在右时（少见）：
 *   编辑器在 webview 右边 → 右箭头 = 跳到代码, 左箭头 = 跳到步骤
 */
export function NavigationButtons({
  onJumpToSemantic,
  onJumpToCode,
  canJumpToSemantic = false,
  canJumpToCode = false,
  isLoading = false,
  sidebarPosition = "left",
}: NavigationButtonsProps) {
  // sidebar 在左 → 导航条贴 webview 左边缘
  // sidebar 在右 → 导航条贴 webview 右边缘
  const stripSide = sidebarPosition === "left" ? "left" : "right";

  // 箭头方向：指向编辑器 = 跳到代码
  // sidebar 在左 → 编辑器在 webview 左边 → 左箭头指向编辑器
  const editorIsLeft = sidebarPosition === "left";

  const codeEnabled = canJumpToCode && !isLoading;
  const semanticEnabled = canJumpToSemantic && !isLoading;

  // "跳到代码"按钮
  const jumpToCodeButton = (
    <NavButton
      $enabled={codeEnabled}
      onClick={codeEnabled ? onJumpToCode : undefined}
      disabled={!codeEnabled}
      title={codeEnabled ? "跳转到代码" : "请先选中一个步骤"}
    >
      {isLoading ? (
        <Spinner />
      ) : editorIsLeft ? (
        <ArrowLeftIcon style={{ width: 16, height: 16 }} />
      ) : (
        <ArrowRightIcon style={{ width: 16, height: 16 }} />
      )}
    </NavButton>
  );

  // "跳到步骤"按钮
  const jumpToSemanticButton = (
    <NavButton
      $enabled={semanticEnabled}
      onClick={semanticEnabled ? onJumpToSemantic : undefined}
      disabled={!semanticEnabled}
      title={semanticEnabled ? "跳转到步骤" : "请先在编辑器中选中代码"}
    >
      {editorIsLeft ? (
        <ArrowRightIcon style={{ width: 16, height: 16 }} />
      ) : (
        <ArrowLeftIcon style={{ width: 16, height: 16 }} />
      )}
    </NavButton>
  );

  // 上面放"跳到代码"（指向编辑器），下面放"跳到步骤"（指向 webview 内部）
  return (
    <Strip $side={stripSide}>
      {jumpToCodeButton}
      {jumpToSemanticButton}
    </Strip>
  );
}
