import { GenerationContext } from "core";

export class CodeAwareCompletionManager {
  private context: GenerationContext = {
    userRequirement: "",
    currentStep: "",
    nextStep: "",
    stepFinished: false
  };
  
  private webviewProtocol: any; // 将在构造函数中设置

  constructor(webviewProtocol: any) {
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

  public setStepFinished(finished: boolean): void {
    this.context.stepFinished = finished;
  }

  public async getContext(): Promise<GenerationContext> {
    // 只有在本地context为空时，才尝试从webview获取最新的上下文
    if (this.webviewProtocol && !this.hasContext()) {
      try {
        console.log("CodeAware: Fetching context from webview...");
        const response = await this.webviewProtocol.request("getCodeAwareContext", undefined);
        console.log("CodeAware: Received context from webview:", response);
        if (response) {
          // 更新本地缓存
          this.context = {
            userRequirement: response.userRequirement || "",
            currentStep: response.currentStep || "",
            nextStep: response.nextStep || "",
            stepFinished: response.stepFinished || false
          };
        }
      } catch (error) {
        console.warn("Failed to get CodeAware context from webview, using cached context:", error);
      }
    }else {
      console.log("CodeAware: Using cached context");
    }
    
    return { ...this.context };
  }

  public hasContext(): boolean {
    return this.context.userRequirement !== "" || 
           this.context.currentStep !== "" || 
           this.context.nextStep !== "" ||
           this.context.stepFinished !== false;
  }

  public clear(): void {
    this.context = {
      userRequirement: "",
      currentStep: "",
      nextStep: "",
      stepFinished: false
    };
  }
}