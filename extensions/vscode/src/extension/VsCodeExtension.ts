import fs from "fs";

import { IContextProvider } from "core";
import { ConfigHandler } from "core/config/ConfigHandler";
import { EXTENSION_NAME, getControlPlaneEnv } from "core/control-plane/env";
import { Core } from "core/core";
import { FromCoreProtocol, ToCoreProtocol } from "core/protocol";
import { InProcessMessenger } from "core/protocol/messenger";
import { codeAwareLogger } from "core/util/codeAwareLogger";
import {
    getConfigJsonPath,
    getConfigTsPath,
    getConfigYamlPath,
} from "core/util/paths";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

// import { MetaCompleteProvider } from "../autocomplete/metacomplete";
import {
    monitorBatteryChanges,
    setupStatusBar
} from "../autocomplete/statusBar";
import { CodeAwareActionProvider } from "../codeActions/CodeAwareActionProvider";
import { CodeEditModeManager } from "../CodeEditModeManager";
import { CodeSelectionHandler } from "../codeSelection/CodeSelectionHandler";
import { registerAllCommands } from "../commands";
import { ContinueGUIWebviewViewProvider } from "../ContinueGUIWebviewViewProvider";
import { VerticalDiffManager } from "../diff/vertical/manager";
import { registerAllCodeLensProviders } from "../lang-server/codeLens";
import { registerAllPromptFilesCompletionProviders } from "../lang-server/promptFileCompletions";
import EditDecorationManager from "../quickEdit/EditDecorationManager";
import { QuickEdit } from "../quickEdit/QuickEditQuickPick";
import {
    getControlPlaneSessionInfo,
    WorkOsAuthProvider,
} from "../stubs/WorkOsAuthProvider";
import { Battery } from "../util/battery";
import { FileSearch } from "../util/FileSearch";
import { VsCodeIde } from "../VsCodeIde";

import { HighlightCodeManager } from "./HighlightCodeManager";
import { VsCodeMessenger } from "./VsCodeMessenger";

import type { VsCodeWebviewProtocol } from "../webviewProtocol";

export class VsCodeExtension {
  // Currently some of these are public so they can be used in testing (test/test-suites)

  private configHandler: ConfigHandler;
  private extensionContext: vscode.ExtensionContext;
  private ide: VsCodeIde;
  private sidebar: ContinueGUIWebviewViewProvider;
  private windowId: string;
  private editDecorationManager: EditDecorationManager;
  private highlightCodeManager: HighlightCodeManager;
  private codeEditModeManager: CodeEditModeManager;
  private verticalDiffManager: VerticalDiffManager;
  webviewProtocolPromise: Promise<VsCodeWebviewProtocol>;
  private core: Core;
  private battery: Battery;
  private workOsAuthProvider: WorkOsAuthProvider;
  private fileSearch: FileSearch;
  private codeSelectionHandler: CodeSelectionHandler;
  // private metacompleteProvider: MetaCompleteProvider;
  
  // CodeAware: 代码选择监听相关属性
  private lastSelectionData: {
    filePath: string;
    selectedLines: [number, number];
    selectedContent: string;
  } | null = null;
  private selectionDebounceTimer: NodeJS.Timeout | null = null;

  constructor(context: vscode.ExtensionContext) {
    console.log("VsCodeExtension: Initializing...");
    
    // CodeAware: 设置工作区根路径给 logger
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      codeAwareLogger.setWorkspaceRoot(workspaceRoot);
      console.log("[VsCodeExtension] Set workspace root for CodeAware logger:", workspaceRoot);
    } else {
      console.warn("[VsCodeExtension] No workspace folder found, CodeAware logger will use fallback directory");
    }
    
    // Register auth provider
    this.workOsAuthProvider = new WorkOsAuthProvider(context);
    this.workOsAuthProvider.refreshSessions();
    context.subscriptions.push(this.workOsAuthProvider);

    this.editDecorationManager = new EditDecorationManager(context);
    this.highlightCodeManager = new HighlightCodeManager();
    this.codeEditModeManager = new CodeEditModeManager();

    // Register managers for automatic disposal
    context.subscriptions.push(this.highlightCodeManager);
    context.subscriptions.push(this.codeEditModeManager);

    let resolveWebviewProtocol: any = undefined;
    this.webviewProtocolPromise = new Promise<VsCodeWebviewProtocol>(
      (resolve) => {
        resolveWebviewProtocol = resolve;
      },
    );
    this.ide = new VsCodeIde(this.webviewProtocolPromise, context, this.codeEditModeManager);

    this.extensionContext = context;
    this.windowId = uuidv4();

    // Dependencies of core
    let resolveVerticalDiffManager: any = undefined;
    const verticalDiffManagerPromise = new Promise<VerticalDiffManager>(
      (resolve) => {
        resolveVerticalDiffManager = resolve;
      },
    );
    let resolveConfigHandler: any = undefined;
    const configHandlerPromise = new Promise<ConfigHandler>((resolve) => {
      resolveConfigHandler = resolve;
    });
    this.sidebar = new ContinueGUIWebviewViewProvider(
      configHandlerPromise,
      this.windowId,
      this.extensionContext,
    );

    // Sidebar
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "continue.continueGUIView",
        this.sidebar,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      ),
    );
    resolveWebviewProtocol(this.sidebar.webviewProtocol);

    // Initialize CodeSelectionHandler after webviewProtocol is ready
    this.codeSelectionHandler = new CodeSelectionHandler(
      this.sidebar.webviewProtocol,
      context
    );

    // Register CodeAware Code Action Provider
    const codeAwareActionProvider = new CodeAwareActionProvider(this.sidebar.webviewProtocol);
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        "*", // 支持所有语言
        codeAwareActionProvider
      )
    );

    // CodeAware: 监听代码选择变化
    vscode.window.onDidChangeTextEditorSelection(async (event) => {
      const editor = event.textEditor;
      const document = editor.document;
      
      // 确保这是一个有效的文本文档
      if (document.uri.scheme !== 'file') {
        return;
      }

      const selection = event.selections[0]; // 取第一个选择区域

      // 只处理有选中内容的情况
      if (!selection.isEmpty) {
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const selectedContent = document.getText(selection);

        const currentSelectionData = {
          filePath: document.uri.fsPath,
          selectedLines: [startLine, endLine] as [number, number],
          selectedContent,
        };

        // 检查是否与上次选择相同
        if (this.isSameSelection(currentSelectionData, this.lastSelectionData)) {
          return;
        }

        // 清除之前的定时器
        if (this.selectionDebounceTimer) {
          clearTimeout(this.selectionDebounceTimer);
        }

        // 设置新的防抖定时器
        this.selectionDebounceTimer = setTimeout(async () => {
          this.lastSelectionData = currentSelectionData;
          const webviewProtocol = await this.webviewProtocolPromise;
          void webviewProtocol.request("codeSelectionChanged", currentSelectionData);
        }, 300); // 300ms 防抖延迟，适合多行选择场景
      } else {
        // 如果没有选中内容且之前有选择，发送取消选择事件
        if (this.lastSelectionData) {
          // 清除防抖定时器
          if (this.selectionDebounceTimer) {
            clearTimeout(this.selectionDebounceTimer);
            this.selectionDebounceTimer = null;
          }
          
          // 发送取消选择事件
          const webviewProtocol = await this.webviewProtocolPromise;
          void webviewProtocol.request("codeSelectionCleared", {
            filePath: document.uri.fsPath
          });
          
          // 清除上次选择数据
          this.lastSelectionData = null;
        }
      }
    });

    // CodeAware: 监听工作区文件夹变化，更新日志目录
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        const newWorkspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (newWorkspaceRoot) {
          codeAwareLogger.setWorkspaceRoot(newWorkspaceRoot);
          console.log("[VsCodeExtension] Workspace folder changed, updated CodeAware logger root:", newWorkspaceRoot);
        }
      })
    );

    // Config Handler with output channel
    const outputChannel = vscode.window.createOutputChannel(
      "Continue - LLM Prompt/Completion",
    );
    const inProcessMessenger = new InProcessMessenger<
      ToCoreProtocol,
      FromCoreProtocol
    >();

    new VsCodeMessenger(
      inProcessMessenger,
      this.sidebar.webviewProtocol,
      this.ide,
      verticalDiffManagerPromise,
      configHandlerPromise,
      this.workOsAuthProvider,
      this.editDecorationManager,
      this.highlightCodeManager,
      this.codeEditModeManager
    );

    // CodeAware: 设置高亮清除回调，当用户交互时通知 webview
    this.highlightCodeManager.setOnHighlightClearedCallback(async (filePath: string) => {
      try {
        const webviewProtocol = await this.webviewProtocolPromise;
        void webviewProtocol.request("codeSelectionCleared", {
          filePath: filePath
        });
        console.log(`Notified webview of highlight cleared for file: ${filePath}`);
      } catch (error) {
        console.error("Error notifying webview of highlight cleared:", error);
      }
    });

    this.core = new Core(inProcessMessenger, this.ide, async (log: string) => {
      outputChannel.appendLine(
        "==========================================================================",
      );
      outputChannel.appendLine(
        "==========================================================================",
      );
      outputChannel.append(log);
    });
    this.configHandler = this.core.configHandler;
    resolveConfigHandler?.(this.configHandler);

    this.configHandler.loadConfig();
    this.verticalDiffManager = new VerticalDiffManager(
      this.configHandler,
      this.sidebar.webviewProtocol,
      this.editDecorationManager,
    );
    resolveVerticalDiffManager?.(this.verticalDiffManager);

    // CodeAware: 禁用远程配置同步以避免网络请求
    // setupRemoteConfigSync(
    //   this.configHandler.reloadConfig.bind(this.configHandler),
    // );

    this.configHandler.loadConfig().then(({ config }) => {
      const { verticalDiffCodeLens } = registerAllCodeLensProviders(
        context,
        this.verticalDiffManager.fileUriToCodeLens,
        config,
      );

      this.verticalDiffManager.refreshCodeLens =
        verticalDiffCodeLens.refresh.bind(verticalDiffCodeLens);
    });

    this.configHandler.onConfigUpdate(
      async ({ config: newConfig, errors, configLoadInterrupted }) => {
        if (configLoadInterrupted) {
          // Show error in status bar
          setupStatusBar(undefined, undefined, true);
        } else if (newConfig) {
          setupStatusBar(undefined, undefined, false);

          registerAllCodeLensProviders(
            context,
            this.verticalDiffManager.fileUriToCodeLens,
            newConfig,
          );
        }
      },
    );

    // Tab autocomplete
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const enabled = config.get<boolean>("enableTabAutocomplete");

    /* Register inline completion provider
    setupStatusBar(
      enabled ? StatusBarStatus.Enabled : StatusBarStatus.Disabled,
    );
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        [{ pattern: "**" }],
        new ContinueCompletionProvider(
          this.configHandler,
          this.ide,
          this.sidebar.webviewProtocol
        ),
      ),
    );*/

    // Battery
    this.battery = new Battery();
    context.subscriptions.push(this.battery);
    context.subscriptions.push(monitorBatteryChanges(this.battery));

    // FileSearch
    this.fileSearch = new FileSearch(this.ide);
    registerAllPromptFilesCompletionProviders(
      context,
      this.fileSearch,
      this.ide,
    );

    const quickEdit = new QuickEdit(
      this.verticalDiffManager,
      this.configHandler,
      this.sidebar.webviewProtocol,
      this.ide,
      context,
      this.fileSearch,
    );

    // Commands
    registerAllCommands(
      context,
      this.ide,
      context,
      this.sidebar,
      this.configHandler,
      this.verticalDiffManager,
      this.core.continueServerClientPromise,
      this.battery,
      quickEdit,
      this.core,
      this.editDecorationManager,
    );

    // Disabled due to performance issues
    // registerDebugTracker(this.sidebar.webviewProtocol, this.ide);

    // Listen for file saving - use global file watcher so that changes
    // from outside the window are also caught
    fs.watchFile(getConfigJsonPath(), { interval: 1000 }, async (stats) => {
      if (stats.size === 0) {
        return;
      }
      await this.configHandler.reloadConfig();
    });

    fs.watchFile(
      getConfigYamlPath("vscode"),
      { interval: 1000 },
      async (stats) => {
        if (stats.size === 0) {
          return;
        }
        await this.configHandler.reloadConfig();
      },
    );

    fs.watchFile(getConfigTsPath(), { interval: 1000 }, (stats) => {
      if (stats.size === 0) {
        return;
      }
      this.configHandler.reloadConfig();
    });

    vscode.workspace.onDidSaveTextDocument(async (event) => {
      this.ide.updateLastFileSaveTimestamp();
      this.core.invoke("files/changed", {
        uris: [event.uri.toString()],
      });
    });

    vscode.workspace.onDidDeleteFiles(async (event) => {
      this.core.invoke("files/deleted", {
        uris: event.files.map((uri) => uri.toString()),
      });
    });

    vscode.workspace.onDidCreateFiles(async (event) => {
      this.core.invoke("files/created", {
        uris: event.files.map((uri) => uri.toString()),
      });
    });

    // When GitHub sign-in status changes, reload config
    vscode.authentication.onDidChangeSessions(async (e) => {
      const env = await getControlPlaneEnv(this.ide.getIdeSettings());
      if (e.provider.id === env.AUTH_TYPE) {
        vscode.commands.executeCommand(
          "setContext",
          "continue.isSignedInToControlPlane",
          true,
        );

        const sessionInfo = await getControlPlaneSessionInfo(true, false);
        this.webviewProtocolPromise.then(async (webviewProtocol) => {
          void webviewProtocol.request("didChangeControlPlaneSessionInfo", {
            sessionInfo,
          });

          // To make sure continue-proxy models and anything else requiring it get updated access token
          this.configHandler.reloadConfig();
        });
        void this.core.invoke("didChangeControlPlaneSessionInfo", {
          sessionInfo,
        });
      } else {
        vscode.commands.executeCommand(
          "setContext",
          "continue.isSignedInToControlPlane",
          false,
        );

        if (e.provider.id === "github") {
          this.configHandler.reloadConfig();
        }
      }
    });

    // Refresh index when branch is changed
    this.ide.getWorkspaceDirs().then((dirs) =>
      dirs.forEach(async (dir) => {
        const repo = await this.ide.getRepo(dir);
        if (repo) {
          repo.state.onDidChange(() => {
            // args passed to this callback are always undefined, so keep track of previous branch
            const currentBranch = repo?.state?.HEAD?.name;
            if (currentBranch) {
              if (this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]) {
                if (
                  currentBranch !== this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]
                ) {
                  // Trigger refresh of index only in this directory
                  this.core.invoke("index/forceReIndex", { dirs: [dir] });
                }
              }

              this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir] = currentBranch;
            }
          });
        }
      }),
    );

    // Register a content provider for the readonly virtual documents
    const documentContentProvider = new (class
      implements vscode.TextDocumentContentProvider
    {
      // emitter and its event
      onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
      onDidChange = this.onDidChangeEmitter.event;

      provideTextDocumentContent(uri: vscode.Uri): string {
        return uri.query;
      }
    })();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        VsCodeExtension.continueVirtualDocumentScheme,
        documentContentProvider,
      ),
    );

    this.ide.onDidChangeActiveTextEditor((filepath) => {
      void this.core.invoke("didChangeActiveTextEditor", { filepath });
    });

    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration(EXTENSION_NAME)) {
        const settings = await this.ide.getIdeSettings();
        const webviewProtocol = await this.webviewProtocolPromise;
        void webviewProtocol.request("didChangeIdeSettings", {
          settings,
        });
      }
    });

    // this.metacompleteProvider = new MetaCompleteProvider(context, this.ide, this.configHandler);
  }

  static continueVirtualDocumentScheme = EXTENSION_NAME;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private PREVIOUS_BRANCH_FOR_WORKSPACE_DIR: { [dir: string]: string } = {};

  // CodeAware: 检查选择是否相同的辅助方法
  private isSameSelection(
    current: { filePath: string; selectedLines: [number, number]; selectedContent: string } | null,
    previous: { filePath: string; selectedLines: [number, number]; selectedContent: string } | null
  ): boolean {
    if (!current || !previous) {
      return false;
    }
    return (
      current.filePath === previous.filePath &&
      current.selectedLines[0] === previous.selectedLines[0] &&
      current.selectedLines[1] === previous.selectedLines[1] &&
      current.selectedContent === previous.selectedContent
    );
  }

  registerCustomContextProvider(contextProvider: IContextProvider) {
    this.configHandler.registerCustomContextProvider(contextProvider);
  }

  public dispose(): void {
    // 清理CodeEditModeManager资源
    this.codeEditModeManager?.dispose();
    // 清理CodeSelectionHandler资源
    this.codeSelectionHandler?.dispose();
    // 清理HighlightCodeManager资源
    this.highlightCodeManager?.dispose();
    // 清理代码选择防抖定时器
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
      this.selectionDebounceTimer = null;
    }
  }
}
