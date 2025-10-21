/**
 * CodeAware Generation Helper Functions
 * 提供统一的工具函数和日志记录功能
 */

// ========================================
// Constants
// ========================================

export const MAX_RETRIES = 3;
export const ERROR_DISPLAY_DURATION = 2000; // milliseconds

// ========================================
// Logging Utilities
// ========================================

/**
 * 统一的日志工具，提供一致的日志格式和emoji标识
 */
export const Logger = {
    /** 常规信息 */
    info: (message: string, data?: any) => {
        console.log(`ℹ️  ${message}`, data !== undefined ? data : '');
    },
    
    /** 成功操作 */
    success: (message: string, data?: any) => {
        console.log(`✅ ${message}`, data !== undefined ? data : '');
    },
    
    /** 警告信息 */
    warning: (message: string, data?: any) => {
        console.warn(`⚠️  ${message}`, data !== undefined ? data : '');
    },
    
    /** 错误信息 */
    error: (message: string, error?: any) => {
        console.error(`❌ ${message}`, error !== undefined ? error : '');
    },
    
    /** 调试信息 */
    debug: (message: string, data?: any) => {
        console.log(`🔍 ${message}`, data !== undefined ? data : '');
    },
    
    /** 步骤信息 */
    step: (stepNumber: number | string, message: string, data?: any) => {
        console.log(`📝 Step ${stepNumber}: ${message}`, data !== undefined ? data : '');
    },
    
    /** 代码块相关 */
    chunk: (message: string, data?: any) => {
        console.log(`📦 ${message}`, data !== undefined ? data : '');
    },
    
    /** 启动/开始操作 */
    start: (message: string, data?: any) => {
        console.log(`🚀 ${message}`, data !== undefined ? data : '');
    },
    
    /** 等待中 */
    waiting: (message: string, data?: any) => {
        console.log(`⏳ ${message}`, data !== undefined ? data : '');
    },
    
    /** 清理操作 */
    cleanup: (message: string, data?: any) => {
        console.log(`🧹 ${message}`, data !== undefined ? data : '');
    },
    
    /** 保存操作 */
    save: (message: string, data?: any) => {
        console.log(`💾 ${message}`, data !== undefined ? data : '');
    },
    
    /** 链接/映射操作 */
    link: (message: string, data?: any) => {
        console.log(`🔗 ${message}`, data !== undefined ? data : '');
    },
    
    /** 导航/路由操作 */
    navigate: (message: string, data?: any) => {
        console.log(`🧭 ${message}`, data !== undefined ? data : '');
    },
    
    /** 目标/靶点操作 */
    target: (message: string, data?: any) => {
        console.log(`🎯 ${message}`, data !== undefined ? data : '');
    },
    
    /** 删除操作 */
    delete: (message: string, data?: any) => {
        console.log(`🗑️  ${message}`, data !== undefined ? data : '');
    },
    
    /** 重置操作 */
    reset: (message: string, data?: any) => {
        console.log(`🔄 ${message}`, data !== undefined ? data : '');
    },
    
    /** 修复操作 */
    fix: (message: string, data?: any) => {
        console.log(`🔧 ${message}`, data !== undefined ? data : '');
    }
};

// ========================================
// Common Helper Functions
// ========================================

/**
 * LLM请求重试逻辑的通用函数
 * @param requestFn 实际执行请求的函数
 * @param options 重试选项配置
 * @returns Promise<T> 请求结果
 */
export async function retryLLMRequest<T>(
    requestFn: () => Promise<T>,
    options: {
        maxRetries?: number;
        operationName: string;
        onRetry?: (attempt: number, error: Error) => void;
    }
): Promise<T> {
    const { maxRetries = MAX_RETRIES, operationName, onRetry } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            Logger.debug(`${operationName} - Attempt ${attempt}/${maxRetries}`);
            const result = await requestFn();
            
            if (attempt > 1) {
                Logger.success(`${operationName} succeeded on attempt ${attempt}`);
            }
            
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            Logger.warning(`${operationName} failed on attempt ${attempt}/${maxRetries}`, {
                error: lastError.message
            });

            if (onRetry) {
                onRetry(attempt, lastError);
            }

            if (attempt < maxRetries) {
                // 指数退避策略，最大延迟5秒
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                Logger.debug(`Retrying after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
}

/**
 * 解析LLM返回的JSON内容
 * @param content LLM返回的原始字符串
 * @param operationName 操作名称，用于日志记录
 * @returns 解析后的JSON对象
 */
export function parseLLMJsonResponse<T>(content: string, operationName: string): T {
    try {
        // 清理可能的markdown代码块标记
        let cleanedContent = content.trim();
        
        if (cleanedContent.startsWith('```')) {
            cleanedContent = cleanedContent
                .replace(/^```(?:json)?\n?/, '')
                .replace(/\n?```$/, '')
                .trim();
        }
        
        const parsed = JSON.parse(cleanedContent);
        Logger.success(`${operationName} - JSON parsed successfully`);
        return parsed;
    } catch (error) {
        Logger.error(`${operationName} - Failed to parse JSON`, {
            error: error instanceof Error ? error.message : String(error),
            contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
        });
        throw new Error(
            `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * 验证LLM响应的状态
 * @param result LLM响应对象
 * @param operationName 操作名称，用于日志记录
 * @throws 如果响应无效则抛出错误
 */
export function validateLLMResponse(result: any, operationName: string): void {
    if (!result || result.status !== "success" || !result.content) {
        const errorMsg = `${operationName} - Invalid LLM response`;
        Logger.error(errorMsg, { result });
        throw new Error(errorMsg);
    }
}

/**
 * 清理Markdown格式的文本，去掉换行符等特殊字符
 * @param text 原始文本
 * @returns 清理后的文本
 */
export function cleanMarkdownText(text: string): string {
    return text
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\*\*(.*?)\*\*/g, '$1')  // 去掉粗体标记 **text**
        .replace(/\*(.*?)\*/g, '$1')      // 去掉斜体标记 *text*
        .replace(/`(.*?)`/g, '$1')        // 去掉行内代码标记 `code`
        .replace(/#{1,6}\s*/g, '')        // 去掉标题标记
        .replace(/>\s*/g, '')             // 去掉引用标记
        .replace(/[-*+]\s*/g, '')         // 去掉列表标记
        .replace(/\d+\.\s*/g, '')         // 去掉有序列表标记
        .trim();
}

/**
 * 计算两个字符串的相似度（使用最长公共子序列算法）
 * @param str1 字符串1
 * @param str2 字符串2
 * @returns 相似度分数 (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/\s+/g, ' ').trim();
    const s2 = str2.toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;
    
    // 最长公共子序列算法
    const lcs = (a: string, b: string): number => {
        const m = a.length;
        const n = b.length;
        const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        return dp[m][n];
    };
    
    const lcsLength = lcs(s1, s2);
    return (2 * lcsLength) / (s1.length + s2.length);
}

/**
 * 创建代码预览（截断长内容）
 * @param code 完整代码
 * @param maxLength 最大长度
 * @returns 预览字符串
 */
export function createCodePreview(code: string, maxLength: number = 100): string {
    if (code.length <= maxLength) {
        return code;
    }
    return code.substring(0, maxLength) + '...';
}

/**
 * 标准化文件路径
 * @param filepath 原始文件路径
 * @returns 标准化后的路径
 */
export function normalizeFilePath(filepath: string): string {
    return filepath.replace(/\\/g, '/');
}

/**
 * 验证行号范围是否有效
 * @param startLine 起始行号
 * @param endLine 结束行号
 * @param totalLines 总行数
 * @returns 是否有效
 */
export function isValidLineRange(
    startLine: number,
    endLine: number,
    totalLines: number
): boolean {
    return (
        startLine >= 1 &&
        endLine <= totalLines &&
        startLine <= endLine
    );
}

/**
 * 格式化步骤详情用于日志记录
 * @param steps 步骤数组
 * @returns 格式化后的步骤信息
 */
export function formatStepsForLogging(
    steps: Array<{ id?: string; title: string; abstract?: string }>
): Array<{ id?: string; title: string; abstractPreview?: string }> {
    return steps.map(step => ({
        id: step.id,
        title: step.title,
        abstractPreview: step.abstract
            ? step.abstract.substring(0, 200) + (step.abstract.length > 200 ? '...' : '')
            : undefined
    }));
}
