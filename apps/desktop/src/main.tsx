import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import Loader from "@/components/shared/loader";
import { RUNTIME_PLATFORM_DATA_ATTRIBUTE } from "@/lib/runtime-platform";
import { routeTree } from "@/routeTree.gen";

const WINDOW_CHROME_DATA_ATTRIBUTE = "windowChrome";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => <Loader />,
  context: {},
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

const litgitWindow = Reflect.get(window, "__LITGIT__") as
  | { runtimePlatform?: string; windowChrome?: string }
  | undefined;

if (litgitWindow?.runtimePlatform) {
  document.documentElement.dataset[RUNTIME_PLATFORM_DATA_ATTRIBUTE] =
    litgitWindow.runtimePlatform;
}

if (litgitWindow?.windowChrome) {
  document.documentElement.dataset[WINDOW_CHROME_DATA_ATTRIBUTE] =
    litgitWindow.windowChrome;
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
