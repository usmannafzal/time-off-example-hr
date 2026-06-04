import React from "react";
import type { Preview } from "@storybook/react";
import { initialize, mswLoader } from "msw-storybook-addon";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../app/globals.css";
import { SessionProvider } from "../components/system/session";
import { Toaster } from "../components/system/toaster";
import { useTransitionStore } from "../lib/store/transition-store";
import { useToastStore } from "../lib/store/toast-store";
import type { UserRole } from "../lib/domain/types";

// Start the MSW worker for Storybook (TRD §6, §7).
initialize({ onUnhandledRequest: "bypass" });

function StoryProviders({
  children,
  role,
}: {
  children: React.ReactNode;
  role: UserRole;
}) {
  // Fresh query client per story so cache never leaks across stories.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  // Reset UI transition + toast stores on mount so each story is deterministic.
  React.useEffect(() => {
    useTransitionStore.getState().reset();
    useToastStore.getState().clear();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider initial={{ role }}>
        <div className="min-h-[60vh] bg-slate-50 p-6 dark:bg-slate-950">
          {children}
          <Toaster />
        </div>
      </SessionProvider>
    </QueryClientProvider>
  );
}

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: "fullscreen",
  },
  decorators: [
    (Story, context) => {
      const role = (context.parameters.role as UserRole) ?? "employee";
      return (
        <StoryProviders role={role}>
          <Story />
        </StoryProviders>
      );
    },
  ],
};

export default preview;
