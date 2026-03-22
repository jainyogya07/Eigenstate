import React, { useState } from 'react';
import { motion } from 'framer-motion';
import FileTree from '../components/FileTree';
import WhyPanel from '../components/WhyPanel';

const MotionDiv = motion.div;

const Explorer = () => {
  const [selectedFunction, setSelectedFunction] = useState(null);

  return (
    <MotionDiv
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex h-full min-h-0 min-w-0 bg-github-bg-primary overflow-hidden"
    >
      {/* Search & Registry (Left Panel) */}
      <MotionDiv
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="relative z-10 flex min-h-0 min-w-0 w-[400px] shrink-0 flex-col border-r border-github-border bg-github-bg-secondary px-6 py-8 md:w-[440px] md:px-8 md:py-10"
      >
        <div className="mb-8 space-y-1">
          <p className="es-overline text-github-text-secondary">Registry</p>
          <h2 className="es-h2 text-white">Code map</h2>
          <p className="es-body text-xs">Browse files and symbols with confidence scores.</p>
        </div>
        <FileTree onSelect={setSelectedFunction} selectedName={selectedFunction?.name} />
      </MotionDiv>

      {/* Decision Engine (Right Panel) */}
      <MotionDiv
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <WhyPanel selectedFunction={selectedFunction} />
      </MotionDiv>
    </MotionDiv>
  );
};

export default Explorer;