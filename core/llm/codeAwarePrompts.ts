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

export function constructGenerateStepsPrompt(userRequirement: string): string {
  return `你是一个面向初学者的编程任务分解专家。你的职责是把用户需求拆解为“目标语义清晰”的独立功能模块，而不是技术实现步骤。

## 目标

将需求拆解为 top-down 的语义步骤。无论是产品功能还是算法任务，每个步骤都应表达“实现了什么目标”，并让非程序员也能通过标题理解其意义。

## 用户需求

${userRequirement}

## 分解原则（严格遵守）

1. **允许必要技术词汇，但禁止低语义工程步骤**：可以出现与目标直接相关的技术名词（如排序、索引、鉴权、缓存），但不要把“搭建框架”“初始化项目”“前后端联调”等工程过程本身当作步骤。
2. **语义独立性**：每个高级步骤必须是一个完整能力单元。删掉任一步骤，用户应感知到失去一个功能或求解能力，而不是仅仅“程序跑不通”。
3. **场景可映射**：若是产品任务，能映射到现实业务流程；若是算法任务，能映射到清晰的问题求解阶段。
4. **功能闭环**：详细步骤应描述“解决了什么问题”或“处理了什么信息”，而不是“写了什么逻辑”。

### 示例（以“图书馆系统”为例）

- ❌ 错误：实现数据库模型、编写借书接口、前端页面对接
- ✅ 正确：构建图书编目体系、实现读者会员准入、建立书籍借还规则流

### 输出格式

\`\`\`json
{
  "title": "<需求标题，反映核心目标，5-10字>",
  "learning_goal": "<学习目标，说明通过此项目掌握了哪些问题建模与拆解能力，30-80字>",
  "high_level_steps": [
    "<具有独立目标语义的高级功能区1，8-15字>",
    ...
  ],
  "steps": [
    {
      "title": "<具体子功能或求解子目标，动词开头，5-15字>",
      "abstract": "<描述该步骤解决的具体问题，可含必要技术名词，但避免空泛工程流程描述，20-50字>",
      "task_corresponding_high_level_task": <对应的高级步骤序号，1-based>
    },
    ...
  ]
}
\`\`\`

现在请开始分解任务。`;
}

/**
 * 构造代码块语义分割的 prompt
 * 将代码分割成语义独立的代码块
 */
export function constructSplitCodeIntoChunksPrompt(
  code: string,
  startLine: number,
  steps: Array<{ id: string; title: string; abstract: string }>,
): string {
  return `你是一个代码分析专家。请将以下代码分割成语义独立的代码块（code chunks）。

## 背景信息

这段代码实现了以下步骤：
${steps.map((s, idx) => `${idx + 1}. [${s.id}] ${s.title}\n   描述: ${s.abstract}`).join("\n\n")}

## 代码内容

文件从第 ${startLine} 行开始：

\`\`\`
${code}
\`\`\`

## 任务要求

请将上述代码分割成**原子语义块**，每个块应该满足：

### 分割原则
1. **语义独立且完整**：每个代码块是一个完整的语义单元
     - ✅ 一个完整的函数定义
     - ✅ 一个完整的类定义
     - ✅ 一段完整的初始化逻辑
     - ✅ 一组相关的变量声明和赋值
     - ❌ 函数的一部分
     - ❌ 不完整的代码片段

2. **覆盖完整**：所有代码行都必须被分配到某个代码块中，不能有遗漏

3. **不重叠**：代码块之间不能有行号重叠

4. **合理粒度**：
     - 如果一个函数很长（>50行），可以考虑按照内部的逻辑段落分割
     - 如果多个小函数功能相似，可以合并为一个代码块
     - 目标：每个代码块 10-50 行左右

### 输出格式

返回严格的 JSON 格式：
\`\`\`json
{
    "code_chunks": [
        {
            "start_line": <起始行号，整数，基于 ${startLine}>,
            "end_line": <结束行号，整数，包含此行>,
            "semantic_description": "<该代码块的语义描述，10-30字>"
        }
    ]
}
\`\`\`

### 注意事项
- 起始行号从 ${startLine} 开始计数
- start_line 和 end_line 都是包含的（inclusive）
- 按行号顺序排列所有代码块
- 确保没有间隙：块1的 end_line + 1 应该等于块2的 start_line
- semantic_description 应该简洁描述代码块的功能，**不要包含实现细节**

### 示例
如果代码是：
\`\`\`python
def calculate_sum(a, b):
        return a + b

def main():
        result = calculate_sum(3, 5)
        print(result)
\`\`\`

则输出应该是：
\`\`\`json
{
    "code_chunks": [
        {
            "start_line": 1,
            "end_line": 2,
            "semantic_description": "定义求和函数"
        },
        {
            "start_line": 4,
            "end_line": 6,
            "semantic_description": "主函数：调用求和并打印结果"
        }
    ]
}
\`\`\`

现在请为上述代码生成分割结果。`;
}

/**
 * 构造代码块到步骤映射的 prompt
 * 将已分割的代码块映射到对应的实现步骤
 */
export function constructMapCodeChunksToStepsPrompt(
  codeChunks: Array<{ id: string; description: string; codePreview: string }>,
  steps: Array<{ id: string; title: string; abstract: string }>,
): string {
  return `你是一个代码分析专家。请将代码块映射到对应的实现步骤。

## 任务目标

我们有一组实现步骤和一组代码块，请建立它们之间的一对一映射关系。

## 实现步骤列表

${steps
  .map(
    (s, idx) => `### 步骤 ${idx + 1}: [${s.id}] ${s.title}
**描述**: ${s.abstract}
`,
  )
  .join("\n")}

## 代码块列表

${codeChunks
  .map(
    (c, idx) => `### 代码块 ${idx + 1}: [${c.id}]
**语义描述**: ${c.description}
**代码预览**:
\`\`\`
${c.codePreview}${c.codePreview.length > 150 ? "\n...(更多代码)" : ""}
\`\`\`
`,
  )
  .join("\n")}

## 映射要求

请为**每个代码块**找到**最匹配**的步骤ID，遵循以下原则：

### 映射规则
1. **一对一映射**：每个代码块必须且只能对应一个步骤
2. **语义匹配**：根据代码块的功能和步骤的描述，选择最相关的步骤
3. **置信度评估**：给出 0-1 的置信度分数，表示映射的确定程度
     - 0.9-1.0: 非常确定，代码块明确实现了该步骤
     - 0.7-0.9: 比较确定，代码块主要实现了该步骤
     - 0.5-0.7: 一般确定，代码块部分实现了该步骤
     - <0.5: 不太确定，没有更好的选择

### 输出格式

返回严格的 JSON 格式：
\`\`\`json
{
    "mappings": [
        {
            "code_chunk_id": "<代码块ID>",
            "step_id": "<步骤ID>",
            "confidence": <置信度，0-1的浮点数>,
            "reason": "<简短说明映射理由，10-30字>"
        }
    ]
}
\`\`\`

### 注意事项
- 必须为所有 ${codeChunks.length} 个代码块都提供映射
- step_id 必须来自上述步骤列表中
- 如果某个步骤没有对应的代码块，这是正常的（可能该步骤还未实现）
- 如果某个代码块很难映射，选择最接近的步骤并给出较低的置信度

### 示例
\`\`\`json
{
    "mappings": [
        {
            "code_chunk_id": "c-1",
            "step_id": "s-2",
            "confidence": 0.95,
            "reason": "代码块实现了数据验证功能，完全对应步骤2"
        },
        {
            "code_chunk_id": "c-2",
            "step_id": "s-3",
            "confidence": 0.8,
            "reason": "代码块实现了数据库查询，是步骤3的主要部分"
        }
    ]
}
\`\`\`

现在请为上述代码块生成映射结果。`;
}

/**
 * 构造知识点提取的 prompt
 * 从步骤和代码中提取理解所需的背景知识
 */
export function constructExtractKnowledgePointsPrompt(
  step: { id: string; title: string; abstract: string },
  codeContext: string,
): string {
  return `你是一个编程教育专家。请提取理解以下步骤所需的**前置背景知识点**。

## 步骤信息

**ID**: ${step.id}
**标题**: ${step.title}
**描述**: ${step.abstract}

## 相关代码实现

\`\`\`
${codeContext || "(该步骤暂无对应代码)"}
\`\`\`

## 任务要求

请识别理解这个步骤及其代码所需的**前置背景知识点**。

### 知识点类型

包括但不限于：

1. **编程语法知识** (category: "syntax")
     - 语言特性：如 Python 的列表推导式、JavaScript 的解构赋值
     - 特殊语法：如装饰器、泛型、异步函数
     - 示例：\`{ title: "Python 装饰器", category: "syntax" }\`

2. **算法和数据结构** (category: "algorithm")
     - 算法：如二分查找、动态规划、深度优先搜索
     - 数据结构：如哈希表、栈、队列、树
     - 示例：\`{ title: "哈希表原理", category: "algorithm" }\`

3. **框架/库知识** (category: "framework")
     - 框架概念：如 React Hooks、Django ORM
     - API 使用：如 fetch API、axios 库
     - 示例：\`{ title: "React useEffect Hook", category: "framework" }\`

4. **领域概念知识** (category: "concept")
     - 软件工程：如 REST API、CORS、认证授权
     - 领域特定：如机器学习中的损失函数、Web 中的会话管理
     - 示例：\`{ title: "JWT 令牌机制", category: "concept" }\`

### 知识点标准

提取的知识点应该：

✅ **独立可学**: 是一个可以单独学习的概念或技术
✅ **有学习价值**: 不是显而易见的常识（如"变量赋值"）
✅ **与步骤相关**: 确实是理解该步骤所必需的
✅ **粒度适中**: 不要太宽泛（❌"Python 基础"）也不要太具体（❌"第5行代码的作用"）

❌ **避免提取**:
- 过于基础的概念（如"for 循环"，除非有特殊用法）
- 过于宽泛的主题（如"面向对象编程"）
- 代码实现细节（应该在代码注释中说明）

### 难度级别

- **easy**: 初学者应该掌握的基础知识
- **medium**: 需要一定经验才能理解的知识
- **hard**: 高级概念或复杂技术

### 输出格式

返回严格的 JSON 格式：
\`\`\`json
{
    "knowledge_points": [
        {
            "title": "<知识点标题，5-10字>",
            "description": "<详细描述，说明这个知识点是什么、为什么需要它，50-150字>",
            "category": "syntax|algorithm|framework|concept",
            "difficulty": "easy|medium|hard"
        }
    ]
}
\`\`\`

### 数量要求
- 如果步骤简单且无特殊知识点：返回 0-1 个
- 一般情况：返回 2-4 个
- 如果步骤复杂涉及多个技术：最多返回 5 个

### 示例

假设步骤是 "实现用户认证中间件"，代码使用了 JWT 和 bcrypt，则可能提取：

\`\`\`json
{
    "knowledge_points": [
        {
            "title": "JWT 令牌机制",
            "description": "JSON Web Token 是一种用于在客户端和服务器之间安全传输信息的标准。它由头部、载荷和签名三部分组成，可以验证令牌的真实性和完整性。在认证场景中，服务器生成 JWT 返回给客户端，客户端在后续请求中携带 JWT 进行身份验证。",
            "category": "concept",
            "difficulty": "medium"
        },
        {
            "title": "密码哈希与加salt",
            "description": "为了安全存储用户密码，需要使用单向哈希函数（如 bcrypt）将明文密码转换为哈希值。加 salt（随机字符串）可以防止彩虹表攻击。bcrypt 还提供了可调节的计算成本，增加破解难度。",
            "category": "concept",
            "difficulty": "medium"
        },
        {
            "title": "Express 中间件机制",
            "description": "Express 中间件是一些函数，它们可以访问请求对象、响应对象和下一个中间件函数。中间件可以执行代码、修改请求和响应对象、结束请求-响应循环或调用下一个中间件。认证中间件通常在路由处理之前验证用户身份。",
            "category": "framework",
            "difficulty": "easy"
        }
    ]
}
\`\`\`

现在请为上述步骤提取知识点。`;
}

export function constructGenerateKnowledgeCardDetailPrompt(
  knowledgeCardTheme: string,
  learningGoal: string,
  codeContext: string,
  taskDescription?: string,
): string {
  return `{
        "task": "A non-programmer user is working on a coding project and needs fast, adaptive scaffolding for one specific confusion point. Based on the knowledge theme, project context, related code, and learning objectives, generate a short and clear knowledge card.",
        "knowledge_theme": "${knowledgeCardTheme}",
        "learning_objectives": "${learningGoal}",
        "related_code": "${codeContext}",
        "project_context": "${taskDescription || ""}",
        "requirements": [
            "Treat the user as a non-programmer: assume minimal coding background and minimal terminology knowledge.",
            "Use adaptive scaffolding style: internally choose one of hinting/explaining/instructing/modeling, but DO NOT output the chosen type.",
            "Focus on one specific confusion point only. Do not expand to downstream topics or unrelated concepts.",
            "Title must be plain and direct, avoiding obscure jargon. Prefer a concrete question-style or everyday phrase.",
            "Content must be 2-3 short sentences only, concise and practical.",
            "Sentence 1: TLDR in plain language. Sentence 2-3: minimal explanation or next action tied to project_context and related_code.",
            "Use simple words, life-like analogies when helpful, and avoid long definitions.",
            "Do not dump full code explanations. Only mention the most relevant code behavior if needed.",
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
  taskDescription?: string,
): string {
  return `{
  "task": "A non-programmer student has learned one knowledge card and wants a quick self-check. Generate very short self-test questions that verify understanding of the exact core point.",
        "knowledge_card_title": "${knowledgeCardTitle}",
        "knowledge_card_content": "${knowledgeCardContent}",
        "knowledge_theme": "${knowledgeCardTheme}",
        "learning_objectives": "${learningGoal}",
        "code_context": "${codeContext}",
        "task_context": "${taskDescription || ""}",
        "requirements": [
          "Treat the learner as a non-programmer. Use plain language and avoid heavy jargon.",
          "Generate 1-2 high-quality questions only. Keep each stem short and focused on one idea.",
          "Questions should directly test the exact core concept from the card, not broad extra knowledge.",
          "Prefer practical understanding checks using task_context/code_context in everyday wording.",
          "The standard_answer must be concise (1-2 sentences) and easy to understand.",
          "Avoid trivia or memorization-only questions. Prioritize conceptual understanding and simple application.",
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
  steps: Array<{ id: string; title: string; abstract: string }>,
  learningGoal: string,
): string {
  const stepsText = steps
    .map(
      (step, index) =>
        `${index + 1}. ID: ${step.id}, Title: ${step.title}, Abstract: ${step.abstract}`,
    )
    .join("\n");

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
  isLastStep?: boolean,
): string {
  const newStepsText = newStepsToImplement
    .map(
      (step) =>
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`,
    )
    .join(",\n        ");

  const previousStepsText = previouslyGeneratedSteps
    ? previouslyGeneratedSteps
        .map(
          (step) =>
            `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`,
        )
        .join(",\n        ")
    : "";

  const rule1Text = isLastStep
    ? "You MUST ensure the complete project functionality is implemented. This is the final step, so make sure all features work together to create a fully functional project."
    : "You MUST implement ONLY the steps listed in 'new_steps_to_implement'. Do NOT generate code for future steps or complete the entire project at once.";

  return `{
        "task": "You are on the way to implement a project incrementally. You are given existing code and a list of new steps to implement. Your ONLY job is to generate clean, complete code that implements the new steps while maintaining the existing code structure.",
        ${
          taskDescription
            ? `,
        "project_description": "${taskDescription}"`
            : ""
        },
        "existing_code": "${existingCode}",
        "new_steps_to_implement": [
        ${newStepsText}
        ]${
          previousStepsText
            ? `,
        "previously_generated_steps_context": [
        ${previousStepsText}
        ]`
            : ""
        }
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
  }>,
): string {
  const stepsText = allSteps
    .map(
      (step) =>
        `{"step_id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`,
    )
    .join(",\n        ");

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
  currentStep: { title: string; abstract: string },
  learningGoal: string,
  currentCode?: string,
): string {
  const codeContext = currentCode
    ? `
        "current_code": "${currentCode}",`
    : "";

  const codeRequirements = currentCode
    ? [
        "For each theme, identify if there is corresponding code in the current_code that relates to this theme",
        "If corresponding code exists, extract the most precise and relevant code snippets that relate to the knowledge card's theme. Focus on the specific lines that directly demonstrate the concept rather than including large code blocks",
        "A knowledge card can have multiple code snippets if different parts of the code relate to the same theme",
        "If a theme has no corresponding code, leave the corresponding_code_snippets array empty",
        "Code snippets should be precise and focused - include lines that directly relate to the theme's specific educational purpose",
      ]
    : [
        "Since no code is available for this step yet, focus only on generating relevant themes",
      ];

  if (currentCode) {
    return `{
            "task": "You are given a programming task, current step information, learning goals, and code. Generate beginner-friendly knowledge card themes for non-programmers so they can quickly find what they don't understand.",
            "task_description": "${taskDescription}",${codeContext}
            "current_step": {
                "title": "${currentStep.title}",
                "abstract": "${currentStep.abstract}"
            },
            "learning_goal": "${learningGoal}",
            "requirements": [
                "Treat learners as non-programmers with low terminology familiarity.",
                "Generate only 1-2 most critical themes for this step.",
                "Each theme must be very clear, concrete, and easy to understand at a glance.",
                "Avoid obscure technical wording. Prefer everyday phrases or direct beginner questions.",
                "Each theme should be concise (prefer 6-12 words) and should map to one specific confusion point.",
                "Do not include downstream topics or broad future-learning themes.",
                ${codeRequirements.map((req) => `"${req}"`).join(",\n                ")},
                "Respond in the same language as the task_description",
                "You must follow this JSON format in your response: [{\\"theme\\": \\"(theme title)\\", \\"corresponding_code_snippets\\": [\\"(relevant code snippet 1)\\", \\"(relevant code snippet 2)\\", ...]}]",
                "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
                "Please do not use invalid \`\`\`json character to envelope the JSON response, just return the JSON array directly."
            ]
        }`;
  } else {
    return `{
            "task": "You are given a programming task, current step information, and learning goals. Generate beginner-friendly knowledge card themes for non-programmers so they can quickly identify what they don't understand.",
            "task_description": "${taskDescription}",
            "current_step": {
                "title": "${currentStep.title}",
                "abstract": "${currentStep.abstract}"
            },
            "learning_goal": "${learningGoal}",
            "requirements": [
                "Treat learners as non-programmers with low terminology familiarity.",
                "Generate only 1-2 most critical themes for this step.",
                "Each theme must be very clear, concrete, and easy to understand at a glance.",
                "Avoid obscure technical wording. Prefer everyday phrases or direct beginner questions.",
                "Each theme should be concise (prefer 6-12 words) and should map to one specific confusion point.",
                "Do not include downstream topics or broad future-learning themes.",
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
  currentStep: { title: string; abstract: string },
  currentCode: string,
  existingThemes: string[],
  learningGoal: string,
  task: string,
): string {
  return `{
  "task": "You are given a user's question in a programming learning session. Generate beginner-friendly new knowledge card themes that directly solve the user's current confusion and complement existing themes.",
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
        "existing_themes": [${existingThemes.map((theme) => `"${theme}"`).join(", ")}],
        "learning_goal": "${learningGoal}",
        "task": "${task}",
        "requirements": [
            "Treat learners as non-programmers with low terminology familiarity.",
            "Generate 1-2 new themes that directly answer the user's current question.",
            "The themes should complement, not duplicate, the existing themes.",
            "Each theme should be plain, specific, and easy to understand at a glance (prefer 6-12 words).",
            "Avoid obscure technical jargon and avoid broad future-topic expansion.",
            "Prioritize the exact confusion point implied by the query.",
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
  },
): string {
  // 构建当前代码映射信息的文本
  const currentCodeMappingText = currentStepCodeChunks
    ? `
        "current_code_mappings": {
            "step_code": "${currentStepCodeChunks.stepCode}"
        },`
    : "";

  const currentCodeMappingRequirement = currentStepCodeChunks
    ? "Use the current_code_mappings as a reference to understand which parts of the code currently correspond to this step. This will help you identify the relevant code sections more accurately.,"
    : "";

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
  }>,
): string {
  const stepsText = relevantSteps
    .map(
      (step) =>
        `{
            "id": "${step.id}",
            "title": "${step.title}",
            "abstract": "${step.abstract}"
        }`,
    )
    .join(", ");

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
  userAnswer: string,
): string {
  return `{
        "task": "You are evaluating a student's short answer response to a programming-related question. Compare the user's answer with the standard answer and determine if it covers all key points correctly.",
        "question": "${question.replace(/"/g, '"')}",
        "standard_answer": "${standardAnswer.replace(/"/g, '"')}",
        "user_answer": "${userAnswer.replace(/"/g, '"')}"
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
  taskDescription?: string,
): string {
  const stepsText = allSteps
    .map(
      (step) =>
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`,
    )
    .join(",\n        ");

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
  allSteps: Array<{
    id: string;
    title: string;
    abstract: string;
  }>,
  taskDescription: string,
): string {
  // 确保 allSteps 是数组，如果不是则返回空数组
  const stepsArray = Array.isArray(allSteps) ? allSteps : [];
  const stepsText = stepsArray
    .map(
      (step) =>
        `{"id": "${step.id}", "title": "${step.title}", "abstract": "${step.abstract}"}`,
    )
    .join(",\n        ");

  return `{
      "task": "You are given a non-programmer user's question about a coding project and all available steps. Choose the most relevant step and generate concise, beginner-friendly knowledge card themes that directly answer the confusion.",
        "question": "${question}",
        "all_steps": [
        ${stepsText}
        ],
        "project_description": "${taskDescription}"
        "requirements": [
            "Analyze the question and determine which step from the provided list is most relevant to answering it",
            "The question might be about concepts, implementation details, or understanding specific parts of the code",
            "Select the step that best matches the topic or area of concern in the question",
          "Treat learners as non-programmers with low terminology familiarity.",
          "Generate exactly 1-2 themes that directly help answer the user's question.",
          "Each theme must be plain, specific, and easy to understand at a glance (prefer 6-12 words).",
          "Avoid obscure technical jargon and avoid broad future-topic expansion.",
          "The themes should be specific to the question asked and relevant to the selected step",
            "Consider the project context when generating themes",
            "Respond in the same language as the question and step descriptions",
            "You must follow this JSON format in your response: {\\"selected_step_id\\": \\"(the id of the most relevant step)\\", \\"knowledge_card_themes\\": [\\"(theme 1)\\", \\"(theme 2)\\"]}",
            "IMPORTANT: Properly escape all special characters in JSON strings. Ensure the JSON is valid and parseable.",
            "Please do not use invalid code block characters to envelope the JSON response, just return the JSON object directly."
        ],
    }`;
}

// 构建检查知识卡片代码映射的prompt
export function constructMapKnowledgeCardsToCodePrompt(
  stepCode: string[],
  knowledgeCardTitles: string[],
): string {
  const codeLines = stepCode
    .map((line) => JSON.stringify(line))
    .join(",\n        ");

  const knowledgeCardTitlesText = knowledgeCardTitles
    .map((title) => JSON.stringify(title))
    .join(",\n        ");

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
  stepAbstract: string,
): string {
  const codeLines = completeCode.split("\n");
  const totalLines = codeLines.length;

  // 生成带行号的代码内容，便于分析
  const numberedCodeLines = codeLines
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");

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
