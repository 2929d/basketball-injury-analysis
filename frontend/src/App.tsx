import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Athlete from './pages/Athlete'
import Upload from './pages/Upload'
import Analysis from './pages/Analysis'
import Report from './pages/Report'
import History from './pages/History'
import About from './pages/About'
import Methodology from './pages/Methodology'
import MLPredict from './pages/MLPredict'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/athlete" element={<Athlete />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/analysis/:taskId" element={<Analysis />} />
        <Route path="/report/:taskId" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/about" element={<About />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/ml-predict" element={<MLPredict />} />
      </Route>
    </Routes>
  )
}

export default App
