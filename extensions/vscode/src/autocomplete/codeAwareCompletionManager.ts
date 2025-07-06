import { CodeAwareContext } from "core";

export class CodeAwareCompletionManager {
  private context: CodeAwareContext = {
    userRequirement: "",
    currentStep: "",
    nextStep: ""
  };
  
  private webviewProtocol: any; // 将在构造函数中设置

  constructor(webviewProtocol?: any) {
    this.webviewProtocol = webviewProtocol;
  }

  public setUserRequirement(requirement: string): void {
    this.context.userRequirement = requirement;
  }

  public setCurrentStep(step: string): void {
    this.context.currentStep = step;
  }

  public setNextStep(step: string): void {
    this.context.nextStep = step;
  }

  public async getContext(): Promise<CodeAwareContext> {
    // 只有在本地context为空时，才尝试从webview获取最新的上下文
    if (this.webviewProtocol && !this.hasContext()) {
      try {
        const response = await this.webviewProtocol.request("getCodeAwareContext", undefined);
        if (response && response.status === "success" && response.content) {
          // 更新本地缓存
          this.context = {
            userRequirement: response.content.userRequirement || "",
            currentStep: response.content.currentStep || "",
            nextStep: response.content.nextStep || ""
          };
        }
      } catch (error) {
        console.warn("Failed to get CodeAware context from webview, using cached context:", error);
      }
    }
    
    return { ...this.context };
  }

  // 保留原有的同步getter用于向后兼容
  public getContextSync(): CodeAwareContext {
    console.warn("getContextSync() is deprecated, use getContext() instead");
    return { ...this.context };
  }

  public hasContext(): boolean {
    return this.context.userRequirement !== "" || 
           this.context.currentStep !== "" || 
           this.context.nextStep !== "";
  }

  public clear(): void {
    this.context = {
      userRequirement: "",
      currentStep: "",
      nextStep: ""
    };
  }
}