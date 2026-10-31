import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Athlete from './pages/Athlete'
import Upload from './pages/Upload'
import Analysis from './pages/Analysis'
import Report from './pages/Report'
import History from './pages/History'
import About from './pages/About'
import Sneakers from './pages/Sneakers'
import MLPredict from './pages/MLPredict'

function App() {
  return (
    <>
      <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/athlete" element={<Athlete />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/analysis/:taskId" element={<Analysis />} />
        <Route path="/report/:taskId" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/about" element={<About />} />
        <Route path="/sneakers" element={<Sneakers />} />
        <Route path="/ml-predict" element={<MLPredict />} />
      </Route>
    </Routes>
    </>
  )
}

export default App
