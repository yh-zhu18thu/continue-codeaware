import { Tool } from "../..";
import { EDIT_CODE_INSTRUCTIONS } from "../../llm/defaultSystemMessages";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export interface EditToolArgs {
  filepath: string;
  changes: string;
}

export const NO_PARALLEL_TOOL_CALLING_INSTRUCTION =
  "This tool CANNOT be called in parallel with other tools.";

const CHANGES_DESCRIPTION =
  '⚠️ CRITICAL: Provide ONLY RAW CODE - no JSON, no structure, no wrapping. Do NOT use formats like {"result": "code", "language": "python", "notes": [...]}. Simply provide the code modifications directly with comment placeholders (e.g., \'# ... existing code ...\') for unchanged sections.';

export const editFileTool: Tool = {
  type: "function",
  displayTitle: "Edit File",
  wouldLikeTo: "edit {{{ filepath }}}",
  isCurrently: "editing {{{ filepath }}}",
  hasAlready: "edited {{{ filepath }}}",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: false,
  function: {
    name: BuiltInToolNames.EditExistingFile,
    description: `Use this tool to edit an existing file. If you don't know the contents of the file, read it first.\n${EDIT_CODE_INSTRUCTIONS}\n\n⚠️ CRITICAL REQUIREMENT: The 'changes' parameter must contain ONLY RAW CODE directly - never wrap in JSON like {\"result\": \"...\", \"language\": \"...\", \"notes\": [...]} or {\"updated_code\": \"...\"}. Provide the code modifications DIRECTLY.\n\n${NO_PARALLEL_TOOL_CALLING_INSTRUCTION}`,
    parameters: {
      type: "object",
      required: ["filepath", "changes"],
      properties: {
        filepath: {
          type: "string",
          description:
            "The path of the file to edit, relative to the root of the workspace.",
        },
        changes: {
          type: "string",
          description: CHANGES_DESCRIPTION,
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithPermission",
  systemMessageDescription: {
    prefix: `To edit an EXISTING file, use the ${BuiltInToolNames.EditExistingFile} tool with
- filepath: the relative filepath to the file.
- changes: ${CHANGES_DESCRIPTION}
Only use this tool if you already know the contents of the file. Otherwise, use the ${BuiltInToolNames.ReadFile} or ${BuiltInToolNames.ReadCurrentlyOpenFile} tool to read it first.
For example:`,
    exampleArgs: [
      ["filepath", "path/to/the_file.ts"],
      [
        "changes",
        "// ... existing code ...\nfunction subtract(a: number, b: number): number {\n  return a - b;\n}\n// ... rest of code ...",
      ],
    ],
  },
  preprocessArgs: async (args) => {
    const changes = args.changes as string;

    console.log("[EditFile][preprocessArgs] ========== START ==========");
    console.log("[EditFile][preprocessArgs] Raw args:", {
      filepath: args.filepath,
      changesType: typeof changes,
      changesLength: changes?.length,
      changesPreview: changes?.substring(0, 200),
    });

    // Check if changes is in JSON format (which is incorrect)
    if (changes && typeof changes === "string") {
      const trimmed = changes.trim();
      console.log("[EditFile][preprocessArgs] Trimmed changes:", {
        startsWithBrace: trimmed.startsWith("{"),
        endsWithBrace: trimmed.endsWith("}"),
        startsWithBracket: trimmed.startsWith("["),
        endsWithBracket: trimmed.endsWith("]"),
      });

      // Check for common JSON patterns that indicate incorrect format
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        console.log(
          "[EditFile][preprocessArgs] Detected potential JSON format, attempting parse",
        );
        try {
          const parsed = JSON.parse(trimmed);
          console.log(
            "[EditFile][preprocessArgs] Successfully parsed as JSON:",
            {
              keys: Object.keys(parsed),
              hasLanguageField: "language" in parsed,
              hasCodeField: "code" in parsed,
              hasResultField: "result" in parsed,
            },
          );

          // Check for ANY JSON structure - if it successfully parses as JSON with object/array structure,
          // it's likely incorrect format. Common fields to check:
          const suspiciousFields = [
            "updated_code",
            "changes_applied",
            "complete_code",
            "comments_changed",
            "language",
            "result",
            "notes",
            "code",
            "modifications",
            "edits",
          ];

          // If it's an object with any of these fields, or if it has a 'result' field containing code
          if (typeof parsed === "object" && parsed !== null) {
            const hasJsonStructure = suspiciousFields.some(
              (field) => field in parsed,
            );

            if (hasJsonStructure) {
              console.error(
                "[EditFile][preprocessArgs] ❌ REJECTED: JSON structure detected",
                {
                  fields: Object.keys(parsed),
                },
              );
              throw new ContinueError(
                ContinueErrorReason.InvalidToolCallArgs,
                `ERROR: The 'changes' parameter must contain ONLY RAW CODE, not JSON format.\n\n` +
                  `You provided JSON with fields: [${Object.keys(parsed).join(", ")}]\n\n` +
                  `CORRECT format - provide ONLY the code directly:\n` +
                  `// ... existing code ...\n` +
                  `def new_function():\n` +
                  `    return "new code"\n` +
                  `// ... existing code ...\n\n` +
                  `INCORRECT format - do NOT wrap in JSON:\n` +
                  `{"result": "code here", "language": "python"}\n\n` +
                  `Please call the tool again with ONLY the raw code in the 'changes' parameter.`,
              );
            } else {
              console.log(
                "[EditFile][preprocessArgs] ✅ JSON parsed but no suspicious fields found",
              );
            }
          }
        } catch (e) {
          console.log(
            "[EditFile][preprocessArgs] JSON parse failed (this is OK - probably code):",
            (e as Error).message.substring(0, 100),
          );
          // If it's a JSON parse error, that's fine - it's probably code
          // If it's our ContinueError, re-throw it
          if (e instanceof ContinueError) {
            throw e;
          }
        }
      } else {
        console.log("[EditFile][preprocessArgs] ✅ No JSON pattern detected");
      }
    }

    console.log("[EditFile][preprocessArgs] ========== END (PASS) ==========");
    return args;
  },
};
