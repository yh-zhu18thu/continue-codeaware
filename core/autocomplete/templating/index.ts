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
    // CodeAware: 添加上下文变量
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
  if (!codeAwareContext || 
      (!codeAwareContext.userRequirement && !codeAwareContext.currentStep && !codeAwareContext.nextStep)) {
    return prefix;
  }

  const contextParts: string[] = [];
  
  if (codeAwareContext.userRequirement) {
    contextParts.push(`# Task: ${codeAwareContext.userRequirement}`);
  }
  
  /*
  if (codeAwareContext.currentStep) {
    contextParts.push(`# Current Step: ${codeAwareContext.currentStep}`);
  }
  
  if (codeAwareContext.nextStep) {
    contextParts.push(`# Next Step: ${codeAwareContext.nextStep}`);
  }*/
  
  const contextString = contextParts.join("\n");
  return `${contextString}\n\n${prefix}`;
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

  // CodeAware: 如果有上下文信息，增强prefix
  if (helper.input.codeAwareContext) {
    prefix = enhancePrefixWithCodeAwareContext(prefix, helper.input.codeAwareContext);
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
