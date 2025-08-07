// 测试 CodeAwareLogger 在不同工作区环境下的行为
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// 模拟不同的工作区路径场景
const testScenarios = [
  {
    name: "正常项目目录",
    workspaceRoot: "/Users/thuzyh/Documents/projects/test-project",
    shouldCreate: true
  },
  {
    name: "无效路径",
    workspaceRoot: "/nonexistent/path",
    shouldCreate: false
  },
  {
    name: "null 工作区",
    workspaceRoot: null,
    shouldCreate: false
  }
];

function testCodeAwareLogger() {
  console.log("=== 测试 CodeAwareLogger 工作区路径处理 ===\n");
  
  const { CodeAwareLoggerService } = require('./core/util/codeAwareLogger');
  
  for (const scenario of testScenarios) {
    console.log(`测试场景: ${scenario.name}`);
    console.log(`工作区路径: ${scenario.workspaceRoot}`);
    
    try {
      const logger = CodeAwareLoggerService.getInstance();
      
      // 设置工作区根路径
      if (scenario.workspaceRoot) {
        // 如果需要创建测试目录，先创建它
        if (scenario.shouldCreate && !fs.existsSync(scenario.workspaceRoot)) {
          fs.mkdirSync(scenario.workspaceRoot, { recursive: true });
          console.log(`✅ 创建了测试目录: ${scenario.workspaceRoot}`);
        }
        
        logger.setWorkspaceRoot(scenario.workspaceRoot);
      }
      
      const logDir = logger.getLogDirectory();
      console.log(`日志目录: ${logDir}`);
      
      // 检查日志目录是否在合理位置
      if (scenario.workspaceRoot && scenario.shouldCreate) {
        const expectedLogDir = path.join(scenario.workspaceRoot, ".codeaware-logs");
        if (logDir === expectedLogDir) {
          console.log("✅ 日志目录路径正确");
        } else {
          console.log("❌ 日志目录路径不匹配");
        }
      } else {
        // 检查是否使用了合理的后备目录
        if (!logDir.startsWith("/") || logDir.includes("Users")) {
          console.log("✅ 使用了合理的后备目录");
        } else {
          console.log("❌ 后备目录不合理");
        }
      }
      
      // 清理测试目录
      if (scenario.shouldCreate && fs.existsSync(scenario.workspaceRoot)) {
        fs.rmSync(scenario.workspaceRoot, { recursive: true, force: true });
        console.log(`🗑️ 清理了测试目录: ${scenario.workspaceRoot}`);
      }
      
    } catch (error) {
      console.log(`❌ 测试失败: ${error.message}`);
    }
    
    console.log("---\n");
  }
  
  // 测试当前工作目录检测
  console.log("=== 测试当前工作目录检测 ===");
  console.log("process.cwd():", process.cwd());
  console.log("os.homedir():", os.homedir());
  
  const logger = CodeAwareLoggerService.getInstance();
  console.log("默认日志目录:", logger.getLogDirectory());
}

// 检查是否可以直接运行这个测试
if (require.main === module) {
  testCodeAwareLogger();
} else {
  module.exports = { testCodeAwareLogger };
}
