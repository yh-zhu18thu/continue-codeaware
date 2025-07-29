/**
 * This is the entry point for the extension.
 */

import { setupCa } from "core/util/ca";
import * as vscode from "vscode";

// CodeAware: 抑制 SQLite 实验性警告和 Buffer 弃用警告
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  // 抑制 SQLite 相关的实验性警告
  if (warning.name === 'ExperimentalWarning' && 
      warning.message.includes('SQLite')) {
    return; // 忽略 SQLite 实验性警告
  }
  // 抑制 Buffer() 构造函数的弃用警告
  if (warning.name === 'DeprecationWarning' && 
      (warning.message.includes('Buffer()') || warning.message.includes('DEP0005'))) {
    return; // 忽略 Buffer 弃用警告
  }
  // 其他警告正常输出
  console.warn(warning.name, warning.message);
});

async function dynamicImportAndActivate(context: vscode.ExtensionContext) {
  // CodeAware: 添加全局错误处理来捕获 URI 错误
  process.on('uncaughtException', (error) => {
    if (error.name === 'UriError' || error.message.includes('Scheme contains illegal characters')) {
      console.warn('[CodeAware] Suppressed UriError:', error.message);
      return;
    }
    // 重新抛出其他未捕获的异常
    throw error;
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
