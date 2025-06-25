//CODEAWARE：所有的prompts和chat messages的组合在这里进行
import { ProgramRequirement } from "..";


export function constructParaphraseUserIntentPrompt(
    programRequirement: ProgramRequirement,
): string {
    const requirementText = programRequirement.requirementDescription;
    //CATODO: 填入paraphrase prompts
    return `{
        "task": "You are given a brief description of a coding project. Expand upon the description and provide a detailed list of steps. After that, generate a list of learning goals for someone doing the project.",
        "requirements": [
            "The list of steps should be described in accessible terms for someone new to the field, and must not contain code or highly professional knowledge.",
            "If there is no learning goal in the brief description, you should come up with your own ones based on the project. Otherwise, follow the learning goals in the brief description and expand upon them.",
            "Respond in the same language as the project description.",
            "Respond in two paragraphs: one for the list of steps, and the other for the list of learning goals."
        ],
        "description": "${requirementText}"
    }`;
}


export function constructGenerateStepsPrompt(
    userRequirement: string,
): string {
    //CATODO: 填入generate steps prompts
    return `Generate a list of steps based on the following requirement: ${userRequirement}.`;
}