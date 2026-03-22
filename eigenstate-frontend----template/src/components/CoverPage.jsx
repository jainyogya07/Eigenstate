import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const MotionDiv = motion.div;

const CoverPage = ({ onComplete }) => {
  const bgCanvasRef = useRef(null);
  const graphCanvasRef = useRef(null);
  const [typedText, setTypedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  // Animation State Refs
  const graphTRef = useRef(0);
  const lastTsRef = useRef(null);
  const particlesRef = useRef([]);
  const typingRef = useRef({ qIdx: 0, charIdx: 0, typing: true });

  const queries = [
    '"why was auth.go refactored?"',
    '"what tradeoff did PR #88 make?"',
    '"show lineage of parse.go"',
  ];

  /* eslint-disable react-hooks/exhaustive-deps -- queries constant; effect syncs typing demo */
  useEffect(() => {
    // Initialize Particles
    particlesRef.current = Array.from({ length: 80 }, () => ({
      x: Math.random() * 1280,
      y: Math.random() * 720,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      opacity: Math.random() * 0.4 + 0.1
    }));

    // Typing Animation logic
    let typingTimer;
    const typeNext = () => {
      const { qIdx, charIdx, typing } = typingRef.current;
      const q = queries[qIdx];
      
      if (typing) {
        if (charIdx <= q.length) {
          setTypedText(q.slice(0, charIdx));
          typingRef.current.charIdx++;
          typingTimer = setTimeout(typeNext, typingRef.current.charIdx <= q.length ? 55 : 1200);
        } else {
          typingRef.current.typing = false;
          typingTimer = setTimeout(typeNext, 1800);
        }
      } else {
        if (charIdx > 0) {
          setTypedText(q.slice(0, charIdx - 1));
          typingRef.current.charIdx--;
          typingTimer = setTimeout(typeNext, 30);
        } else {
          typingRef.current.typing = true;
          typingRef.current.qIdx = (qIdx + 1) % queries.length;
          typingTimer = setTimeout(typeNext, 400);
        }
      }
    };
    typingTimer = setTimeout(typeNext, 2600);

    // Cursor blink
    const cursorInterval = setInterval(() => setShowCursor(prev => !prev), 400);

    // Auto-advance after 5s (click / button still skips immediately)
    const exitTimer = setTimeout(onComplete, 5000);

    return () => {
      clearTimeout(typingTimer);
      clearTimeout(exitTimer);
      clearInterval(cursorInterval);
    };
  }, [onComplete]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const graphCanvas = graphCanvasRef.current;
    if (!bgCanvas || !graphCanvas) return;

    const bgCtx = bgCanvas.getContext('2d');
    const gx = graphCanvas.getContext('2d');

    const nodes = [
      { id: 0, x: 240, y: 240, label: 'auth.go', type: 'fn', r: 28 },
      { id: 1, x: 110, y: 130, label: 'Decision\n#A14', type: 'dec', r: 22 },
      { id: 2, x: 370, y: 130, label: 'Decision\n#B22', type: 'dec', r: 22 },
      { id: 3, x: 100, y: 330, label: 'PR #88', type: 'pr', r: 18 },
      { id: 4, x: 380, y: 340, label: 'Issue\n#301', type: 'issue', r: 18 },
      { id: 5, x: 240, y: 90,  label: 'tradeoff\n:performance', type: 'tag', r: 16 },
      { id: 6, x: 160, y: 390, label: 'commit\nb3f9a', type: 'commit', r: 15 },
      { id: 7, x: 320, y: 400, label: 'commit\na1c2d', type: 'commit', r: 15 },
      { id: 8, x: 60, y: 220,  label: 'lint.go', type: 'fn', r: 20 },
      { id: 9, x: 420, y: 240, label: 'parse.go', type: 'fn', r: 20 },
    ];

    const edges = [[0,1],[0,2],[0,5],[0,3],[0,4],[1,8],[2,9],[3,6],[4,7],[1,5],[2,5]];

    const colors = {
      fn:     { fill: '#0d2a3a', stroke: '#00e5ff', text: '#b2ebf2' },
      dec:    { fill: '#1a1040', stroke: '#7c4dff', text: '#ce93d8' },
      pr:     { fill: '#0d2a1a', stroke: '#00c853', text: '#a5d6a7' },
      issue:  { fill: '#2a1a0d', stroke: '#ff9800', text: '#ffcc80' },
      tag:    { fill: '#1a2a0d', stroke: '#8bc34a', text: '#dcedc8' },
      commit: { fill: '#1a1a1a', stroke: '#546e7a', text: '#90a4ae' },
    };

    const nodeReveal = new Array(nodes.length).fill(0);
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const drawBg = () => {
      bgCtx.clearRect(0, 0, 1280, 720);
      const g = bgCtx.createRadialGradient(1050, 360, 0, 1050, 360, 560);
      g.addColorStop(0, 'rgba(0,180,255,0.06)');
      g.addColorStop(1, 'transparent');
      bgCtx.fillStyle = g;
      bgCtx.fillRect(0, 0, 1280, 720);

      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 100) {
            bgCtx.beginPath();
            bgCtx.strokeStyle = `rgba(0,200,255,${0.06 * (1 - d / 100)})`;
            bgCtx.lineWidth = 0.5;
            bgCtx.moveTo(particles[i].x, particles[i].y);
            bgCtx.lineTo(particles[j].x, particles[j].y);
            bgCtx.stroke();
          }
        }
      }

      particles.forEach(p => {
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        bgCtx.fillStyle = `rgba(0,229,255,${p.opacity})`;
        bgCtx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = 1280; if (p.x > 1280) p.x = 0;
        if (p.y < 0) p.y = 720; if (p.y > 720) p.y = 0;
      });
    };

    const drawGraph = (ts) => {
      gx.clearRect(0, 0, 480, 480);
      const graphT = graphTRef.current;

      nodes.forEach((n, i) => {
        const delay = 1.2 + i * 0.12;
        nodeReveal[i] = Math.min(1, Math.max(0, (graphT - delay) / 0.4));
      });

      edges.forEach(([a, b]) => {
        const na = nodes[a], nb = nodes[b];
        const reveal = Math.min(nodeReveal[a], nodeReveal[b]);
        if (reveal <= 0) return;
        const dx = nb.x - na.x, dy = nb.y - na.y;
        gx.save();
        gx.globalAlpha = reveal * 0.5;
        gx.beginPath();
        gx.strokeStyle = '#00e5ff';
        gx.lineWidth = 0.8;
        gx.setLineDash([4, 4]);
        gx.lineDashOffset = -ts * 0.02;
        gx.moveTo(na.x, na.y);
        gx.lineTo(nb.x, nb.y);
        gx.stroke();
        gx.restore();

        if (reveal > 0.8) {
          const angle = Math.atan2(dy, dx);
          const ex = nb.x - Math.cos(angle) * (nb.r + 4);
          const ey = nb.y - Math.sin(angle) * (nb.r + 4);
          gx.save();
          gx.globalAlpha = reveal * 0.6;
          gx.fillStyle = '#00e5ff';
          gx.translate(ex, ey);
          gx.rotate(angle);
          gx.beginPath();
          gx.moveTo(0,0); gx.lineTo(-7,-3); gx.lineTo(-7,3);
          gx.closePath(); gx.fill();
          gx.restore();
        }
      });

      nodes.forEach((n, i) => {
        const rev = easeOut(nodeReveal[i]);
        if (rev <= 0) return;
        const c = colors[n.type];
        const pulse = n.id === 0 ? 1 + 0.08 * Math.sin(graphT * 2) : 1;
        const r = n.r * pulse * rev;

        if (n.id === 0 && rev > 0.5) {
          const glw = gx.createRadialGradient(n.x, n.y, r, n.x, n.y, r * 3);
          glw.addColorStop(0, 'rgba(0,229,255,0.18)');
          glw.addColorStop(1, 'transparent');
          gx.beginPath();
          gx.arc(n.x, n.y, r * 3, 0, Math.PI*2);
          gx.fillStyle = glw;
          gx.fill();
        }

        gx.save();
        gx.globalAlpha = rev;
        gx.beginPath();
        gx.arc(n.x, n.y, r, 0, Math.PI*2);
        gx.fillStyle = c.fill;
        gx.fill();
        gx.strokeStyle = c.stroke;
        gx.lineWidth = n.id === 0 ? 2 : 1.2;
        gx.stroke();

        gx.fillStyle = c.text;
        gx.font = `${n.id === 0 ? '11px' : '9px'} Consolas, monospace`;
        gx.textAlign = 'center';
        gx.textBaseline = 'middle';
        const lines = n.label.split('\n');
        lines.forEach((line, li) => {
          gx.fillText(line, n.x, n.y + (li - (lines.length-1)/2) * 11);
        });
        gx.restore();
      });
    };

    let rafId;
    const loop = (ts) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      graphTRef.current += (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      
      drawBg();
      drawGraph(ts);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      className="fixed inset-0 z-[100] bg-[#0a0c10] flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={onComplete}
    >
      <style>{`
        .cover-scene {
          position: relative;
          z-index: 1;
          width: 1280px;
          height: 720px;
          display: flex;
          align-items: center;
        }
        .cover-left {
          width: 52%;
          padding: 0 64px;
          display: flex;
          flex-direction: column;
        }
        .cover-tagline {
          font-size: 12px;
          letter-spacing: 0.04em;
          color: #58a6ff;
          text-transform: none;
          opacity: 0;
          transform: translateY(12px);
          animation: coverFadeUp 0.6s ease forwards 0.4s;
          margin-bottom: 16px;
          font-weight: 600;
        }
        .cover-title {
          font-size: 80px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1;
          opacity: 0;
          transform: translateY(20px);
          animation: coverFadeUp 0.7s cubic-bezier(0.2,0.8,0.3,1) forwards 0.7s;
          letter-spacing: -3px;
          margin-bottom: 6px;
          font-style: italic;
        }
        .cover-title span {
          background: linear-gradient(90deg, #00e5ff, #4fc3f7, #7c4dff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .cover-subtitle-block {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          opacity: 0;
          transform: translateY(12px);
          animation: coverFadeUp 0.6s ease forwards 1.1s;
        }
        .cover-subtitle-line {
          width: 32px;
          height: 2px;
          background: #00e5ff;
        }
        .cover-subtitle {
          font-size: 14px;
          color: #aad4e8;
          font-style: italic;
          letter-spacing: 0.5px;
          font-weight: 500;
        }
        .cover-description {
          font-size: 16px;
          color: #cce8f4;
          line-height: 1.6;
          max-width: 440px;
          opacity: 0;
          transform: translateY(12px);
          animation: coverFadeUp 0.6s ease forwards 1.4s;
          margin-bottom: 40px;
          font-weight: 400;
        }
        .cover-description strong {
          color: #00e5ff;
          font-weight: 700;
        }
        .cover-badges {
          display: flex;
          gap: 10px;
          opacity: 0;
          animation: coverFadeUp 0.6s ease forwards 1.8s;
          margin-bottom: 36px;
        }
        .cover-badge {
          padding: 6px 14px;
          border: 1px solid rgba(88, 166, 255, 0.35);
          border-radius: 6px;
          font-size: 11px;
          letter-spacing: 0.02em;
          color: #8b949e;
          text-transform: none;
          background: rgba(88, 166, 255, 0.06);
          font-weight: 500;
        }
        .cover-typing-block {
          opacity: 0;
          animation: coverFadeUp 0.5s ease forwards 2.2s;
        }
        .cover-code-line {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: #b2ebf2;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(0, 229, 255, 0.04);
          border-left: 3px solid #00e5ff;
          border-radius: 0 4px 4px 0;
        }
        .cover-v-divider {
          position: absolute;
          left: 52%;
          top: 80px;
          bottom: 80px;
          width: 1px;
          background: linear-gradient(180deg, transparent, rgba(0,229,255,0.2), transparent);
        }
        .cover-scanline {
          position: absolute;
          inset: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #00e5ff22, #00e5ff44, #00e5ff22, transparent);
          animation: coverScan 6s linear infinite;
          z-index: 10;
          pointer-events: none;
        }
        @keyframes coverFadeUp {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes coverScan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        .dashboard-btn {
          margin-top: 48px;
          padding: 12px 24px;
          background: #1f6feb;
          border: 1px solid transparent;
          color: #fff;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 600;
          text-transform: none;
          letter-spacing: -0.01em;
          border-radius: 8px;
          cursor: pointer;
          transition: background-color 0.15s ease, transform 0.15s ease;
          display: flex;
          align-items: center;
          gap: 10px;
          width: fit-content;
          opacity: 0;
          animation: coverFadeUp 0.6s ease forwards 2.5s;
        }
        .dashboard-btn:hover {
          background: #388bfd;
          transform: translateY(-1px);
        }
        .dashboard-btn:active {
          transform: translateY(0);
        }
      `}</style>
      
      <div className="cover-scanline" />
      <canvas 
        ref={bgCanvasRef} 
        width={1280} 
        height={720} 
        className="absolute inset-0 w-full h-full object-cover opacity-60" 
      />

      <div className="cover-scene">
        <div className="cover-v-divider" />
        
        <div className="cover-left">
          <div className="cover-tagline">Architectural intelligence</div>
          <div className="cover-title"><span>EigenState</span></div>
          <div className="cover-subtitle-block">
            <div className="cover-subtitle-line" />
            <div className="cover-subtitle">Reconstructing the "why" behind every decision.</div>
          </div>
          <div className="cover-description">
            Git tells you <strong>what</strong> changed.<br />
            Eigenstate tells you <strong>why</strong> it was worth the tradeoff.
          </div>
          <div className="cover-badges">
            <div className="cover-badge">Team Pralay</div>
            <div className="cover-badge">Infra / AI</div>
            <div className="cover-badge">v1.1.0</div>
          </div>
          
          <div className="cover-typing-block">
            <div className="cover-code-line font-mono">
              <span className="text-[#4fc3f7]">❯</span>
              <span>eigenstate.query(<span className="text-[#a5d6a7]">{typedText}</span>)</span>
              <span className={`w-2 h-4 bg-[#00e5ff] ml-1 ${showCursor ? 'opacity-100' : 'opacity-0'}`} />
            </div>
          </div>

          <button 
            className="dashboard-btn group"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
          >
            Open control center
            <span className="text-lg">→</span>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center relative">
          <MotionDiv
            initial={{ opacity: 0, x: 120, y: 96, scale: 0.88 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            transition={{ delay: 0.45, duration: 0.9, ease: [0.22, 0.82, 0.22, 1] }}
            className="w-[480px] h-[480px]"
          >
            <canvas ref={graphCanvasRef} width={480} height={480} />
          </MotionDiv>
        </div>
      </div>

      <div className="absolute bottom-10 left-16 right-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4 text-xs text-slate-500 opacity-70">
        <span>Team Pralay · EigenState</span>
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#58a6ff]" />
          Graph synced
        </span>
      </div>
    </MotionDiv>
  );
};

export default CoverPage;
