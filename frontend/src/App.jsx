import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Lobby from './pages/Lobby'
import Mesa from './pages/Mesa'
import Cuenta from './pages/Cuenta'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mesa/:code"
        element={
          <ProtectedRoute>
            <Mesa />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cuenta"
        element={
          <ProtectedRoute>
            <Cuenta />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
