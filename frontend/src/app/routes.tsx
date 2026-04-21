import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./components/layout";
import { HomePage } from "./components/home-page";

// Heavy pages are code-split: their JS only downloads when the user first
// navigates to that route.  admin-page + recharts alone are ~840 KB parsed;
// keeping them out of the initial bundle cuts first-paint JS by ~70 %.
const ModelCatalog      = lazy(() => import("./components/model-catalog").then((m) => ({ default: m.ModelCatalog })));
const ApplyPage         = lazy(() => import("./components/apply-page").then((m) => ({ default: m.ApplyPage })));
const AdminPage         = lazy(() => import("./components/admin-page").then((m) => ({ default: m.AdminPage })));
const CodeExamples      = lazy(() => import("./components/code-examples").then((m) => ({ default: m.CodeExamples })));
const NotificationsPage = lazy(() => import("./components/notifications-page").then((m) => ({ default: m.NotificationsPage })));
const LogsPage          = lazy(() => import("./components/logs-page").then((m) => ({ default: m.LogsPage })));
const StatsPage         = lazy(() => import("./components/stats-page").then((m) => ({ default: m.StatsPage })));
const ForumPage         = lazy(() => import("./components/forum-page").then((m) => ({ default: m.ForumPage })));
const ForumPostPage     = lazy(() => import("./components/forum-post-page").then((m) => ({ default: m.ForumPostPage })));

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true,         Component: HomePage },
      { path: "models",      Component: ModelCatalog },
      { path: "apply",       Component: ApplyPage },
      { path: "admin",       Component: AdminPage },
      { path: "examples",    Component: CodeExamples },
      { path: "notifications", Component: NotificationsPage },
      { path: "logs",        Component: LogsPage },
      { path: "stats",       Component: StatsPage },
      { path: "forum",       Component: ForumPage },
      { path: "forum/:id",   Component: ForumPostPage },
    ],
  },
]);
