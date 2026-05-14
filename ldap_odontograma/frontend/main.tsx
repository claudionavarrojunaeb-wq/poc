import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Login from "./src/Login"

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("No se encontró el contenedor root");
}

  createRoot(rootElement).render(
    <StrictMode>
      <Login />
    </StrictMode>
  );