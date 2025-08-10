//CODEAWARE：所有的prompts和chat messages的组合在这里进行
import { ProgramRequirement } from "..";


export function constructParaphraseUserIntentPrompt(
    programRequirement: ProgramRequirement,
): string {
    const requirementText = programRequirement.requirementDescription;
    return `{
        "task": "You are given a brief description of a coding project. Provide a clear implementation plan and learning goals.",
        "requirements": [
            "For the implementation plan: list the basic approach and key steps needed to complete the project. Use simple terms, no code or technical jargon.",
            "For learning goals: identify what the learner will gain from this project. Create goals if none are provided.",
            "Respond in the same language as the project description.",
            "Use first person tone as if taking notes.",
            "Format: First paragraph for implementation plan, second paragraph for learning goals."
        ],
        "description": "${requirementText}"
    }`;
}


export function constructGenerateStepsPrompt(
    userRequirement: string,
): string {
    return `{
        "task": "You are given a description of a coding project (will be written in a single file, all sources and data are ready, necessary packages has been installed). First, provide a high-level breakdown of the project into major tasks, then provide detailed steps for each task.",
        "requirements": [
            "First, identify 4-8 major high-level tasks that represent the overall workflow of the project（in reasonable implementation order）. These should be conceptual phases like 'Setup and Configuration', 'Data Processing', 'User Interface Development', etc.",
            "If the project requires importing packages or involves specific frameworks (such as PyGame, Flask, etc.), include a high-level task at the beginning for 'Project Setup and Dependencies' or similar. This task should cover importing necessary packages and setting up any framework-specific boilerplate code that every project using that framework requires.",
            "Then, for each major task, generate fine-grained steps. The steps should be atomic - if the title of a step is 'A and B', divide it into two steps 'A' and 'B'.",
            "Keep the title brief and readable. You must not put any code in the title.",
            "Generate an abstract for each step that is designed for learners to understand. The abstract can contain Markdown formatting. The abstract should clearly explain all actions the code should implement in this step using beginner-friendly language. Describe the necessary programming concepts for the current step, using analogies and simple terms to make them understandable for learners. End the abstract with the practical outcome that will be achieved when finishing this step (e.g. what feature will be supported, how this creates the foundation for future steps, what phenomenon can be seen). The abstract should be mostly in natural language with minimal code examples, prioritizing clarity and educational value for students.",
            "IMPORTANT: Remember that the high-level tasks and steps must describe the complete workflow to finish the project, while being presented in a clear, learner-friendly manner that helps students understand both what to do and why they're doing it.",
            "Each step must correspond to exactly one of the major tasks",
            "Multiple steps can belong to the same task - this is encouraged to break down complex tasks into manageable pieces",
            "You must follow this JSON format in your response: {"title": "(title of the project)", "high_level_steps": ["(high-level task 1)", "(high-level task 2)", ...], "learning_goal": "(exactly the same learning goals cut out from the input description)", "steps": [{"title": "(title of the step)", "abstract": "(description of the step, can contain Markdown)", "task_corresponding_high_level_task": "(the exact text from high_level_steps array that this step belongs to)"]}]}.",
            "Respond in the same language as the content in \"description\" section, EXCEPT FOR THE JSON FIELD NAMES, which must be in English.",
            "IMPORTANT: Properly escape all special characters in JSON strings. Use \\n for newlines, \\\\ for backslashes, \\\" for quotes, \\t for tabs, etc. Ensure the JSON is valid and parseable.",
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
            "The knowledge card should start with a very brief, concise and to-the-point sentence describing its theme and main points, TLDR style.",
            "The questions should be about either high-level concepts introduced in the knowledge card, or details about implementation. You can use actual examples in the questions.",
            "Consider the task context when generating explanations and examples to make them more relevant and practical.",
            "Respond in the same language as the task_description. You may use Markdown in the content to make it more readable.",
            "You must follow this JSON format in your response: {\\"title\\": \\"(title of the knowledge card)\\", \\"content\\": \\"(content of the knowledge card. Markdown can be used here)\\", \\"tests\\":[{\\"question_type\\": \\"shortAnswer\\", \\"question\\": {\\"stem\\": \\"(the question itself)\\", \\"standard_answer\\": \\"(the correct answer)\\"}}]}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
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
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly.",
        ],
        "prefix_code": "${prefixCode}",
        "new_code": "${newCode}",
        "steps": "${stepsText}",
        "learning_goal": "${learningGoal}"
    }`;
}


// 第一步：专注于代码生成的 prompt
export function constructGenerateCodePrompt(
    existingCode: string,
    newStepsToImplement: Array<{
        id: string;
        title: string;
        abstract: string;
    }>,
    previouslyGeneratedSteps?: Array<{
        id: string;
        title: string;
        abstract: string;
    }>,
    taskDescription?: string
): string {
    const newStepsText = newStepsToImplement.map(step => 
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`
    ).join(",\n        ");
    
    const previousStepsText = previouslyGeneratedSteps ? previouslyGeneratedSteps.map(step => 
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`
    ).join(",\n        ") : "";
    
    return `{
        "task": "You are on the way to implement a project incrementally. You are given existing code and a list of new steps to implement. Your ONLY job is to generate clean, complete code that implements the new steps while maintaining the existing code structure.",
        ${taskDescription ? `,
        "task_description": "${taskDescription}"` : ""},
        "existing_code": "${existingCode}",
        "new_steps_to_implement": [
        ${newStepsText}
        ]${previousStepsText ? `,
        "previously_generated_steps_context": [
        ${previousStepsText}
        ]` : ""}
        "requirements": [
            "STRICT RULE 1: You MUST implement ONLY the steps listed in 'new_steps_to_implement'. Do NOT generate code for future steps or complete the entire project at once.",
            "STRICT RULE 2: Generated code must be clean with concise, clear comments that explain what each part does.",
            "STRICT RULE 3: Preserve the existing code structure as much as possible while adding new functionality for the required steps.",
            "Read each step's abstract carefully and implement exactly what is described - no more, no less.",
            "Include helpful comments in the code to explain the purpose of new additions.",
            "Maintain code consistency and follow good programming practices.",
            "The output should be the complete code file including both existing and newly added code.",
            "Ensure all new functionality is properly integrated with existing code.",
            "Respond in the same language as the step descriptions.",
            "You must follow this JSON format in your response: {\\"complete_code\\": \\"(the complete code with existing code preserved and new steps implemented)\\"}",
            "CRITICAL: Return ONLY a valid JSON object. Do not add any explanatory text before or after the JSON. Do not use code block markers. The response should start with { and end with }.",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid code block characters to envelope the JSON response, just return the JSON object directly."
        ],
    }`;
}

// 第二步：专注于代码映射的 prompt  
export function constructMapCodeToStepsPrompt(
    completeCode: string,
    allSteps: Array<{
        id: string;
        title: string;
        abstract: string;
        knowledge_cards: Array<{
            id: string;
            title: string;
        }>;
    }>
): string {
    const stepsText = allSteps.map(step => {
        const knowledgeCardsText = step.knowledge_cards.map(kc => 
            `{"kc_id": "${kc.id}", "title": "${kc.title}"}`
        ).join(", ");
        return `{"step_id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}", "knowledge_cards": [${knowledgeCardsText}]}`;
    }).join(",\n        ");
    
    return `{
        "task": "You are given complete code and a list of steps with their knowledge cards. Your job is to create precise mappings between code chunks and steps/knowledge cards.",
        "complete_code": "${completeCode}",
        "steps_with_knowledge_cards": [
        ${stepsText}
        ],
        "requirements": [
            "STRICT RULE 1: Code snippets must be identified by line-based ranges. The minimum unit is a line.",
            "STRICT RULE 2: For each step, find ALL code snippets that relate to it, even if they appear in non-consecutive locations. This includes: the main implementation code, function definitions that implement the step's functionality, function calls that invoke the step's functionality, variable declarations and assignments related to the step, and any supporting code that directly contributes to the step's purpose. However, do NOT include code that deals with different themes or unrelated functionality (e.g., if a step is about 'pygame game loop', do not include specific game logic implementations within that loop).",
            "STRICT RULE 3: For knowledge cards within steps, find the most precise and relevant code snippets that relate to the knowledge card's theme.",
            "Analyze the code line by line to identify which parts implement each step's requirements.",
            "For each step, extract all relevant code snippets (can be multiple non-consecutive snippets) that directly contribute to achieving the step's goals.",
            "For knowledge cards, identify the most specific code that relates to the card's educational theme.",
            "If a knowledge card has no corresponding code, leave its code_snippet field empty.",
            "Code snippets should be precise and focused - include lines that directly relate to the step/knowledge card's specific theme, but gather all such relevant lines even if scattered.",
            "Use line numbers or actual code content to clearly identify each snippet.",
            "Respond in the same language as the step descriptions.",
            "You must follow this JSON format in your response: {\\"steps_correspond_code\\": [{\\"id\\": \\"step_id\\", \\"code_snippets\\": [\\"code_snippet_1\\", \\"code_snippet_2\\"], \\"knowledge_cards_correspond_code\\": [{\\"id\\": \\"kc_id\\", \\"code_snippet\\": \\"precise_code_snippet\\"}]}]}",
            "CRITICAL: Return ONLY a valid JSON object. Do not add any explanatory text before or after the JSON. Do not use code block markers. The response should start with { and end with }.",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid code block characters to envelope the JSON response, just return the JSON object directly."
        ],
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
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
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
            "You must follow this JSON format in your response: [{\\"reason\\":\\"(your thoughts on what the user need to know or may be interested in)\\", \\"title\\": \\"(theme title)\\", \\"corresponding_code_snippet\\": \\"(relevant code or empty string)\\"}]",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
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
    changedStepAbstract: string,
    currentStepCodeChunks?: {
        stepCode: string;
        knowledgeCardCodes: Array<{
            id: string;
            title: string;
            code: string;
        }>;
    }
): string {
    const knowledgeCardsText = previousStep.knowledge_cards.map(kc => 
        `{"id": "${kc.id}", "title": "${kc.title}"}`
    ).join(", ");
    
    // 构建当前代码映射信息的文本
    const currentCodeMappingText = currentStepCodeChunks ? `
        "current_code_mappings": {
            "step_code": "${currentStepCodeChunks.stepCode}",
            "knowledge_card_codes": [${currentStepCodeChunks.knowledgeCardCodes.map(kc => 
                `{"id": "${kc.id}", "title": "${kc.title}", "code": "${kc.code}"}`
            ).join(", ")}]
        },` : "";
    
    const currentCodeMappingRequirement = currentStepCodeChunks ? 
        "Use the current_code_mappings as a reference to understand which parts of the code currently correspond to this step and its knowledge cards. This will help you identify the relevant code sections more accurately.," : "";
    
    return `{
        "task": "You are given existing code and a step whose abstract has been modified. You also have information about which code parts currently correspond to this step and its knowledge cards. Analyze the changes and update the code minimally to match the new abstract, then determine the correspondence between the updated code and the step/knowledge cards.",
        "requirements": [
            "Analyze the differences between the previous abstract and the changed abstract. If the abstract is changed substantially, update the title of the step if necessary.",
            "Update the code minimally to match the changed abstract - make only necessary changes. Keep as much of the code unchanged as possible. At the very least, you must keep the code structure recognizable to the user.",
            "${currentCodeMappingRequirement}"
            "For the step, identify which parts of the updated code correspond to this step - try to be precise and avoid including the entire file. Focus on the code sections that directly implement the step's functionality.",
            "For each knowledge card, determine if the abstract change affects its content (needs_update: true/false)",
            "Extract the most relevant and precise code chunks that correspond to each knowledge card - avoid including large irrelevant sections",
            "If a knowledge card has no corresponding code, leave its corresponding_code empty",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"analysis\\": \\"(your analysis of the changes in the abstract and the things that need modification)\\", \\"updated_code\\": \\"(complete updated code)\\", \\"step_updates\\": {\\"id\\": \\"${previousStep.id}\\", \\"title\\": \\"(possibly updated title)\\", \\"corresponding_code\\": \\"(precise code for this step, not the entire file)\\"}, \\"knowledge_cards_updates\\": [{\\"id\\": \\"card_id\\", \\"needs_update\\": true/false, \\"title\\": \\"(possibly updated title)\\", \\"corresponding_code\\": \\"(relevant code or empty string)\\"}]}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "existing_code": "${existingCode}",${currentCodeMappingText}
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
    previousCode: string,
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
        "task": "You are given the previous code, current code after changes, a code diff for reference, and a list of relevant steps that were affected by these code changes. Analyze whether these changes require updates to the step abstracts and knowledge card titles/content, and determine if any steps have become functionally incomplete and need regeneration.",
        "requirements": [
            "Compare the previous_code and current_code to understand what changes were made",
            "The code_diff is provided for reference to help you understand the changes, but focus on comparing the previous and current code directly",
            "For each step, determine if the changes require updating the step's title or abstract (needs_update: true/false)",
            "For each step, analyze if the code changes have made the step's code incomplete or broken, requiring complete regeneration (code_broken: true/false)",
            "A step has code_broken when: the code changes have removed or broken core functionality described in the step's abstract, making the step's implementation incomplete or non-functional",
            "A step only needs_update when: minor adjustments to title/abstract are needed but the core functionality remains intact",
            "If a step needs update, provide the updated title and abstract that reflect the code changes",
            "For each knowledge card, determine if its content needs to be regenerated based on the changes (needs_update: true/false)",
            "If a knowledge card needs update, provide an updated title that better reflects the new code",
            "Extract the most relevant code parts that correspond to each updated step and knowledge card",
            "The corresponding_code should include the relevant portions from the current_code (after changes)",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"analysis\\": \\"(your analysis of the changes in the code and the things that need modification)\\", \\"updated_steps\\": [{\\"id\\": \\"step_id\\", \\"needs_update\\": true/false, \\"code_broken\\": true/false, \\"title\\": \\"(updated or original title)\\", \\"abstract\\": \\"(updated or original abstract)\\", \\"corresponding_code\\": \\"(relevant code from current_code)\\"}], \\"knowledge_cards\\": [{\\"id\\": \\"card_id\\", \\"needs_update\\": true/false, \\"title\\": \\"(updated or original title)\\", \\"corresponding_code\\": \\"(relevant code from current_code)\\"}]}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "previous_code": "${previousCode}",
        "current_code": "${currentCode}",
        "code_diff": "${codeDiff}",
        "relevant_steps": [${stepsText}]
    }`;
}

// 构建评估SAQ答案的prompt
export function constructEvaluateSaqAnswerPrompt(
    question: string,
    standardAnswer: string,
    userAnswer: string
): string {
    return `{
        "task": "You are evaluating a student's short answer response to a programming-related question. Compare the user's answer with the standard answer and determine if it covers all key points correctly.",
        "requirements": [
            "Analyze whether the user's answer demonstrates understanding of the core concepts",
            "Check if the user's answer covers all major points mentioned in the standard answer",
            "Be lenient with minor wording differences - focus on conceptual understanding",
            "Consider alternative correct explanations that might differ from the standard answer",
            "Determine if the answer is completely correct (isCorrect: true) or has gaps/errors (isCorrect: false)",
            "Provide constructive feedback highlighting what was good and what was missing or incorrect",
            "If the answer is incorrect, point out specific gaps in understanding or missing key concepts",
            "If the answer is correct, acknowledge the good understanding but mention any minor areas for improvement",
            "Keep the feedback concise and educational - aim for 1-2 sentences",
            "Respond in the same language as the question",
            "You must follow this JSON format in your response: {\\"isCorrect\\": true/false, \\"remarks\\": \\"(your feedback message)\\"}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
        "question": "${question.replace(/"/g, "\"")}",
        "standard_answer": "${standardAnswer.replace(/"/g, "\"")}",
        "user_answer": "${userAnswer.replace(/"/g, "\"")}"
    }`;
}