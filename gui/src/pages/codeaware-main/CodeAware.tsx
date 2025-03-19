/*
CATODO-BP: 
1. 两个输入框，用来输入项目需求和用户知识状态。AI处理后会把更新后的项目需求与用户知识状态返回到这两个框里
2. 下方是一个滚动视图，各个步骤可以收缩展开，展开后有步骤简介和之后添加的知识卡片。
3. 知识卡片上的交互可能
  a. 发送指令到IDE，高亮对应的内容
  b. 跳转到chat，并传输对应的context
  c. 跳转到quiz，并传输对应的context
*/
import { useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppSelector } from "../../redux/hooks";
import { selectDefaultModel } from "../../redux/slices/configSlice";




export const CodeAware = () => {
  //CodeAware: import the idemessenger that will communicate between core, gui and IDE
  const ideMessenger = useContext(IdeMessengerContext);

  //CodeAware: the navigation function to navigate to chat or quiz, and pass the knowledgeId
  const navigate = useNavigate();

  const handleNavigateToQuiz = (kId: Number) => {
    navigate("/quiz", {state: {knowledgeId: kId}});
  };

  const handleNavigateToChat = (kId: Number) => {
    navigate("/chat", {state: {knowledgeId: kId}});
  };

  // CodeAware: 使用 useAppSelector 获取 defaultModel
  const defaultModel = useAppSelector(selectDefaultModel);
  if (!defaultModel) {
    throw new Error("Default model not defined");
  }
  
  //CodeAware: 使用 ideMessenger.request 发送攒好的prompt到core，获取LLM的返回结果
  const llmParaphraseUserIntent = useCallback(
    async (userIntent:string, userMastery:string): Promise<string> => {
      try {
        //CATODO: 构造补全用户意图的提示词
        const paraphrasePrompt = `Paraphrase the following user intent: ${prompt}`;
        const options = {};

        const title = defaultModel.title;
        // 调用 ideMessenger.request 并等待响应
        const response = await ideMessenger.request("llm/complete", {
          completionOptions: options,
          prompt: paraphrasePrompt,
          title: title,
        });

        if (response.status !== "success") {
          throw new Error("LLM request failed");
        }

        // CATODO: 使用LLM返回的结果解析并构建更新知识卡片列表（参考Chat中的history，使用redux的套路来维护，用useAppSelector来绑定数据）
        return response.content;
      } catch (error) {
        console.error("Error during LLM request:", error);
        throw new Error("Failed to fetch LLM response");
        //CATODO: 这里应该有一个UI提示，告诉用户请求失败了
      }
    },
    [ideMessenger] // 依赖项：ideMessenger
  );

  //CodeAware: 增加一个指令，使得可以发送当前所选择的知识卡片id





  return <div>Hello World</div>;
};


