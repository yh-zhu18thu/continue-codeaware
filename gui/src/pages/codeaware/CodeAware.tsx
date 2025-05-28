/*
CATODO-BP: 
1. 一个输入框，用来输入项目需求和用户知识状态。AI处理后会把更新后的项目需求与用户知识状态返回到这两个框里
2. 下方是一个滚动视图，各个步骤可以收缩展开，展开后有步骤简介和之后添加的知识卡片。
3. 知识卡片上的交互可能
  a. 发送指令到IDE，高亮对应的内容
  b. 跳转到chat，并传输对应的context
  c. 跳转到quiz，并传输对应的context
*/
import { useCallback, useContext } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectIsRequirementInEditMode,
  setUserRequirementStatus
} from "../../redux/slices/codeAwareSlice";
import {
  generateStepsFromRequirement,
  paraphraseUserIntent
} from "../../redux/thunks/codeAwareGeneration";
import "./CodeAware.css";

export const CodeAware = () => {
  //import the idemessenger that will communicate between core, gui and IDE
  const ideMessenger = useContext(IdeMessengerContext);

  const dispatch = useAppDispatch();

  //CodeAware: 增加一个指令，使得可以发送当前所选择的知识卡片id
  //CATODO: 参照着codeContextProvider的实现，利用上getAllSnippets的获取最近代码的功能，然后再通过coreToWebview的路径发送更新过来。
  
  //从redux中获取项目需求相关的数据
  // 当前requirement部分应该使用
  const isEditMode = useAppSelector(selectIsRequirementInEditMode);
  // 获取可能有的requirement内容
  const userRequirement = useAppSelector(
    (state) => state.codeAwareSession.userRequirement
  );
  const userRequirementStatus = useAppSelector(
    (state) => state.codeAwareSession.userRequirement?.requirementStatus
  );
  // 获取当前高亮的关键词

  const AIPolishUserRequirement = useCallback(
    () => {
      if (!userRequirement) {
        return;
      }
      dispatch(setUserRequirementStatus("paraphrasing"));
      dispatch(
        paraphraseUserIntent({ programRequirement: userRequirement})
      ).then(() => {
        dispatch(setUserRequirementStatus("empty"));
      });
    },
    [dispatch, userRequirement]
  );

  const AIHandleRequirementConfirmation = useCallback(
    () => {
      if (!userRequirement) {
        return;
      }
      dispatch(setUserRequirementStatus("confirmed"));
      dispatch(generateStepsFromRequirement({ userRequirement: userRequirement.requirementDescription }))
        .then(() => {
          dispatch(setUserRequirementStatus("finalized"));
        });
    }
  , [dispatch, userRequirement]
  );

  


  

};


