import type { IDE } from "core";
import { ConfigHandler } from "core/config/ConfigHandler";
import * as vscode from "vscode";
import { RecentlyEditedTracker } from "./recentlyEdited";
import { RecentlyVisitedRangesService } from "./RecentlyVisitedRangesService";


export class MetaCompleteProvider {
    private recentlyEditedTracker: RecentlyEditedTracker;
    private recentlyVisitedRangesService: RecentlyVisitedRangesService;
    private decorationType: vscode.TextEditorDecorationType;
    private configHandler: ConfigHandler;
    private metacomplete_choices: string = `{
    "Working on new class?": [
        "What is the purpose of this class?",
        "What methods will be included?",
        "What attributes will be included?",
    ],
    "Working on new function?": [
        "What is the purpose of this?",
        "What are the inputs and outputs?",
        "What are the edge cases?",
    ],
    "Working on this function?": [
        "Wait for autocomplete / Keep coding.",
        "Go for other information.",
        "Write a comment.",
        "Check the correctness of the code.",
    ],
    "This function is complete.": [
        "Are there logic flaws?",
        "Are there edge cases uncovered?",
        "Need comments or docs?",
        "Are there other unfinished tasks?",
        "Need any refactoring or optimization?",
    ]
}`;
    private typingTimeout: NodeJS.Timeout | undefined;
    private trigger_position: vscode.Position | undefined;

    constructor(
        context: vscode.ExtensionContext,
        ide: IDE,
        configHandler: ConfigHandler,
    ) {
        this.recentlyEditedTracker = new RecentlyEditedTracker();
        this.recentlyVisitedRangesService = new RecentlyVisitedRangesService(ide);
        this.configHandler = configHandler;
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
            color: 'rgba(150,150,150,0.7)',
            fontStyle: 'italic',
            margin: '0 0 0 1em',
            }
        });
        
        vscode.window.onDidChangeTextEditorSelection(event => {
            // clearTimeout(this.typingTimeout);
            this.clearMetaCompletions();
        }, null, context.subscriptions);

        vscode.workspace.onDidChangeTextDocument(event => {
            clearTimeout(this.typingTimeout);
            this.clearMetaCompletions();

            this.trigger_position = vscode.window.activeTextEditor?.selection.active;
            this.typingTimeout = setTimeout(() => {
                this.provideMetaCompletions();
            }, 500);
        }, null, context.subscriptions);
    }

    public async provideMetaCompletions() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;
        const { config } = await this.configHandler.loadConfig();
        // if (!config) return;
        // const llm = config.selectedModelByRole.apply;
        // if (!llm) return;

        const position = activeEditor.selection.active;
        // if (!position || position != this.trigger_position) return;
        const line = position.line;

//         const currentLineOffset = activeEditor.document.offsetAt(position);
//         let currentFileContext = activeEditor.document.getText();
//         currentFileContext = currentFileContext.slice(0, currentLineOffset) + "<<<UserCurrentPosition>>>" + currentFileContext.slice(currentLineOffset);
//         const metacomplete_prompt = `I will give you a code context, with user's current position marked with <<<UserCurrentPosition>>>.
// Firstly, you need to classify user's current status from four options:
// - Working on new class? User is defining a new class.
// - Working on new function? User is defining a new function.
// - Working on this function? This function is defined, but the content is not complete.
// - This function is complete. The basic logic of this function is complete, even if user's position is not at the end of the function. As long as the return statement covers all cases, it is considered complete.
// Then you need to give user a metacognitive guide for next step.
// Each status has its own guide options, and you need to choose only ONE option from the guide options:
// ${this.metacomplete_choices}
// You need to return a json object with two string fields: "status" and "guide" and nothing else.
// For example: {"status": "Working on new class?", "guide": "What is the purpose of this class?"}
// The code context is:
// ${currentFileContext}`;

//         const metacomplete_response = await llm.chat(
//             [
//                 {
//                   role: "user",
//                   content: metacomplete_prompt,
//                 },
//             ],
//             new AbortController().signal,
//         );
//         if (!metacomplete_response) return;
//         let metacomplete_response_text = metacomplete_response.content.toString();
//         if (metacomplete_response_text.startsWith("```json")) metacomplete_response_text = metacomplete_response_text.slice(7, -3);
//         const metacomplete_response_json = JSON.parse(metacomplete_response_text);
//         const status = metacomplete_response_json.status;
//         const guide = metacomplete_response_json.guide;

//         const hint = `>>> ${status} ${guide}`;
        const hint = '>>> Test hint for meta-completion';
        if (!hint) {
            activeEditor.setDecorations(this.decorationType, []);
            return;
        }

        const lineText = activeEditor.document.lineAt(line);
        const range = new vscode.Range(lineText.range.end, lineText.range.end);

        const decoration: vscode.DecorationOptions = {
            range,
            renderOptions: {
                after: {
                    contentText: hint,
                }
            }
        };

        activeEditor.setDecorations(this.decorationType, [decoration]);
    }

    public async clearMetaCompletions() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;
        activeEditor.setDecorations(this.decorationType, []);
    }
}
