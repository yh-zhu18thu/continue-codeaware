import { CodeAwareMapping, CodeChunk, RequirementChunk, SelfTestResult, StepItem } from "core";

export function getTestStepsData(): StepItem[] {
    const result = [
                    {
                        id: "s-1",
                        title: "数据加载",
                        abstract: "+ 读取原始数据文件。\n + 打印数据，查看数据结构。",
                        knowledgeCards: [],
                        isHighlighted: false,
                    },
                    {
                        id: "s-2", 
                        title: "数据预处理",
                        abstract: "+ 读取原始数据文件。\n + 打印数据，查看数据结构。",
                        knowledgeCards: [],
                        isHighlighted: false,
                    },
                    {
                        id: "s-3",
                        title: "文本特征提取", 
                        abstract: "**理解为何需要把文本变成数值供机器理解** \n + 创建TF-IDF向量化转化器 \n  + 将所有邮件文本转化成向量 ",
                        knowledgeCards: [
                            {
                                id: "s-3-k-1",
                                title: "vectorizer批量处理数据的原理",
                                content: "### 批量扫描构建词汇表 \n Vectorizer会先遍历所有输入文本，统一统计出现的所有词汇，建立一个全局的词汇表（词典）。这样，不管输入多少条文本，词汇表是固定的，后续转换都基于这份词汇表统一进行。\n ### 统一转换规则 \n  所有文本都使用同一套规则（分词、去停用词、词形还原等），避免重复计算，提升效率。",
                                tests: [
                                    {
                                        id: "s-3-k-1-t-1",
                                        question: {
                                            type: "shortAnswer" as const,
                                            stem: "为什么Vectorizer可以并行地将大量文本转化为向量？",
                                            standard_answer: "批量处理基于统一词汇表且利用稀疏矩阵实现高效存储。",
                                            answer: "",
                                            remarks: "",
                                            result: "unanswered" as SelfTestResult
                                        },
                                        questionType: "shortAnswer" as const
                                    },
                                    {
                                        id: "s-3-k-1-t-2",
                                        question: {
                                            type: "shortAnswer" as const,
                                            stem: "Vectorizer如何处理新文本？",
                                            standard_answer: "新文本使用已有词汇表进行向量化，确保一致性。",
                                            answer: "",
                                            remarks: "",
                                            result: "unanswered" as SelfTestResult
                                        },
                                        questionType: "shortAnswer" as const
                                    }
                                ],
                                isHighlighted: false,
                            },
                            {
                                id: "s-3-k-2",
                                title: "为什么在这里使用TF-IDF？",
                                content: "TF-IDF是一种常用的文本特征提取方法，能够有效地表示文本中的关键词信息。其它方法如Word2Vec、BERT等虽然更先进，但在处理大规模文本数据时可能需要更多的计算资源和时间。更加传统的方法如Bag of Words虽然简单，但无法捕捉词语之间的关系和上下文信息，因此在这里选择TF-IDF作为平衡性能和效果的方案。",
                                tests: [],
                                isHighlighted: false,
                            }
                        ],
                        isHighlighted: false,
                    }
                ]
    return result;
}

export function createTestRequirementChunks(): RequirementChunk[] {
    return [
        {
            id: "r-1",
            content: "读入标注了是垃圾邮件还是非垃圾邮件的表格",
            isHighlighted: false
        },
        {
            id: "r-2", 
            content: "并构建数据集",
            isHighlighted: false
        }
    ];
}

export function createTestCodeChunks(): CodeChunk[] {
    return [
        {
            id: "c-1",
            content: "# 1. 读取垃圾邮件数据集\nprint(\"正在加载数据集...\")\ndata = pd.read_csv(data_file)\nprint(f\"数据集大小: {data.shape}\")\nprint(f\"垃圾邮件数量: {sum(data['label'] == 'spam')}\")\nprint(f\"正常邮件数量: {sum(data['label'] == 'ham')}\")",
            lineRange: [25, 32],
            isHighlighted: false
        },
        {
            id: "c-2",
            content: "# 2. 文本预处理\nprint(\"正在预处理文本数据...\")\nprocessed_texts = []\nfor text in data['text']:\n    # 转换为小写\n    text = text.lower()\n    # 移除标点符号\n    text = text.translate(str.maketrans('', '', string.punctuation))\n    # 移除数字\n    text = re.sub(r'\\d+', '', text)\n    # 移除多余的空格\n    text = ' '.join(text.split())\n    processed_texts.append(text)\n\ndata['processed_text'] = processed_texts",
            lineRange: [34, 49],
            isHighlighted: false
        },
        {
            id: "c-3",
            content: "# 3. 准备特征和标签\nX = data['processed_text']\ny = data['label']\n\n# 4. 划分训练集和测试集\nX_train, X_test, y_train, y_test = train_test_split(\n    X, y, test_size=0.3, random_state=42, stratify=y\n)",
            lineRange: [51, 58],
            isHighlighted: false
        }
    ];
}

export function createTestCodeAwareMappings(): CodeAwareMapping[] {
    return [
        // 需求1: 读取数据 -> 步骤1: 数据加载 -> 代码块1: 读取数据集
        {
            codeChunkId: "c-1",
            requirementChunkId: "r-1", 
            stepId: "s-1",
            isHighlighted: false
        },
        // 需求2: 数据预处理 -> 步骤2: 数据预处理 -> 代码块2: 文本预处理
        {
            codeChunkId: "c-2",
            requirementChunkId: "r-2",
            stepId: "s-2", 
            isHighlighted: false
        },
        // 需求2: 数据预处理 -> 步骤2: 数据预处理 -> 代码块3: 准备特征和标签
        {
            codeChunkId: "c-3",
            requirementChunkId: "r-2",
            stepId: "s-2",
            isHighlighted: false
        }
    ];
}