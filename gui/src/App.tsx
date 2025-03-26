import { RouterProvider, createMemoryRouter } from "react-router-dom";
import Layout from "./components/Layout";
import { SubmenuContextProvidersProvider } from "./context/SubmenuContextProviders";
import { VscThemeProvider } from "./context/VscTheme";
import useSetup from "./hooks/useSetup";
//CodeAware: import the pages needed in CodeAware
import { Chat } from "./pages/codeaware/Chat";
import { CodeAware } from "./pages/codeaware/CodeAware";
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
        <RouterProvider router={router} />
      </SubmenuContextProvidersProvider>
      <SetupListeners />
    </VscThemeProvider>
  );
}

export default App;
