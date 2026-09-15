import { BrowserRouter } from "react-router-dom";
import FrontendApp from "../frontend/src/App";
import { AuthProvider } from "../frontend/src/lib/auth-context";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FrontendApp />
      </AuthProvider>
    </BrowserRouter>
  );
}
