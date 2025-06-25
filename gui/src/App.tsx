import { RouterProvider, createMemoryRouter } from "react-router-dom";
import Layout from "./components/Layout";
import { SubmenuContextProvidersProvider } from "./context/SubmenuContextProviders";
import { VscThemeProvider } from "./context/VscTheme";
import useSetup from "./hooks/useSetup";
//CodeAware: import the pages needed in CodeAware
import { AddNewModel, ConfigureProvider } from "./pages/AddNewModel";
import { Chat } from "./pages/codeaware/Chat";
import { CodeAware } from "./pages/codeaware/CodeAware";
import ConfigPage from "./pages/config";
import ConfigErrorPage from "./pages/config-error";
import ErrorPage from "./pages/error";
import MorePage from "./pages/More";
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
        path: "/addModel",
        element: <AddNewModel />,
      },
      {
        path: "/addModel/provider/:providerName",
        element: <ConfigureProvider />,
      },
      {
        path: "/more",
        element: <MorePage />,
      },
      {
        path: ROUTES.CONFIG_ERROR,
        element: <ConfigErrorPage />,
      },
      {
        path: ROUTES.CONFIG,
        element: <ConfigPage />,
      },
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
