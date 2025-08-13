//CODEAWARE：所有的prompts和chat messages的组合在这里进行
import { ProgramRequirement } from "..";


export function constructParaphraseUserIntentPrompt(
    programRequirement: ProgramRequirement,
): string {
    const requirementText = programRequirement.requirementDescription;
    return `{
        "task": "You are given a brief description of a coding project. Provide a clear implementation plan and learning goals.",
        "requirements": [
            "For the implementation plan: list the basic approach and key steps needed to complete the project. Use simple terms, no code or technical jargon except those users themselves have mentioned.",
            "IMPORTANT: if the user specify any technical or design preferences, please respect the user's preferences and incorporate them into the implementation plan.",
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
            "IMPORTANT: If the project requires importing packages or involves specific frameworks (such as PyGame, Flask, etc.), include a high-level task at the beginning for 'Project Setup' or similar. This task should cover importing necessary packages and setting up any framework-specific boilerplate code (e.g. game loop for pygame) that every project using that framework requires.",
            "Then, for each major task, generate fine-grained steps. The steps should be atomic - if the title of a step is 'A and B', divide it into two steps 'A' and 'B'.",
            "IMPORTANT: For core steps which are too hard to be understood by beginners, you can break them down into multiple steps to make them easier to understand and implement.",
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
        "project_description": "${userRequirement}"
    }`;
}


export function constructGenerateKnowledgeCardDetailPrompt(
    knowledgeCardTheme: string,
    learningGoal: string,
    codeContext: string,
    taskDescription?: string
): string {
    return `{
        "task": "A user is working on a coding project and needs to acquire knowledge about a specific theme to better understand the concepts, implementation and logic. Based on the knowledge theme, project context, related code, and learning objectives, generate a clear but concise educational explanation.",
        "knowledge_theme": "${knowledgeCardTheme}",
        "learning_objectives": "${learningGoal}",
        "related_code": "${codeContext}",
        "project_context": "${taskDescription || ""}",
        "requirements": [
            "The knowledge card should contain content closely related to the knowledge_theme. Make sure the content is relevant to the specific project context being worked on.",
            "IMPORTANT: Do not include content beyond the theme and task at hand. Do not include content from downstream tasks from potential next steps. Keep the content brief and concise.",
            "The knowledge card should start with a very brief, concise and to-the-point sentence describing its theme and main points, TLDR style.",
            "Consider the project_context and related_code when generating explanations to make them more relevant and practical.",
            "IMPORTANT: Focus on providing clear, educational content that helps users understand the most necessary concepts and logics. Use simple terms and analogies if appropriate.",
            "Respond in the same language as the project_context. You may use Markdown in the content to make it more readable.",
            "You must follow this JSON format in your response: {\\"title\\": \\"(title of the knowledge card)\\", \\"content\\": \\"(content of the knowledge card. Markdown can be used here)\\"}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ]
    }`;
}

// 构建生成知识卡片测试题的prompt
export function constructGenerateKnowledgeCardTestsPrompt(
    knowledgeCardTitle: string,
    knowledgeCardContent: string,
    knowledgeCardTheme: string,
    learningGoal: string,
    codeContext: string,
    taskDescription?: string
): string {
    return `{
        "task": "A student has learned about a specific knowledge theme and wants to verify whether they understand the core concepts or logic of this topic. Generate 1 to 3 test questions that can help the student assess their comprehension, incorporating the current task context and code context while aligning with their learning objectives.",
        "knowledge_card_title": "${knowledgeCardTitle}",
        "knowledge_card_content": "${knowledgeCardContent}",
        "knowledge_theme": "${knowledgeCardTheme}",
        "learning_objectives": "${learningGoal}",
        "code_context": "${codeContext}",
        "task_context": "${taskDescription || ""}"
        "requirements": [
            "The questions should test understanding of the core concepts or implementation logic covered in the knowledge card content.",
            "Incorporate actual examples from the code_context and task_context to make the questions more relevant and practical.",
            "Questions should help students verify their comprehension of the specific concepts presented in the knowledge card.",
            "Focus on questions that allow learners to demonstrate and apply their understanding of the material.",
            "Align the questions with the learning_objectives to ensure they support the student's overall learning goals.",
            "Generate between 1 to 3 questions - prioritize quality and relevance over quantity.",
            "Respond in the same language as the task_context.",
            "You must follow this JSON format in your response: {\\"tests\\":[{\\"question_type\\": \\"shortAnswer\\", \\"question\\": {\\"stem\\": \\"(the question itself)\\", \\"standard_answer\\": \\"(the correct answer)\\"}}]}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
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
    taskDescription?: string,
    isLastStep?: boolean
): string {
    const newStepsText = newStepsToImplement.map(step => 
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`
    ).join(",\n        ");
    
    const previousStepsText = previouslyGeneratedSteps ? previouslyGeneratedSteps.map(step => 
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`
    ).join(",\n        ") : "";
    
    const rule1Text = isLastStep 
        ? "You MUST ensure the complete project functionality is implemented. This is the final step, so make sure all features work together to create a fully functional project."
        : "You MUST implement ONLY the steps listed in 'new_steps_to_implement'. Do NOT generate code for future steps or complete the entire project at once.";
    
    return `{
        "task": "You are on the way to implement a project incrementally. You are given existing code and a list of new steps to implement. Your ONLY job is to generate clean, complete code that implements the new steps while maintaining the existing code structure.",
        ${taskDescription ? `,
        "project_description": "${taskDescription}"` : ""},
        "existing_code": "${existingCode}",
        "new_steps_to_implement": [
        ${newStepsText}
        ]${previousStepsText ? `,
        "previously_generated_steps_context": [
        ${previousStepsText}
        ]` : ""}
        "requirements": [
            "STRICT RULE 1: ${rule1Text}",
            "STRICT RULE 2: Generated code must be clean with concise, clear comments that explain what each part does.",
            "STRICT RULE 3: Preserve the existing code structure as much as possible while adding new functionality for the required steps.",
            "STRICT RULE 4: If the project_description contains user-specified file formats, algorithms, packages, or technical preferences, you MUST strictly adhere to these specifications when implementing the code.",
            "STRICT RULE 5: The generated code MUST be syntactically correct and runnable without errors, even if incomplete.",
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

// 第二步：专注于代码映射的 prompt - 将代码块映射到相关步骤（只输出行号范围）
export function constructMapCodeToStepsPrompt(
    completeCode: string,
    allSteps: Array<{
        id: string;
        title: string;
        abstract: string;
    }>
): string {
    const stepsText = allSteps.map(step => 
        `{"step_id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`
    ).join(",\n        ");
    
    // 计算代码总行数
    const totalLines = completeCode.split("\n").length;
    
    return `{
        "task": "You are given complete code and a list of implementation steps. Your job is to analyze the code structure, group consecutive lines that belong to the same semantic unit, and map each semantic code chunk to the relevant steps. You only need to output the line number ranges for each chunk.",
        "complete_code": "${completeCode}",
        "total_lines": ${totalLines},
        "steps": [
        ${stepsText}
        ],
        "requirements": [
            "STRICT RULE 1: Process the code from line 1 to the last line sequentially. Do NOT skip any lines. Every single line must be included in exactly one semantic chunk.",
            "STRICT RULE 2: Group consecutive lines that have the same semantic meaning into chunks. A semantic chunk should be as fine-grained as possible while still being meaningful (e.g., import statements, variable declarations, a single function, a comment block explaining one concept, etc.).",
            "STRICT RULE 3: Each code chunk must consist of consecutive lines only. You cannot combine non-consecutive lines into one chunk.",
            "STRICT RULE 4: Each code chunk must correspond to at least one step. Every step must have at least one code chunk mapped to it.",
            "COVERAGE GOAL: Every line from line 1 to the last line must be assigned to exactly one semantic chunk. No line should be missing or duplicated. All chunks must be seamless (no gaps between chunks).",
            "SEMANTIC ANALYSIS PROCESS:",
            "- Start from line 1 and work your way down sequentially",
            "- Identify where one semantic unit ends and another begins (e.g., end of imports, end of a function, end of a comment block)",
            "- Create fine-grained chunks: separate import statements from function definitions, separate different functions, separate variable declarations, etc.",
            "- Include comment lines with the code they describe, or group them as separate comment chunks if they stand alone",
            "- For each chunk, determine which step(s) this code chunk helps implement based on the step abstracts",
            "- Ensure every step has at least one code chunk mapped to it",
            "CHUNK CREATION RULES:",
            "- Prefer smaller, more focused chunks over large ones",
            "- Each chunk should represent one clear semantic concept",
            "- Chunks must be consecutive lines only - no gaps or skips",
            "- A chunk can be as small as a single line if it represents a distinct semantic unit",
            "- The chunks must cover all lines from 1 to ${totalLines} with no gaps",
            "OUTPUT FORMAT:",
            "- You must follow this JSON format: {\\"code_chunks\\": [{\\"start_line\\": number, \\"end_line\\": number, \\"semantic_description\\": \\"(brief description of what this chunk does)\\", \\"corresponding_steps\\": [\\"step_id_1\\", \\"step_id_2\\", ...]}]}",
            "- start_line and end_line indicate the line number range (inclusive, 1-based indexing)",
            "- semantic_description should briefly explain what this chunk represents (e.g., 'import statements', 'main function definition', 'game loop logic')",
            "- corresponding_steps should include ALL step IDs that this code chunk helps implement",
            "- Every step in the steps array must appear in at least one corresponding_steps array",
            "- Return ONLY a valid JSON object. No explanatory text before or after. No code block markers. Response must start with { and end with }.",
            "- Properly escape all special characters in JSON strings to ensure valid JSON"
        ]
    }`;
}


export function constructGenerateKnowledgeCardThemesPrompt(
    taskDescription: string,
    currentStep: { title: string, abstract: string },
    learningGoal: string,
    currentCode?: string
): string {
    const codeContext = currentCode ? `
        "current_code": "${currentCode}",` : "";
    
    const codeRequirements = currentCode ? [
        "For each theme, identify if there is corresponding code in the current_code that relates to this theme",
        "If corresponding code exists, extract the most precise and relevant code snippets that relate to the knowledge card's theme. Focus on the specific lines that directly demonstrate the concept rather than including large code blocks",
        "A knowledge card can have multiple code snippets if different parts of the code relate to the same theme",
        "If a theme has no corresponding code, leave the corresponding_code_snippets array empty",
        "Code snippets should be precise and focused - include lines that directly relate to the theme's specific educational purpose"
    ] : [
        "Since no code is available for this step yet, focus only on generating relevant themes"
    ];
    
    if (currentCode) {
        return `{
            "task": "You are given a programming task, information about the current step, and learning goals. Generate a list of potential knowledge card themes that would be helpful for the user to understand this step better.",
            "task_description": "${taskDescription}",${codeContext}
            "current_step": {
                "title": "${currentStep.title}",
                "abstract": "${currentStep.abstract}"
            },
            "learning_goal": "${learningGoal}",
            "requirements": [
                "Generate several (typically 3+) knowledge card themes that are relevant to the current step",
                "The themes should cover concepts, techniques, or common questions and issues that learners might have when working on this step",
                "The themes should align with the learning goals provided. But you can include more general topics in addition to ones directly relevant to the project at hand. You can also add topics that might interest the user.",
                "Each theme should be a concise phrase or question (no more than 10-15 words)",
                ${codeRequirements.map(req => `"${req}"`).join(",\n                ")},
                "Respond in the same language as the task_description",
                "You must follow this JSON format in your response: [{\\"theme\\": \\"(theme title)\\", \\"corresponding_code_snippets\\": [\\"(relevant code snippet 1)\\", \\"(relevant code snippet 2)\\", ...]}]",
                "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
                "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON array directly."
            ]
        }`;
    } else {
        return `{
            "task": "You are given a programming task, information about the current step, and learning goals. Generate a list of potential knowledge card themes that would be helpful for the user to understand this step better.",
            "task_description": "${taskDescription}",
            "current_step": {
                "title": "${currentStep.title}",
                "abstract": "${currentStep.abstract}"
            },
            "learning_goal": "${learningGoal}",
            "requirements": [
                "Generate 1-3 knowledge card themes that are relevant to the current step",
                "The themes should cover concepts, techniques, or common questions and issues that learners might have when working on this step",
                "The themes should align with the learning goals provided. But you can include more general topics in addition to ones directly relevant to the project at hand. You can also add topics that might interest the user.",
                "Each theme should be a concise phrase or question (no more than 10-15 words)",
                "Since no code is available for this step yet, focus only on generating relevant themes",
                "Respond in the same language as the task_description",
                "You must follow this JSON format in your response: [\\"(theme 1)\\", \\"(theme 2)\\", \\"(theme 3)\\", ...]",
                "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
                "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON array directly."
            ]
        }`;
    }
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
        "task": "${task}",
        "requirements": [
            "Generate 1-2 new knowledge card themes that directly address the user's query",
            "The themes should complement, not duplicate, the existing themes",
            "Consider why the existing themes might not fully address the user's question. Think about why the user still has questions, and what topic they may need to know or be interested in.",
            "The themes should be relevant to the current step and align with the learning goals",
            "Each theme should be a concise phrase or question (no more than 15 words)",
            "For each theme, identify if there is corresponding code in the current_code that relates to this theme",
            "If corresponding code exists, extract the relevant code chunks; if not, leave the array empty",
            "A knowledge card can have multiple code snippets if different parts of the code relate to the same theme",
            "Respond in the same language as the task description",
            "You must follow this JSON format in your response: [{\\"reason\\":\\"(your thoughts on what the user need to know or may be interested in)\\", \\"title\\": \\"(theme title)\\", \\"corresponding_code_snippets\\": [\\"(relevant code snippet 1)\\", \\"(relevant code snippet 2)\\", ...]}]",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON array directly."
        ],
    }`;
}

export function constructRerunStepPrompt(
    existingCode: string,
    previousStep: {
        id: string;
        title: string;
        abstract: string;
    },
    changedStepAbstract: string,
    currentStepCodeChunks?: {
        stepCode: string;
    }
): string {
    // 构建当前代码映射信息的文本
    const currentCodeMappingText = currentStepCodeChunks ? `
        "current_code_mappings": {
            "step_code": "${currentStepCodeChunks.stepCode}"
        },` : "";
    
    const currentCodeMappingRequirement = currentStepCodeChunks ? 
        "Use the current_code_mappings as a reference to understand which parts of the code currently correspond to this step. This will help you identify the relevant code sections more accurately.," : "";
    
    return `{
        "task": "You are given existing code and a step whose abstract has been modified. You also have information about which code parts currently correspond to this step. Analyze the changes and update the code minimally to match the new abstract, then determine the correspondence between the updated code and the step.",
        "existing_code": "${existingCode}",${currentCodeMappingText}
        "previous_step": {
            "id": "${previousStep.id}",
            "title": "${previousStep.title}",
            "abstract": "${previousStep.abstract}"
        },
        "changed_step_abstract": "${changedStepAbstract}",
        "requirements": [
            "Analyze the differences between the previous abstract and the changed abstract. If the abstract is changed substantially, update the title of the step if necessary.",
            "Update the code minimally to match the changed abstract - make only necessary changes. Keep as much of the code unchanged as possible. At the very least, you must keep the code structure recognizable to the user.",
            "${currentCodeMappingRequirement}"
            "For the step, identify which parts of the updated code correspond to this step - try to be precise and avoid including the entire file. Focus on the code sections that directly implement the step's functionality.",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"analysis\\": \\"(your analysis of the changes in the abstract and the things that need modification)\\", \\"updated_code\\": \\"(complete updated code)\\", \\"step_updates\\": {\\"id\\": \\"${previousStep.id}\\", \\"title\\": \\"(possibly updated title)\\", \\"corresponding_code\\": \\"(precise code for this step, not the entire file)\\"}}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
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
    }>
): string {
    const stepsText = relevantSteps.map(step => 
        `{
            "id": "${step.id}",
            "title": "${step.title}",
            "abstract": "${step.abstract}"
        }`
    ).join(", ");
    
    return `{
        "task": "You are given the previous code, current code after changes, a code diff for reference, and a list of relevant steps that were affected by these code changes. Analyze whether these changes require updates to the step abstracts and determine if any steps have become functionally incomplete and need regeneration.",
        "previous_code": "${previousCode}",
        "current_code": "${currentCode}",
        "code_diff": "${codeDiff}",
        "relevant_steps": [${stepsText}],
        "requirements": [
            "Compare the previous_code and current_code to understand what changes were made",
            "The code_diff is provided for reference to help you understand the changes, but focus on comparing the previous and current code directly",
            "For each step, determine if the changes require updating the step's title or abstract (needs_update: true/false)",
            "For each step, analyze if the code changes have made the step's code incomplete or broken, requiring complete regeneration (code_broken: true/false)",
            "A step has code_broken when: the code changes have removed or broken core functionality described in the step's abstract, making the step's implementation incomplete or non-functional",
            "A step only needs_update when: minor adjustments to title/abstract are needed but the core functionality remains intact",
            "If a step needs update, provide the updated title and abstract that reflect the code changes",
            "Extract the most relevant code parts that correspond to each updated step",
            "The corresponding_code should include the relevant portions from the current_code (after changes)",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"analysis\\": \\"(your analysis of the changes in the code and the things that need modification)\\", \\"updated_steps\\": [{\\"id\\": \\"step_id\\", \\"needs_update\\": true/false, \\"code_broken\\": true/false, \\"title\\": \\"(updated or original title)\\", \\"abstract\\": \\"(updated or original abstract)\\", \\"corresponding_code\\": \\"(relevant code from current_code)\\"}]}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
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
        "question": "${question.replace(/"/g, "\"")}",
        "standard_answer": "${standardAnswer.replace(/"/g, "\"")}",
        "user_answer": "${userAnswer.replace(/"/g, "\"")}"
        "requirements": [
            "Analyze whether the user's answer demonstrates understanding of the core concepts",
            "Be lenient with minor wording differences - focus on conceptual understanding",
            "Consider alternative correct explanations that might differ from the standard answer",
            "Determine if the answer is completely correct (isCorrect: true) or has gaps/errors (isCorrect: false)",
            "Provide constructive feedback highlighting what was good and what was missing or incorrect",
            "If the answer is incorrect, point out specific gaps in understanding or missing key concepts",
            "If the answer is correct, acknowledge the good understanding but mention any minor areas for improvement according to the standard answer",
            "Keep the feedback concise and educational - aim for 1-2 sentences",
            "Respond in the same language as the question",
            "You must follow this JSON format in your response: {\\"isCorrect\\": true/false, \\"remarks\\": \\"(your feedback message)\\"}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON object directly."
        ],
    }`;
}

// 针对 rerunStep 场景第一步：某个步骤的 abstract 发生变化，要求 LLM 只做必要的最小修改
export function constructRerunStepCodeUpdatePrompt(
    existingCode: string,
    allSteps: Array<{
        id: string;
        title: string;
        abstract: string;
    }>,
    stepId: string,
    oldAbstract: string,
    newAbstract: string,
    taskDescription?: string
): string {
    const stepsText = allSteps.map(step =>
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`
    ).join(",\n        ");
    
    return `{
        "task": "You are given existing code and information about a specific step whose abstract has changed. Update the code minimally to reflect the new abstract while preserving all unrelated functionality.",
        ${taskDescription ? `"task_description": "${taskDescription}",` : ""}
        "existing_code": "${existingCode}",
        "all_steps": [
        ${stepsText}
        ],
        "updated_step": {
            "id": "${stepId}",
            "old_abstract": "${oldAbstract}",
            "new_abstract": "${newAbstract}"
        },
        "requirements": [
            "STRICT RULE 1: Make MINIMAL changes to the existing code. Only modify what is absolutely necessary to reflect the new abstract for the specified step.",
            "STRICT RULE 2: Do NOT break or remove functionality that is working and relates to other steps.",
            "STRICT RULE 3: The updated code should maintain the same overall structure and all existing functionality while incorporating the changes required by the new abstract.",
            "Analyze the difference between the old_abstract and new_abstract for the specified step",
            "Identify which parts of the existing code need to be modified to match the new requirements",
            "Preserve all code that implements other steps or is not directly related to the changed step",
            "Make surgical changes only to the relevant sections",
            "Maintain code consistency and follow good programming practices",
            "The output should be the complete updated code file",
            "Respond in the same language as the step descriptions",
            "You must follow this JSON format in your response: {\\"complete_code\\": \\"(the complete updated code with minimal changes)\\"}",
            "CRITICAL: Return ONLY a valid JSON object. Do not add any explanatory text before or after the JSON. Do not use code block markers. The response should start with { and end with }.",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid code block characters to envelope the JSON response, just return the JSON object directly."
        ]
    }`;
}

// 构建全局提问的prompt - 根据问题选择最相关的步骤并生成知识卡片主题
export function constructGlobalQuestionPrompt(
    question: string,
    currentCode: string,
    allSteps: Array<{
        id: string;
        title: string;
        abstract: string;
    }>,
    learningGoal: string,
    taskDescription: string
): string {
    const stepsText = allSteps.map(step =>
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`
    ).join(",\n        ");

    return `{
        "task": "You are given a question about a coding project, along with the current code and all available steps. Choose the most relevant step that the question relates to, and generate knowledge card themes that would help answer the question.",
        "question": "${question}",
        "current_code": "${currentCode}",
        "all_steps": [
        ${stepsText}
        ],
        "learning_goal": "${learningGoal}",
        "task_description": "${taskDescription}"
        "requirements": [
            "Analyze the question and determine which step from the provided list is most relevant to answering it",
            "The question might be about concepts, implementation details, or understanding specific parts of the code",
            "Select the step that best matches the topic or area of concern in the question",
            "Generate 1-3 knowledge card themes that would help answer the user's question",
            "The themes should be specific to the question asked and relevant to the selected step",
            "Consider both the learning goals and the current code context when generating themes",
            "Respond in the same language as the question and step descriptions",
            "You must follow this JSON format in your response: {\\"selected_step_id\\": \\"(the id of the most relevant step)\\", \\"knowledge_card_themes\\": [\\"(theme 1)\\", \\"(theme 2)\\", \\"(theme 3)\\"]}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid code block characters to envelope the JSON response, just return the JSON object directly."
        ],
    }`;
}

// 构建检查知识卡片代码映射的prompt
export function constructMapKnowledgeCardsToCodePrompt(
    stepCode: string[],
    knowledgeCardTitles: string[]
): string {
    const codeLines = stepCode.map(line => 
        JSON.stringify(line)
    ).join(",\n        ");
    
    const knowledgeCardTitlesText = knowledgeCardTitles.map(title => 
        JSON.stringify(title)
    ).join(",\n        ");
    
    return `{
        "task": "You are given code lines for a specific step and knowledge card titles that don't have code mappings yet. Your job is to create precise mappings between complete code lines and knowledge card titles based on their themes.",
        "code_lines": [
        ${codeLines}
        ],
        "knowledge_card_titles": [
        ${knowledgeCardTitlesText}
        ],
        "requirements": [
            "STRICT RULE 1: Code snippets must be complete lines from the code_lines array. Never use partial lines or fragments.",
            "STRICT RULE 2: For each knowledge card title, find ALL complete lines that relate to its theme or topic. Focus on lines that directly demonstrate or implement the concept described by the knowledge card title.",
            "STRICT RULE 3: Every code snippet must be an exact copy of a complete line from the code_lines array.",
            "MAPPING PROCESS:",
            "- Analyze each knowledge card title to understand what programming concept or technique it represents",
            "- For each title, identify which code lines directly relate to that concept",
            "- Extract all relevant complete lines (can be non-consecutive) that help explain or demonstrate the knowledge card's topic",
            "- Include comment lines when they explain the concept related to the knowledge card",
            "- If a knowledge card title doesn't match any code lines, return an empty code_snippets array for that card",
            "OUTPUT FORMAT:",
            "- You must follow this JSON format: {\\"knowledge_card_mappings\\": [{\\"title\\": \\"knowledge_card_title\\", \\"code_snippets\\": [\\"code_line_1\\", \\"code_line_2\\"]}]}",
            "- Return ONLY a valid JSON object. No explanatory text before or after. No code block markers. Response must start with { and end with }.",
            "- Properly escape all special characters in JSON strings to ensure valid JSON",
            "- If no relevant code is found for a knowledge card, include it with an empty code_snippets array"
        ]
    }`;
}

// 新增：从完整代码中找到与特定步骤相关的代码行
export function constructFindStepRelatedCodeLinesPrompt(
    completeCode: string,
    stepTitle: string,
    stepAbstract: string
): string {
    const codeLines = completeCode.split("\n");
    const totalLines = codeLines.length;
    
    // 生成带行号的代码内容，便于分析
    const numberedCodeLines = codeLines.map((line, index) => 
        `${index + 1}: ${line}`
    ).join("\n");
    
    return `{
        "task": "You are given complete code and information about a specific implementation step. Your job is to identify and return ALL code lines that are related to implementing this specific step. Return the exact line content (without line numbers) for each relevant line.",
        "complete_code_with_line_numbers": "${numberedCodeLines}",
        "total_lines": ${totalLines},
        "step_info": {
            "title": "${stepTitle}",
            "abstract": "${stepAbstract}"
        },
        "requirements": [
            "STRICT RULE 1: Analyze the step title and abstract to understand exactly what this step is supposed to implement or accomplish.",
            "STRICT RULE 2: Go through the code line by line and identify ALL lines that are directly related to implementing this specific step.",
            "STRICT RULE 3: Include code lines that:",
            "  - Directly implement the functionality described in the step abstract",
            "  - Are helper functions or variables specifically used by this step's implementation",
            "  - Are imports that are only used by this step's functionality",
            "  - Are comments that explain this step's implementation",
            "STRICT RULE 4: Do NOT include lines that:",
            "  - Implement other steps or unrelated functionality",
            "  - Are general utility functions used by multiple steps (unless they are specifically created for this step)",
            "  - Are global imports or setup code used by the entire program (unless specific to this step)",
            "ANALYSIS PROCESS:",
            "- First understand what the step is trying to accomplish based on its title and abstract",
            "- Then scan through all code lines and identify which ones contribute to achieving this step's goal",
            "- Be selective but comprehensive - include all relevant lines but avoid including unrelated code",
            "- Consider both direct implementation lines and supporting code (variables, helper functions, comments)",
            "OUTPUT FORMAT:",
            "- Return ONLY the exact line content (without line numbers) for each relevant line",
            "- Maintain the original line content exactly as it appears in the code",
            "- You must follow this JSON format: {\\"related_code_lines\\": [\\"exact_line_content_1\\", \\"exact_line_content_2\\", ...]}",
            "- Return ONLY a valid JSON object. No explanatory text before or after. No code block markers.",
            "- If no relevant code lines are found, return {\\"related_code_lines\\": []}",
            "- Properly escape all special characters in JSON strings to ensure valid JSON"
        ]
    }`;
}