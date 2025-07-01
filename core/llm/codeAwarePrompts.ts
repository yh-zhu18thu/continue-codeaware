//CODEAWARE：所有的prompts和chat messages的组合在这里进行
import { ProgramRequirement } from "..";


export function constructParaphraseUserIntentPrompt(
    programRequirement: ProgramRequirement,
): string {
    const requirementText = programRequirement.requirementDescription;
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
    return `{
        "task": "You are given a description of a coding project. Provide a detailed list of steps based on the project description.",
        "requirements": [
            "The steps should be fine-grained. If the title of a step is 'A and B', divide it into two steps 'A' and 'B'.",
            "Generate an abstract for each step. The abstract can contain Markdown.",
            "Each step must correspond to a part of the given description",
            "Respond in the same language as the project description, EXCEPT FOR THE JSON FIELD NAMES, which must be in English.",
            "You must follow this JSON format in your response: {"title": "(title of the project)", "tasks": "(exactly the same task description as given in the input), "learning_goal": "(exactly the same learning goals as given in the input)", "steps": [{"title": "(title of the step)", "abstract": "(abstract of the step, can contain Markdown)", "tasks_corresponding_chunks": [(a list of exact quotes from the task description)]}]}.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly.",
        ],
        "description": "${userRequirement}"
    }`;
}


export function constructGenerateKnowledgeCardDetailPrompt(
    knowledgeCardTheme: string,
    learningGoal: string,
    codeContext: string
): string {
    return `{
        "task": "You are given a code snippet, as well as the theme of a related knowledge card. Generate the contents of the knowledge card, including detailed explanation of concepts and 1 to 3 test questions.",
        "requirements": [
            "The knowledge card should contain stuff related to the learning goal given in the input. Do not include content beyond the learning goal.",
            "The questions should be about either high-level concepts introduced in the knowledge card, or details about implementation. You can use actual examples in the questions.",
            "Respond in the same language as the project description.",
            "You must follow this JSON format in your response: {\\"title\\": \\"(title of the knowledge card)\\", \\"content\\": \\"(content of the knowledge card. Markdown can be used here)\\", \\"tests\\":[{\\"question_type\\": \\"shortAnswer\\", \\"question\\": {\\"stem\\": \\"(the question itself)\\", \\"standard_answer\\": \\"(the correct answer)\\"}}]}",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "knowledge_card_theme": "${knowledgeCardTheme}",
        "learning_goal": "${learningGoal}",
        "code_context": "${codeContext}"
    }`;
}