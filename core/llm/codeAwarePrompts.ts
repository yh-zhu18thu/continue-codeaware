//CODEAWARE：所有的prompts和chat messages的组合在这里进行
import { ProgramRequirement } from "..";


export function constructParaphraseUserIntentPrompt(
    programRequirement: ProgramRequirement,
): string {
    const requirementText = programRequirement.requirementDescription;
    //CATODO: 填入paraphrase prompts
    return `Paraphrase the following requirement: ${requirementText}.`;
}

export function constructGenerateStepsPrompt(
    userRequirement: string,
): string {
    //CATODO: 填入generate steps prompts
    return `Generate a list of steps based on the following requirement: ${userRequirement}.`;
}