import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        expand={false}
        gap={8}
        offset={16}
        closeButton
        toastOptions={{
          duration: 3000,
          style: {
            fontFamily: "inherit",
          },
        }}
      />
      <RouterProvider router={router} />
    </>
  );
}
