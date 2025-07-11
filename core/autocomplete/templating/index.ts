import Handlebars from "handlebars";

import { CodeAwareContext, CompletionOptions } from "../..";
import { getUriPathBasename } from "../../util/uri";
import { AutocompleteLanguageInfo } from "../constants/AutocompleteLanguageInfo";
import { SnippetPayload } from "../snippets";

import { HelperVars } from "../util/HelperVars";
import {
  AutocompleteTemplate,
  getTemplateForModel,
} from "./AutocompleteTemplate";
import { getSnippets } from "./filtering";
import { formatSnippets } from "./formatting";
import { getStopTokens } from "./getStopTokens";

function getTemplate(helper: HelperVars): AutocompleteTemplate {
  if (helper.options.template) {
    return {
      template: helper.options.template,
      completionOptions: {},
      compilePrefixSuffix: undefined,
    };
  }
  return getTemplateForModel(helper.modelName);
}

function renderStringTemplate(
  template: string,
  prefix: string,
  suffix: string,
  lang: AutocompleteLanguageInfo,
  filepath: string,
  reponame: string,
  codeAwareContext?: CodeAwareContext,
) {
  const filename = getUriPathBasename(filepath);
  const compiledTemplate = Handlebars.compile(template);

  return compiledTemplate({
    prefix,
    suffix,
    filename,
    reponame,
    language: lang.name,
    userRequirement: codeAwareContext?.userRequirement || "",
    currentStep: codeAwareContext?.currentStep || "",
    nextStep: codeAwareContext?.nextStep || "",
  });
}

// CodeAware: 为prefix添加上下文的辅助函数
function enhancePrefixWithCodeAwareContext(
  prefix: string,
  codeAwareContext?: CodeAwareContext,
): string {
  if (!codeAwareContext || !codeAwareContext.userRequirement) {
    return prefix;
  }

  const taskParts: string[] = [];
  
  if (codeAwareContext.userRequirement) {
    taskParts.push(`# Task: ${codeAwareContext.userRequirement}`);
  }

  const taskString = taskParts.join("\n");

  const stepParts: string[] = [];

  console.log("CodeAware: Enhancing prefix with context", codeAwareContext);

  // 根据stepFinished状态决定在prefix末尾添加什么步骤信息
  if (codeAwareContext.stepFinished) {
    // 当前步骤已完成，提示生成下一步的代码
    if (codeAwareContext.nextStep) {
      stepParts.push(`#  ${codeAwareContext.nextStep}`);
    }
  } else {
    // 当前步骤未完成，提示继续当前步骤的代码
    if (codeAwareContext.currentStep) {
      stepParts.push(`# ${codeAwareContext.currentStep}`);
    }
  }

  const stepString = stepParts.join("\n");

  // 将任务信息添加到prefix的开头，步骤信息添加到prefix的末尾
  if (taskString) {
    prefix = `${taskString}\n${prefix}`;
  }
  if (stepString) {
    prefix = `${prefix}\n\n${stepString}\n\n`;
  }
  return prefix;
}

// CodeAware: 为suffix添加上下文的辅助函数
function enhanceSuffixWithCodeAwareContext(
  suffix: string,
  codeAwareContext?: CodeAwareContext,
): string {
  if (!codeAwareContext || !codeAwareContext.userRequirement) {
    return suffix;
  }

  console.log("CodeAware: Enhancing suffix with context", codeAwareContext);

  const stepParts: string[] = [];

  // 只有当前步骤未完成时，才在suffix开头添加下一步信息作为边界
  if (!codeAwareContext.stepFinished && codeAwareContext.nextStep) {
    stepParts.push(`# ${codeAwareContext.nextStep}`);
  }

  const stepString = stepParts.join("\n");

  // 将步骤信息添加到suffix的开头
  if (stepString) {
    suffix = `\n${stepString}\n${suffix}`;
  }
  
  return suffix;
}

export function renderPrompt({
  snippetPayload,
  workspaceDirs,
  helper,
}: {
  snippetPayload: SnippetPayload;
  workspaceDirs: string[];
  helper: HelperVars;
}): {
  prompt: string;
  prefix: string;
  suffix: string;
  completionOptions: Partial<CompletionOptions> | undefined;
} {
  // If prefix is manually passed
  let prefix = helper.input.manuallyPassPrefix || helper.prunedPrefix;
  let suffix = helper.input.manuallyPassPrefix ? "" : helper.prunedSuffix;
  if (suffix === "") {
    suffix = "\n";
  }

  const reponame = getUriPathBasename(workspaceDirs[0] ?? "myproject");

  const { template, compilePrefixSuffix, completionOptions } =
    getTemplate(helper);

  const snippets = getSnippets(helper, snippetPayload);

  // Some models have prompts that need two passes. This lets us pass the compiled prefix/suffix
  // into either the 2nd template to generate a raw string, or to pass prefix, suffix to a FIM endpoint
  if (compilePrefixSuffix) {
    [prefix, suffix] = compilePrefixSuffix(
      prefix,
      suffix,
      helper.filepath,
      reponame,
      snippets,
      helper.workspaceUris,
    );
  } else {
    const formattedSnippets = formatSnippets(helper, snippets, workspaceDirs);
    prefix = [formattedSnippets, prefix].join("\n");
  }

  // CodeAware: 如果有上下文信息，增强prefix和suffix
  if (helper.input.codeAwareContext) {
    prefix = enhancePrefixWithCodeAwareContext(prefix, helper.input.codeAwareContext);
    suffix = enhanceSuffixWithCodeAwareContext(suffix, helper.input.codeAwareContext);
  }

  const prompt =
    // Templates can be passed as a Handlebars template string or a function
    typeof template === "string"
      ? renderStringTemplate(
          template,
          prefix,
          suffix,
          helper.lang,
          helper.filepath,
          reponame,
          helper.input.codeAwareContext, // CodeAware: 传递上下文
        )
      : template(
          prefix,
          suffix,
          helper.filepath,
          reponame,
          helper.lang.name,
          snippets,
          helper.workspaceUris,
        );

  const stopTokens = getStopTokens(
    completionOptions,
    helper.lang,
    helper.modelName,
  );

  return {
    prompt,
    prefix,
    suffix,
    completionOptions: {
      ...completionOptions,
      stop: stopTokens,
    },
  };
}
