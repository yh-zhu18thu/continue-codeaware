import { RouterProvider, createMemoryRouter } from "react-router-dom";
import Layout from "./components/Layout";
import { SubmenuContextProvidersProvider } from "./context/SubmenuContextProviders";
import { VscThemeProvider } from "./context/VscTheme";
import useSetup from "./hooks/useSetup";
//CodeAware: import the pages needed in CodeAware
import { Chat } from "./pages/codeaware-main/Chat";
import { CodeAware } from "./pages/codeaware-main/CodeAware";
import Navbar from "./pages/codeaware-main/Navbar";
import { Quiz } from "./pages/codeaware-main/Quiz";
import ErrorPage from "./pages/error";
import { ROUTES } from "./util/navigation";

const router = createMemoryRouter([
  {
    path: ROUTES.HOME,
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      //CA:changed the home page to CodeAware
      {
        path: "/index.html",
        element: <CodeAware/>,
      },
      {
        path: ROUTES.HOME,
        element: <CodeAware/>,
      },
      {
        path: "/chat",
        element: <Chat />,
      },
      {
        path: "/quiz",
        element: <Quiz />,
      }
    ],
  },
]);

/*
  Prevents entire app from rerendering continuously with useSetup in App
  TODO - look into a more redux-esque way to do this
*/
function SetupListeners() {
  useSetup();
  return <></>;
}

function App() {
  return (
    <VscThemeProvider>
      <SubmenuContextProvidersProvider>
        <Navbar />
        <RouterProvider router={router} />
      </SubmenuContextProvidersProvider>
      <SetupListeners />
    </VscThemeProvider>
  );
}

export default App;
