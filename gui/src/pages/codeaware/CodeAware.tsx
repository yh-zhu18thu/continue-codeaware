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
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  setUserRequirementContent,
  setUserRequirementStatus
} from "../../redux/slices/codeAwareSlice";
import {
  paraphraseUserIntent
} from "../../redux/thunks/codeAwareGeneration";
import "./CodeAware.css";


//引入各个组件
import PolishEditor from "./PolishEditor";





export const CodeAware = () => {
  //import the idemessenger that will communicate between core, gui and IDE
  const ideMessenger = useContext(IdeMessengerContext);

  const dispatch = useAppDispatch();

  //the navigation function to navigate to chat or quiz, and pass the knowledgeId
  const navigate = useNavigate();

  const handleNavigateToQuiz = (kId: Number) => {
    navigate("/quiz", {state: {knowledgeId: kId}});
  };

  const handleNavigateToChat = (kId: Number) => {
    navigate("/chat", {state: {knowledgeId: kId}});
  };

  //CodeAware: 增加一个指令，使得可以发送当前所选择的知识卡片id

  //CATODO: 参照着codeContextProvider的实现，利用上getAllSnippets的获取最近代码的功能，然后再通过coreToWebview的路径发送更新过来。
  
  //从redux中获取项目需求相关的数据
  const userRequirement = useAppSelector((state) => state.codeAwareSession.userRequirement);
  const userCodeAwareContext = useAppSelector((state) => state.codeAwareSession.userCodeAwareContext);

  
  const updateUserRequirement = useCallback(
    (newRequirement: string) => {
      if (!userRequirement) {
        return;
      }
      dispatch(
        setUserRequirementContent(newRequirement)
      );
    },
    [dispatch, userRequirement]
  );

  
  
  const polishUserRequirement = useCallback(
    () => {
      if (!userRequirement || !userCodeAwareContext) {
        return;
      }
      dispatch(setUserRequirementStatus("processing"));
      dispatch(
        paraphraseUserIntent({ programRequirement: userRequirement, userCodeAwareContext: userCodeAwareContext })
      ).then(() => {
        dispatch(setUserRequirementStatus("resting"));
      });
    },
    [dispatch, userRequirement, userCodeAwareContext]
  );


  return(
  <main className="main-container">
    <PolishEditor
        label="项目需求"
        value={userRequirement?.requirementDescription || ""}
        loading={userRequirement?.requirementStatus === "processing"}
        className="requirement-editor"
        onChange={(text) => 
          updateUserRequirement(text)
        }
        onPolish={() => 
          polishUserRequirement()
        }
      />
  </main>
  );
};


