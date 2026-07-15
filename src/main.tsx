import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import "@flaticon/flaticon-uicons/css/brands/all.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
