import {BrowserRouter as Router, Routes, Route} from "react-router-dom";

import "./App.css";
import AudioPage from "./pages/AudioPage";
import Register from "./components/Auth/Register/Register";
import ResetPassoword from "./components/Auth/ResetPassword/ResetPassword";
import Login from "./components/Auth/Login/Login";
import AppContextProvider from "./context/AppContext";

function App() {
  return (
    <AppContextProvider>
      <Router>
        <Routes>
          <Route path="/" element={<AudioPage />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassoword />} />
        </Routes>
      </Router>
    </AppContextProvider>
  );
}

export default App;
