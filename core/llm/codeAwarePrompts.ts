//CODEAWARE：所有的prompts和chat messages的组合在这里进行
import { ProgramRequirement, UserCodeAwareContext } from "..";


export function constructParaphraseUserIntentPrompt(
    programRequirement: ProgramRequirement,
    userCodeAwareContext: UserCodeAwareContext
): string {
    const requirementText = programRequirement.requirementDescription;
    const contextText = userCodeAwareContext.contextDescription;
    //CATODO: 填入paraphrase prompts
    return `Paraphrase the following requirement: ${requirementText}. Current User Learning Context: ${contextText}`;
}
