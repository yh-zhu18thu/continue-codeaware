import { ConfigHandler } from "../config/ConfigHandler.js";
import { TRIAL_FIM_MODEL } from "../config/onboarding.js";
import { IDE, ILLM } from "../index.js";
import OpenAI from "../llm/llms/OpenAI.js";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../util/parameters.js";

import { shouldCompleteMultiline } from "./classification/shouldCompleteMultiline.js";
import { ContextRetrievalService } from "./context/ContextRetrievalService.js";
import { BracketMatchingService } from "./filtering/BracketMatchingService.js";
import { CompletionStreamer } from "./generation/CompletionStreamer.js";
import { postprocessCompletion } from "./postprocessing/index.js";
import { shouldPrefilter } from "./prefiltering/index.js";
import { getAllSnippets } from "./snippets/index.js";
import { renderPrompt } from "./templating/index.js";
import { GetLspDefinitionsFunction } from "./types.js";
import { AutocompleteDebouncer } from "./util/AutocompleteDebouncer.js";
import { AutocompleteLoggingService } from "./util/AutocompleteLoggingService.js";
import AutocompleteLruCache from "./util/AutocompleteLruCache.js";
import { HelperVars } from "./util/HelperVars.js";
import { AutocompleteInput, AutocompleteOutcome } from "./util/types.js";

const autocompleteCache = AutocompleteLruCache.get();

// Errors that can be expected on occasion even during normal functioning should not be shown.
// Not worth disrupting the user to tell them that a single autocomplete request didn't go through
const ERRORS_TO_IGNORE = [
  // From Ollama
  "unexpected server status",
  "operation was aborted",
];

export class CompletionProvider {
  private autocompleteCache = AutocompleteLruCache.get();
  public errorsShown: Set<string> = new Set();
  private bracketMatchingService = new BracketMatchingService();
  private debouncer = new AutocompleteDebouncer();
  private completionStreamer: CompletionStreamer;
  private loggingService = new AutocompleteLoggingService();
  private contextRetrievalService: ContextRetrievalService;

  constructor(
    private readonly configHandler: ConfigHandler,
    private readonly ide: IDE,
    private readonly _injectedGetLlm: () => Promise<ILLM | undefined>,
    private readonly _onError: (e: any) => void,
    private readonly getDefinitionsFromLsp: GetLspDefinitionsFunction,
    private readonly _onCodeAwareEvent?: (eventType: string, data: any) => Promise<void>,
  ) {
    this.completionStreamer = new CompletionStreamer(this.onError.bind(this));
    this.contextRetrievalService = new ContextRetrievalService(this.ide);
  }

private async _prepareLlm(): Promise<ILLM | undefined> {
    const llm = await this._injectedGetLlm();

    console.log("getting llm",llm?.title);

    if (!llm) {
      return undefined;
    }

    // Temporary fix for JetBrains autocomplete bug as described in https://github.com/continuedev/continue/pull/3022
    if (llm.model === undefined && llm.completionOptions?.model !== undefined) {
      llm.model = llm.completionOptions.model;
    }

    // Ignore empty API keys for Mistral since we currently write
    // a template provider without one during onboarding
    if (llm.providerName === "mistral" && llm.apiKey === "") {
      return undefined;
    }

    // Set temperature (but don't override)
    if (llm.completionOptions.temperature === undefined) {
      llm.completionOptions.temperature = 0.01;
    }

    if (llm instanceof OpenAI) {
      llm.useLegacyCompletionsEndpoint = true;
    } else if (
      llm.providerName === "free-trial" &&
      llm.model !== TRIAL_FIM_MODEL
    ) {
      llm.model = TRIAL_FIM_MODEL;
    }

    return llm;
  }

  private onError(e: any) {
    if (
      ERRORS_TO_IGNORE.some((err) =>
        typeof e === "string" ? e.includes(err) : e?.message?.includes(err),
      )
    ) {
      return;
    }

    console.warn("Error generating autocompletion: ", e);
    if (!this.errorsShown.has(e.message)) {
      this.errorsShown.add(e.message);
      this._onError(e);
    }
  }

  public cancel() {
    console.log("🔄 [CodeAware Core] CompletionProvider.cancel() called");
    this.loggingService.cancel();
    
    // CodeAware: 发送代码补全取消事件
    if (this._onCodeAwareEvent) {
      console.log("📤 [CodeAware Core] Sending codeCompletionRejected event...");
      this._onCodeAwareEvent("codeCompletionRejected", {
        timestamp: new Date().toISOString(),
        reason: "User cancelled completion"
      })
        .then(() => console.log("✅ [CodeAware Core] codeCompletionRejected event sent successfully"))
        .catch(error => console.error("❌ [CodeAware Core] Failed to send completion rejected event:", error));
    } else {
      console.log("⚠️ [CodeAware Core] No CodeAware event handler available");
    }
  }

  public accept(completionId: string) {
    console.log("🔄 [CodeAware Core] CompletionProvider.accept() called with completionId:", completionId);
    const outcome = this.loggingService.accept(completionId);
    if (!outcome) {
      console.log("⚠️ [CodeAware Core] No outcome available for completion ID:", completionId);
      return;
    }
    this.bracketMatchingService.handleAcceptedCompletion(
      outcome.completion,
      outcome.filepath,
    );
    
    // CodeAware: 发送代码补全确认事件
    if (this._onCodeAwareEvent) {
      console.log("📤 [CodeAware Core] Sending codeCompletionAccepted event...", {
        completionId: completionId,
        outcomeFields: Object.keys(outcome),
        completionLength: outcome.completion.length
      });
      this._onCodeAwareEvent("codeCompletionAccepted", {
        completionId: completionId,
        outcome: outcome,
        timestamp: new Date().toISOString()
      })
        .then(() => console.log("✅ [CodeAware Core] codeCompletionAccepted event sent successfully"))
        .catch(error => console.error("❌ [CodeAware Core] Failed to send completion accepted event:", error));
    } else {
      console.log("⚠️ [CodeAware Core] No CodeAware event handler available");
    }
  }

  public markDisplayed(completionId: string, outcome: AutocompleteOutcome) {
    this.loggingService.markDisplayed(completionId, outcome);
  }

  private async _getAutocompleteOptions() {
    const { config } = await this.configHandler.loadConfig();
    const options = {
      ...DEFAULT_AUTOCOMPLETE_OPTS,
      ...config?.tabAutocompleteOptions,
    };
    return options;
  }

  public async provideInlineCompletionItems(
    input: AutocompleteInput,
    token: AbortSignal | undefined,
  ): Promise<AutocompleteOutcome | undefined> {
    try {
      // Create abort signal if not given
      if (!token) {
        const controller = this.loggingService.createAbortController(
          input.completionId,
        );
        token = controller.signal;
      }
      const startTime = Date.now();
      const options = await this._getAutocompleteOptions();

      // Debounce
      if (await this.debouncer.delayAndShouldDebounce(options.debounceDelay)) {
        return undefined;
      }

      console.log("CompletionProvider: Begin Preparation");

      const llm = await this._prepareLlm();
      if (!llm) {
        console.log("No completion llm");
        return undefined;
      }

      const helper = await HelperVars.create(
        input,
        options,
        llm.model,
        this.ide,
      );

      if (await shouldPrefilter(helper, this.ide)) {
        return undefined;
      }

      const [snippetPayload, workspaceDirs] = await Promise.all([
        getAllSnippets({
          helper,
          ide: this.ide,
          getDefinitionsFromLsp: this.getDefinitionsFromLsp,
          contextRetrievalService: this.contextRetrievalService,
        }),
        this.ide.getWorkspaceDirs(),
      ]);

      console.log("CompletionProvider: Generating prompt:");

      const { prompt, prefix, suffix, completionOptions } = renderPrompt({
        snippetPayload,
        workspaceDirs,
        helper,
      });

      console.log("CompletionProvider: Generated prompt:", prompt);

      // Completion
      let completion: string | undefined = "";

      const cache = await autocompleteCache;
      const cachedCompletion = helper.options.useCache
        ? await cache.get(helper.prunedPrefix)
        : undefined;
      let cacheHit = false;
      if (cachedCompletion) {
        // Cache
        cacheHit = true;
        completion = cachedCompletion;
      } else {
        const multiline =
          !helper.options.transform || shouldCompleteMultiline(helper);

        const completionStream =
          this.completionStreamer.streamCompletionWithFilters(
            token,
            llm,
            prefix,
            suffix,
            prompt,
            multiline,
            completionOptions,
            helper,
          );

        for await (const update of completionStream) {
          completion += update;
        }

        // Don't postprocess if aborted
        if (token.aborted) {
          return undefined;
        }

        console.log("CompletionProvider completion:", completion);

        const processedCompletion = helper.options.transform
          ? postprocessCompletion({
              completion,
              prefix: helper.prunedPrefix,
              suffix: helper.prunedSuffix,
              llm,
            })
          : completion;

        completion = processedCompletion;
        console.log("CompletionProvider: Postprocessed completion:", processedCompletion);
      }

      if (!completion) {
        return undefined;
      }

      const outcome: AutocompleteOutcome = {
        time: Date.now() - startTime,
        completion,
        prefix,
        suffix,
        prompt,
        modelProvider: llm.providerName,
        modelName: llm.model,
        completionOptions,
        cacheHit,
        filepath: helper.filepath,
        numLines: completion.split("\n").length,
        completionId: helper.input.completionId,
        gitRepo: await this.ide.getRepoName(helper.filepath),
        uniqueId: await this.ide.getUniqueId(),
        timestamp: Date.now(),
        ...helper.options,
      };

      //////////

      // Save to cache
      if (!outcome.cacheHit && helper.options.useCache) {
        void (await this.autocompleteCache).put(outcome.prefix, outcome.completion);
      }

      // When using the JetBrains extension, Mark as displayed
      const ideType = (await this.ide.getIdeInfo()).ideType;
      if (ideType === "jetbrains") {
        this.markDisplayed(input.completionId, outcome);
      }

      console.log("CompletionProvider: Autocompletion completed:", {
        time: outcome.time,
        model: outcome.modelName,
        provider: outcome.modelProvider,
        cacheHit: outcome.cacheHit,
        filepath: outcome.filepath,
        content: outcome.completion,
      });

      return outcome;
    } catch (e: any) {
      this.onError(e);
    } finally {
      this.loggingService.deleteAbortController(input.completionId);
    }
  }
}
