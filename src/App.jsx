import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import './App.css'
import AudioPage from './pages/AudioPage';
import Register from './components/Auth/Register/Register';
import ResetPassoword from './components/Auth/ResetPassword/ResetPassword';
import Login from './components/Auth/Login/Login';


function App() {

  return (
    <Router>
      <Routes>
        <Route path="/" element={<AudioPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassoword />} />
      </Routes>
    </Router>
  )
}

export default App;
