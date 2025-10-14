import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import './App.css'
import Register from './components/Auth/Register/Register';
import Login from './components/Auth/Login/Login';
import Application from './Application';


function App() {

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Application />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </Router>
  )
}

export default App;
