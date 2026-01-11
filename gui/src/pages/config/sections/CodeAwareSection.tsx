import { ModelDescription } from "core";
import { useContext } from "react";
import { Card, Divider } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { updateConfig } from "../../../redux/slices/configSlice";
import { ConfigHeader } from "../components/ConfigHeader";
import ModelRoleSelector from "../components/ModelRoleSelector";

export function CodeAwareSection() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);

  const config = useAppSelector((state) => state.config.config);
  const modelsByRole = config.modelsByRole;
  const availableModels = Object.values(modelsByRole).flat();

  const codeGenerationModel = config.codeAware?.codeGeneration?.model ?? null;
  const codeGenerationSystemMessage =
    config.codeAware?.codeGeneration?.systemMessage ?? "";
  const jsonGenerationModel = config.codeAware?.jsonGeneration?.model ?? null;
  const jsonGenerationSystemMessage =
    config.codeAware?.jsonGeneration?.systemMessage ?? "";

  function handleCodeGenerationModelChange(model: ModelDescription | null) {
    const updatedConfig = {
      ...config,
      codeAware: {
        ...config.codeAware,
        codeGeneration: {
          ...config.codeAware?.codeGeneration,
          model,
        },
      },
    };
    dispatch(updateConfig(updatedConfig));
  }

  function handleCodeGenerationSystemMessageChange(message: string) {
    const updatedConfig = {
      ...config,
      codeAware: {
        ...config.codeAware,
        codeGeneration: {
          ...config.codeAware?.codeGeneration,
          systemMessage: message,
        },
      },
    };
    dispatch(updateConfig(updatedConfig));
  }

  function handleJsonGenerationModelChange(model: ModelDescription | null) {
    const updatedConfig = {
      ...config,
      codeAware: {
        ...config.codeAware,
        jsonGeneration: {
          ...config.codeAware?.jsonGeneration,
          model,
        },
      },
    };
    dispatch(updateConfig(updatedConfig));
  }

  function handleJsonGenerationSystemMessageChange(message: string) {
    const updatedConfig = {
      ...config,
      codeAware: {
        ...config.codeAware,
        jsonGeneration: {
          ...config.codeAware?.jsonGeneration,
          systemMessage: message,
        },
      },
    };
    dispatch(updateConfig(updatedConfig));
  }

  return (
    <>
      <ConfigHeader
        title="CodeAware 设置"
        subtext="配置代码生成和 JSON 生成使用的模型和系统消息"
      />

      <Card className="mt-4 space-y-6 p-4">
        {/* Code Generation Settings */}
        <div>
          <h3 className="mb-3 text-lg font-semibold">代码生成</h3>
          <p className="mb-4 text-sm text-gray-500">
            用于生成原始代码的模型配置（如 edit_existing_file 工具）
          </p>

          <div className="space-y-4">
            <ModelRoleSelector
              models={availableModels}
              selectedModel={codeGenerationModel}
              onSelect={handleCodeGenerationModelChange}
              displayName="模型"
              description="用于生成原始代码的模型（如 edit_existing_file 工具）"
              setupURL="https://docs.continue.dev/customize/model-providers"
            />

            <div>
              <label className="mb-2 block text-sm font-medium">
                系统消息（可选）
              </label>
              <textarea
                className="resize-vertical w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="留空使用默认的代码生成系统消息..."
                value={codeGenerationSystemMessage}
                onChange={(e) =>
                  handleCodeGenerationSystemMessageChange(e.target.value)
                }
              />
              <p className="mt-1 text-xs text-gray-400">
                默认消息强调生成纯代码，无需 JSON 格式
              </p>
            </div>
          </div>
        </div>

        <Divider />

        {/* JSON Generation Settings */}
        <div>
          <h3 className="mb-3 text-lg font-semibold">JSON 生成</h3>
          <p className="mb-4 text-sm text-gray-500">
            用于生成结构化 JSON 响应的模型配置（如知识卡片、步骤生成等）
          </p>

          <div className="space-y-4">
            <ModelRoleSelector
              models={availableModels}
              selectedModel={jsonGenerationModel}
              onSelect={handleJsonGenerationModelChange}
              displayName="模型"
              description="用于生成结构化 JSON 响应的模型（如知识卡片、步骤生成等）"
              setupURL="https://docs.continue.dev/customize/model-providers"
            />

            <div>
              <label className="mb-2 block text-sm font-medium">
                系统消息（可选）
              </label>
              <textarea
                className="resize-vertical w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="留空使用默认的 JSON 生成系统消息..."
                value={jsonGenerationSystemMessage}
                onChange={(e) =>
                  handleJsonGenerationSystemMessageChange(e.target.value)
                }
              />
              <p className="mt-1 text-xs text-gray-400">
                默认消息强调生成结构化 JSON 响应
              </p>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
