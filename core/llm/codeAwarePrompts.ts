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
            "Respond in first person, as if you are the learner gathering your thoughts and writing them down as notes. Use appropriate tone.",
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
            "The steps should be fine-grained. If the title of a step is 'A and B', divide it into two steps 'A' and 'B'. Think of it as being atomic in some sense.",
            "Generate an abstract for each step. The abstract can contain Markdown. The abstract should entail all actions needed in this step.",
            "Each step must correspond to a part of the given description",
            "Respond in the same language as the project description, EXCEPT FOR THE JSON FIELD NAMES, which must be in English.",
            "You must follow this JSON format in your response: {"title": "(title of the project)", "tasks": "(exactly the same task description as given in the input), "learning_goal": "(exactly the same learning goals as given in the input)", "steps": [{"title": "(title of the step)", "abstract": "(description of the step, can contain Markdown)", "tasks_corresponding_chunks": [(a list of exact quotes from the task description)]}]}.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly.",
        ],
        "description": "${userRequirement}"
    }`;
}


export function constructGenerateKnowledgeCardDetailPrompt(
    knowledgeCardTheme: string,
    learningGoal: string,
    codeContext: string,
    taskDescription?: string
): string {
    return `{
        "task": "You are given a task description and possibly a code snippet, as well as the theme of a related knowledge card. Generate the contents of the knowledge card, including detailed explanation of concepts and 1 to 3 test questions.",
        "requirements": [
            "The knowledge card should contain stuff closely related to the theme, task, and code context. Make sure the content is relevant to the specific programming task being worked on.",
            "Do not include content beyond the theme and task at hand. Do not include content from downstream tasks from potential next steps. Keep the content brief and concise.",
            "The questions should be about either high-level concepts introduced in the knowledge card, or details about implementation. You can use actual examples in the questions.",
            "Consider the task context when generating explanations and examples to make them more relevant and practical.",
            "Respond in the same language as the project description. You may use Markdown in the content to make it more readable.",
            "You must follow this JSON format in your response: {\\"title\\": \\"(title of the knowledge card)\\", \\"content\\": \\"(content of the knowledge card. Markdown can be used here)\\", \\"tests\\":[{\\"question_type\\": \\"shortAnswer\\", \\"question\\": {\\"stem\\": \\"(the question itself)\\", \\"standard_answer\\": \\"(the correct answer)\\"}}]}",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "knowledge_card_theme": "${knowledgeCardTheme}",
        "learning_goal": "${learningGoal}",
        "code_context": "${codeContext}",
        "task_description": "${taskDescription || ""}"
    }`;
}


export function constructAnalyzeCompletionStepPrompt(
    prefixCode: string,
    newCode: string,
    steps: Array<{id: string, title: string, abstract: string}>,
    learningGoal: string
): string {
    const stepsText = steps.map((step, index) => `${index + 1}. ID: ${step.id}, Title: ${step.title}, Abstract: ${step.abstract}`).join("\n");
    
    return `{
        "task": "You are given a code snippet and new code that was just generated. You need to analyze which step this new code belongs to from the provided step list, and determine if this step is now complete. Then provide knowledge card themes based on the new code and learning goals.",
        "requirements": [
            "Analyze the new code and determine which step from the step list it belongs to",
            "Determine if the current step is now fully implemented (step_finished: true/false)",
            "The knowledge card themes should contain concepts the user might be interested in or questions they might have, aligned with the learning goals",
            "Respond in the same language as the project description.",
            "You must follow this JSON format in your response: {\\"current_step\\": \\"(step id from the provided list)\\", \\"step_finished\\": (true or false), \\"knowledge_card_themes\\": [\\"(theme 1)\\", \\"(theme 2)\\", ...]}",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly.",
        ],
        "prefix_code": "${prefixCode}",
        "new_code": "${newCode}",
        "steps": "${stepsText}",
        "learning_goal": "${learningGoal}"
    }`;
}


export function constructGenerateCodeFromStepsPrompt(
    existingCode: string,
    orderedSteps: Array<{
        id: string;
        title: string;
        abstract: string;
        knowledge_cards: Array<{
            id: string;
            title: string;
        }>;
    }>
): string {
    const stepsText = orderedSteps.map(step => {
        const knowledgeCardsText = step.knowledge_cards.map(kc => 
            `{"id": "${kc.id}", "title": "${kc.title}"}`
        ).join(", ");
        return `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}", "knowledge_cards": [${knowledgeCardsText}]}`;
    }).join(",\n        ");
    
    return `{
        "task": "You are given existing code and a list of ordered steps to implement. Generate new code that completes exactly what is required by the abstract of each step - no more, no less. Then identify the correspondence between code chunks and each step/knowledge card separately.",
        "requirements": [
            "Generate code that implements exactly what each step's abstract requires",
            "Do not generate excessive code beyond what is needed for the current steps",
            "Do not skip any required functionality mentioned in the abstracts",
            "Include proper comments in the generated code to explain what each part does",
            "For each step, identify which parts of the generated code correspond to that step base on the abstract. Be precise.",
            "For each knowledge card, identify the most relevant and precise code that relates to the knowledge card's theme",
            "If a knowledge card has no corresponding code, leave its code field empty",
            "The changed_code should include both existing code and newly generated code",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"changed_code\\": \\"(complete code with both existing and new parts)\\", \\"steps_corresponding_code\\": [{\\"id\\": \\"step_id\\", \\"code\\": \\"(code for this step)\\"}], \\"knowledge_cards_corresponding_code\\": [{\\"id\\": \\"card_id\\", \\"code\\": \\"(precise code for this knowledge card, or empty string if no correspondence)\\"}]}",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "existing_code": "${existingCode}",
        "ordered_steps": [
        ${stepsText}
        ]
    }`;
}


export function constructGenerateKnowledgeCardThemesPrompt(
    taskDescription: string,
    currentStep: { title: string, abstract: string },
    learningGoal: string
): string {
    return `{
        "task": "You are given a programming task, information about the current step, and learning goals. Generate a list of potential knowledge card themes that would be helpful for the user to understand this step better.",
        "requirements": [
            "Generate 1-3 knowledge card themes that are relevant to the current step",
            "The themes should be focused on concepts, techniques, or common questions that learners might have when working on this step",
            "The themes should align with the learning goals provided. But you can include more general topics in addition to ones directly relevant to the project at hand. You can also add topics that might interest the user.",
            "Each theme should be a concise phrase or question (no more than 10-15 words)",
            "Respond in the same language as the task description",
            "You must follow this JSON format in your response: [\\"(theme 1)\\", \\"(theme 2)\\", \\"(theme 3)\\", ...]",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON array directly."
        ],
        "task_description": "${taskDescription}",
        "current_step": {
            "title": "${currentStep.title}",
            "abstract": "${currentStep.abstract}"
        },
        "learning_goal": "${learningGoal}"
    }`;
}

export function constructGenerateKnowledgeCardThemesFromQueryPrompt(
    queryContext: {
        selectedCode: string;
        selectedText: string;
        query: string;
    },
    currentStep: { title: string, abstract: string },
    currentCode: string,
    existingThemes: string[],
    learningGoal: string,
    task: string
): string {
    return `{
        "task": "You are given a user query in the context of a programming learning session. Based on the query, current step information, current code, existing knowledge card themes, and learning goals, generate new knowledge card themes that address the user's question and complement existing ones.",
        "requirements": [
            "Generate 1-3 new knowledge card themes that directly address the user's query",
            "The themes should complement, not duplicate, the existing themes",
            "Consider why the existing themes might not fully address the user's question. Think about why the user still has questions, and what topic they may need to know or be interested in.",
            "The themes should be relevant to the current step and align with the learning goals",
            "Each theme should be a concise phrase or question (no more than 15 words)",
            "For each theme, identify if there is corresponding code in the current_code that relates to this theme",
            "If corresponding code exists, extract the relevant code chunk; if not, leave it empty",
            "Respond in the same language as the task description",
            "You must follow this JSON format in your response: [{\\"reason\\":\\"(your thoughts on what the user need to know or may be interested in)\\", \\"title\\": \\"(theme title)\\", \\"corresponding_code_chunk\\": \\"(relevant code or empty string)\\"}]",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON array directly."
        ],
        "query_context": {
            "selected_code": "${queryContext.selectedCode}",
            "selected_text": "${queryContext.selectedText}",
            "query": "${queryContext.query}"
        },
        "current_step": {
            "title": "${currentStep.title}",
            "abstract": "${currentStep.abstract}"
        },
        "current_code": "${currentCode}",
        "existing_themes": [${existingThemes.map(theme => `"${theme}"`).join(", ")}],
        "learning_goal": "${learningGoal}",
        "task": "${task}"
    }`;
}

export function constructRerunStepPrompt(
    existingCode: string,
    previousStep: {
        id: string;
        title: string;
        abstract: string;
        knowledge_cards: Array<{
            id: string;
            title: string;
        }>;
    },
    changedStepAbstract: string
): string {
    const knowledgeCardsText = previousStep.knowledge_cards.map(kc => 
        `{"id": "${kc.id}", "title": "${kc.title}"}`
    ).join(", ");
    
    return `{
        "task": "You are given existing code and a step whose abstract has been modified. Analyze the changes and update the code minimally to match the new abstract, then determine the correspondence between the updated code and the step/knowledge cards.",
        "requirements": [
            "Analyze the differences between the previous abstract and the changed abstract. If the abstract is changed substantially, update the title of the step if necessary.",
            "Update the code minimally to match the changed abstract - make only necessary changes. Keep as much of the code unchanged as possible. At the very least, you must keep the code structure recognizable to the user.",
            "For the step, identify which parts of the updated code correspond to this step",
            "For each knowledge card, determine if the abstract change affects its content (needs_update: true/false)",
            "Extract the most relevant code chunks that correspond to each knowledge card",
            "If a knowledge card has no corresponding code, leave its corresponding_code empty",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"analysis\\": \\"(your analysis of the changes in the abstract and the things that need modification)\\", \\"updated_code\\": \\"(complete updated code)\\", \\"step_updates\\": {\\"id\\": \\"${previousStep.id}\\", \\"title\\": \\"(possibly updated title)\\", \\"corresponding_code\\": \\"(code for this step)\\"}, \\"knowledge_cards_updates\\": [{\\"id\\": \\"card_id\\", \\"needs_update\\": true/false, \\"title\\": \\"(possibly updated title)\\", \\"corresponding_code\\": \\"(relevant code or empty string)\\"}]}",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "existing_code": "${existingCode}",
        "previous_step": {
            "id": "${previousStep.id}",
            "title": "${previousStep.title}",
            "abstract": "${previousStep.abstract}",
            "knowledge_cards": [${knowledgeCardsText}]
        },
        "changed_step_abstract": "${changedStepAbstract}"
    }`;
}

// 构建处理代码变更的prompt
export function constructProcessCodeChangesPrompt(
    currentCode: string,
    codeDiff: string,
    relevantSteps: Array<{
        id: string;
        title: string;
        abstract: string;
        knowledge_cards: Array<{
            id: string;
            title: string;
        }>;
    }>
): string {
    const stepsText = relevantSteps.map(step => {
        const knowledgeCardsText = step.knowledge_cards.map(kc => 
            `{"id": "${kc.id}", "title": "${kc.title}"}`
        ).join(", ");
        
        return `{
            "id": "${step.id}",
            "title": "${step.title}",
            "abstract": "${step.abstract}",
            "knowledge_cards": [${knowledgeCardsText}]
        }`;
    }).join(", ");
    
    return `{
        "task": "You are given the current code, a code diff showing changes, and a list of relevant steps that were affected by these code changes. Analyze whether these changes require updates to the step abstracts and knowledge card titles/content.",
        "requirements": [
            "Analyze the code diff to understand what changes were made",
            "For each step, determine if the changes require updating the step's title or abstract (needs_update: true/false)",
            "If a step needs update, provide the updated title and abstract that reflect the code changes",
            "For each knowledge card, determine if its content needs to be regenerated based on the changes (needs_update: true/false)",
            "If a knowledge card needs update, provide an updated title that better reflects the new code",
            "Extract the most relevant code parts that correspond to each updated step and knowledge card",
            "The corresponding_code should include the relevant portions from the current_code (after changes)",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"analysis\\": \\"(your analysis of the changes in the code and the things that need modification)\\", \\"updated_steps\\": [{\\"id\\": \\"step_id\\", \\"needs_update\\": true/false, \\"title\\": \\"(updated or original title)\\", \\"abstract\\": \\"(updated or original abstract)\\", \\"corresponding_code\\": \\"(relevant code from current_code)\\"}], \\"knowledge_cards\\": [{\\"id\\": \\"card_id\\", \\"needs_update\\": true/false, \\"title\\": \\"(updated or original title)\\", \\"corresponding_code\\": \\"(relevant code from current_code)\\"}]}",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "current_code": "${currentCode}",
        "code_diff": "${codeDiff}",
        "relevant_steps": [${stepsText}]
    }`;
}