import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ProjectProvider } from "./store/ProjectContext";
import { Toaster } from "./components/Toast";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProjectProvider>
      <App />
      <Toaster />
    </ProjectProvider>
  </React.StrictMode>,
);
