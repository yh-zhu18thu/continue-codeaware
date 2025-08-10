/**
 * This is the entry point for the extension.
 */

import { setupCa } from "core/util/ca";
import * as vscode from "vscode";

// CodeAware: 抑制 SQLite 实验性警告和 Buffer 弃用警告
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  // 抑制 SQLite 相关的实o验性警告
  if (warning.name === 'ExperimentalWarning' && 
      warning.message.includes('SQLite')) {
    return; // 忽略 SQLite 实验性警告
  }
  // 抑制 Buffer() 构造函数的弃用警告
  if (warning.name === 'DeprecationWarning' && 
      (warning.message.includes('Buffer()') || warning.message.includes('DEP0005'))) {
    return; // 忽略 Buffer 弃用警告
  }
  // 抑制网络连接相关的警告
  if (warning.message.includes('ECONNRESET') || 
      warning.message.includes('ENOTFOUND') ||
      warning.message.includes('ETIMEDOUT') ||
      warning.message.includes('socket hang up') ||
      warning.message.includes('GitHub.vscode-pull-request-github')) {
    console.warn('[CodeAware] Suppressed network warning:', warning.message);
    return;
  }
  // 其他警告正常输出
  console.warn(warning.name, warning.message);
});

async function dynamicImportAndActivate(context: vscode.ExtensionContext) {
  // CodeAware: 添加全局错误处理来捕获 URI 错误和网络连接错误
  process.on('uncaughtException', (error) => {
    if (error.name === 'UriError' || error.message.includes('Scheme contains illegal characters')) {
      console.warn('[CodeAware] Suppressed UriError:', error.message);
      return;
    }
    // 抑制网络连接重置错误 (ECONNRESET)
    if ((error as any).code === 'ECONNRESET' || error.message.includes('ECONNRESET') || 
        error.message.includes('read ECONNRESET') || error.message.includes('socket hang up')) {
      console.warn('[CodeAware] Suppressed network connection error:', error.message);
      return;
    }
    // 抑制其他常见的网络错误
    if ((error as any).code === 'ENOTFOUND' || (error as any).code === 'ETIMEDOUT' || 
        (error as any).code === 'ECONNREFUSED' || (error as any).code === 'EHOSTUNREACH') {
      console.warn('[CodeAware] Suppressed network error:', (error as any).code, error.message);
      return;
    }
    // 重新抛出其他未捕获的异常
    throw error;
  });

  // CodeAware: 添加 Promise 拒绝处理器来捕获网络相关的 Promise 错误
  process.on('unhandledRejection', (reason, promise) => {
    const error = reason as any;
    if (error && typeof error === 'object') {
      // 检查是否是网络相关错误
      if (error.code === 'ECONNRESET' || (error.message && error.message.includes('ECONNRESET')) ||
          (error.message && error.message.includes('read ECONNRESET')) ||
          (error.message && error.message.includes('GitHub.vscode-pull-request-github'))) {
        console.warn('[CodeAware] Suppressed unhandled network rejection:', error.message || error);
        return;
      }
      // 抑制其他网络错误
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || 
          error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH') {
        console.warn('[CodeAware] Suppressed unhandled network rejection:', error.code, error.message || error);
        return;
      }
    }
    // 对于其他未处理的 Promise 拒绝，记录但不终止进程
    console.warn('[CodeAware] Unhandled Promise Rejection:', reason);
  });

  await setupCa();
  const { activateExtension } = await import("./activation/activate");
  return await activateExtension(context);
}

export function activate(context: vscode.ExtensionContext) {
  return dynamicImportAndActivate(context).catch((e) => {
    console.log("Error activating extension: ", e);
    // CodeAware: 禁用 Telemetry 数据收集以避免网络请求
    // Telemetry.capture(
    //   "vscode_extension_activation_error",
    //   {
    //     stack: extractMinimalStackTraceInfo(e.stack),
    //     message: e.message,
    //   },
    //   false,
    //   true,
    // );
    vscode.window
      .showWarningMessage(
        "Error activating the Continue extension.",
        "View Logs",
        "Retry",
      )
      .then((selection) => {
        if (selection === "View Logs") {
          vscode.commands.executeCommand("continue.viewLogs");
        } else if (selection === "Retry") {
          // Reload VS Code window
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  });
}

export function deactivate() {
  // CodeAware: 禁用 Telemetry 数据收集以避免网络请求
  // Telemetry.capture(
  //   "deactivate",
  //   {
  //     extensionVersion: getExtensionVersion(),
  //   },
  //   true,
  // );

  // Telemetry.shutdownPosthogClient();
}
