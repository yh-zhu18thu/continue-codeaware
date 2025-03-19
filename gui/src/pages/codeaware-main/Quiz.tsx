import { useLocation } from "react-router-dom";


export const Quiz = () => {
    //CodeAware: get the knowledgeId from the location state
    const location = useLocation();
    const fromChatKnowledgeId = location.state?.knowledgeId;

    return <div>Hello World</div>;
};
  
  
  