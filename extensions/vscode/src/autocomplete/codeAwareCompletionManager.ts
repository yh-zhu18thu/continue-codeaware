import { CodeAwareContext } from "core";

export class CodeAwareCompletionManager {
  private context: CodeAwareContext = {
    userRequirement: "",
    currentStep: "",
    nextStep: ""
  };

  constructor() {}

  public setUserRequirement(requirement: string): void {
    this.context.userRequirement = requirement;
  }

  public setCurrentStep(step: string): void {
    this.context.currentStep = step;
  }

  public setNextStep(step: string): void {
    this.context.nextStep = step;
  }

  public getContext(): CodeAwareContext {
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