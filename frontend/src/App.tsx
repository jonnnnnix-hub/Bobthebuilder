import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Signals from './pages/Signals'
import Backtest from './pages/Backtest'
import Universe from './pages/Universe'
import Runs from './pages/Runs'
import Trading from './pages/Trading'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/signals" element={<Signals />} />
        <Route path="/backtest" element={<Backtest />} />
        <Route path="/universe" element={<Universe />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/trading" element={<Trading />} />
      </Route>
    </Routes>
  )
}
