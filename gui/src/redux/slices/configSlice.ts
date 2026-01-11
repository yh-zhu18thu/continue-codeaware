import { ConfigResult, ConfigValidationError } from "@continuedev/config-yaml";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { BrowserSerializedContinueConfig } from "core";
import { DEFAULT_MAX_TOKENS } from "core/llm/constants";

export type ConfigState = {
  configError: ConfigValidationError[] | undefined;
  config: BrowserSerializedContinueConfig;
  loading: boolean;
};

export const EMPTY_CONFIG: BrowserSerializedContinueConfig = {
  slashCommands: [],
  contextProviders: [],
  tools: [],
  mcpServerStatuses: [],
  usePlatform: true,
  modelsByRole: {
    chat: [],
    apply: [],
    edit: [],
    summarize: [],
    autocomplete: [],
    rerank: [],
    embed: [],
  },
  selectedModelByRole: {
    chat: null,
    apply: null,
    edit: null,
    summarize: null,
    autocomplete: null,
    rerank: null,
    embed: null,
  },
  rules: [],
  // CodeAware specific configurations
  codeAware: {
    codeGeneration: {
      model: null,
      systemMessage: undefined,
    },
    jsonGeneration: {
      model: null,
      systemMessage: undefined,
    },
  },
};

export const INITIAL_CONFIG_SLICE: ConfigState = {
  configError: undefined,
  config: EMPTY_CONFIG,
  loading: false,
};

export const configSlice = createSlice({
  name: "config",
  initialState: INITIAL_CONFIG_SLICE,
  reducers: {
    setConfigResult: (
      state,
      {
        payload: result,
      }: PayloadAction<ConfigResult<BrowserSerializedContinueConfig>>,
    ) => {
      const { config, errors } = result;
      if (!errors || errors.length === 0) {
        state.configError = undefined;
      } else {
        state.configError = errors;
      }

      // If an error is found in config on save,
      // We must invalidate the GUI config too,
      // Since core won't be able to load config
      // Don't invalidate the loaded config
      if (!config) {
        state.config = EMPTY_CONFIG;
      } else {
        state.config = config;
      }
      state.loading = false;
    },
    updateConfig: (
      state,
      { payload: config }: PayloadAction<BrowserSerializedContinueConfig>,
    ) => {
      state.config = config;
    },
    setConfigLoading: (state, { payload: loading }: PayloadAction<boolean>) => {
      state.loading = loading;
    },
  },
  selectors: {
    selectSelectedChatModelContextLength: (state): number => {
      return (
        state.config.selectedModelByRole.chat?.contextLength ||
        DEFAULT_MAX_TOKENS
      );
    },
    selectSelectedChatModel: (state) => {
      return state.config.selectedModelByRole.chat;
    },
    selectUIConfig: (state) => {
      return state.config?.ui ?? null;
    },
    // CodeAware: Select code generation model (fallback to chat model)
    selectCodeGenerationModel: (state) => {
      return (
        state.config.codeAware?.codeGeneration?.model ??
        state.config.selectedModelByRole.chat
      );
    },
    // CodeAware: Select code generation system message
    selectCodeGenerationSystemMessage: (state) => {
      return state.config.codeAware?.codeGeneration?.systemMessage;
    },
    // CodeAware: Select json generation model (fallback to chat model)
    selectJsonGenerationModel: (state) => {
      return (
        state.config.codeAware?.jsonGeneration?.model ??
        state.config.selectedModelByRole.chat
      );
    },
    // CodeAware: Select json generation system message
    selectJsonGenerationSystemMessage: (state) => {
      return state.config.codeAware?.jsonGeneration?.systemMessage;
    },
  },
});

export const { updateConfig, setConfigResult, setConfigLoading } =
  configSlice.actions;

export const {
  selectSelectedChatModelContextLength,
  selectUIConfig,
  selectSelectedChatModel,
  selectCodeGenerationModel,
  selectCodeGenerationSystemMessage,
  selectJsonGenerationModel,
  selectJsonGenerationSystemMessage,
} = configSlice.selectors;

export default configSlice.reducer;
