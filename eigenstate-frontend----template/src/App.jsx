import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const MotionDiv = motion.div;
import Sidebar from './components/Sidebar';
import Explorer from './pages/Explorer';
import HistoryPage from './pages/HistoryPage';
import GitIntelligence from './pages/GitIntelligence';
import SettingsPage from './pages/SettingsPage';
import RepoAnalyser from './pages/RepoAnalyser';
import Pricing from './pages/Pricing';
import CoverPage from './components/CoverPage';
import Dashboard from './pages/Dashboard';

function AppContent() {
  const [showCover, setShowCover] = useState(() => {
    return !sessionStorage.getItem('coverShown');
  });

  const handleCoverComplete = () => {
    sessionStorage.setItem('coverShown', 'true');
    setShowCover(false);
  };

  return (
    <AnimatePresence mode="wait">
      {showCover ? (
        <CoverPage key="cover" onComplete={handleCoverComplete} />
      ) : (
        <MotionDiv
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="es-app-shell flex h-screen overflow-hidden font-sans text-github-text-primary selection:bg-github-blue/25"
        >
          <Sidebar />

          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/explorer" element={<Explorer />} />
                <Route path="/analyser" element={<RepoAnalyser />} />
                <Route path="/git" element={<GitIntelligence />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route
                  path="*"
                  element={
                    <div className="es-page flex min-h-[50vh] items-center justify-center es-body">Page not found</div>
                  }
                />
              </Routes>
            </main>
          </div>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
