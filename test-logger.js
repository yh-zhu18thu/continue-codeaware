// 直接测试路径存在性和日志目录创建
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log("测试 CodeAwareLogger 修复...");

function getWorkspaceDirectory() {
  try {
    // First try: use process.cwd() but validate it's not root
    const cwd = process.cwd();
    console.log("当前工作目录:", cwd);
    
    if (cwd !== "/" && cwd !== "C:\\" && cwd.length > 1) {
      return cwd;
    }
  } catch (error) {
    console.warn("获取当前工作目录失败:", error);
  }

  // Fallback: use user's home directory
  const homeDir = os.homedir();
  console.warn("使用用户主目录作为后备方案:", homeDir);
  return homeDir;
}

const workspaceDir = getWorkspaceDirectory();
console.log("检测到的工作区目录:", workspaceDir);

const logDirectory = path.join(workspaceDir, ".codeaware-logs");
console.log("日志目录路径:", logDirectory);

// 测试创建目录
try {
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
    console.log("✅ 成功创建日志目录");
  } else {
    console.log("✅ 日志目录已存在");
  }
  
  // 测试创建一个日志文件
  const testFilename = "test_user_test_session_" + Date.now() + ".jsonl";
  const testFilePath = path.join(logDirectory, testFilename);
  
  console.log("测试日志文件路径:", testFilePath);
  
  // 写入测试数据
  const testLogEntry = {
    timestamp: new Date().toISOString(),
    codeAwareSessionId: "test-session-id",
    eventType: "test_event",
    payload: { message: "测试日志条目" }
  };
  
  fs.writeFileSync(testFilePath, JSON.stringify(testLogEntry) + "\n", "utf8");
  console.log("✅ 成功创建并写入测试日志文件");
  
  // 读取并验证内容
  const content = fs.readFileSync(testFilePath, "utf8");
  console.log("日志文件内容:", content.trim());
  
  // 清理测试文件
  fs.unlinkSync(testFilePath);
  console.log("✅ 清理测试文件完成");
  
} catch (error) {
  console.error("❌ 测试失败:", error);
}

console.log("测试完成！");
