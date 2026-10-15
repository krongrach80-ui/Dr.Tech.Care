import React, { useState, useEffect, useRef } from 'react';
import { Star, Trophy } from 'lucide-react';
import { MiniGameProps } from './types';

interface TargetStar {
  x: number;
  y: number;
  radius: number;
  holdProgress: number; // 0 to 1
  label: string;
}

export const MG02ReachCatch: React.FC<MiniGameProps> = ({ config, onFinish }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetReps = config.reps || 12;
  const totalSets = config.sets || 3;
  const restTimeSeconds = config.restSeconds || 25;

  const [currentSet, setCurrentSet] = useState<number>(1);
  const [correctReps, setCorrectReps] = useState<number>(0);
  const [incorrectReps, setIncorrectReps] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [isResting, setIsResting] = useState<boolean>(false);
  const [restCountdown, setRestCountdown] = useState<number>(restTimeSeconds);

  const startTimeRef = useRef<number>(Date.now());
  const currentStarRef = useRef<TargetStar | null>(null);
  const handPosRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const spawnNewStar = (width: number, height: number) => {
    // Generate reaching target points: Top Left, Top Right, Center High
    const positions = [
      { x: width * 0.25, y: height * 0.25, label: 'เอื้อมบนซ้าย' },
      { x: width * 0.75, y: height * 0.25, label: 'เอื้อมบนขวา' },
      { x: width * 0.5, y: height * 0.18, label: 'เหยียดแขนขึ้นสุด' },
      { x: width * 0.2, y: height * 0.5, label: 'กางแขนซ้าย' },
      { x: width * 0.8, y: height * 0.5, label: 'กางแขนขวา' },
    ];
    const picked = positions[Math.floor(Math.random() * positions.length)];
    currentStarRef.current = {
      x: picked.x,
      y: picked.y,
      radius: 40,
      holdProgress: 0,
      label: picked.label,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    handPosRef.current = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  // Rest Timer
  useEffect(() => {
    if (!isResting) return;
    setRestCountdown(restTimeSeconds);

    const interval = setInterval(() => {
      setRestCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsResting(false);
          setCorrectReps(0);
          setCurrentSet((s) => s + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isResting, restTimeSeconds]);

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    spawnNewStar(canvas.width, canvas.height);

    const gameLoop = () => {
      if (!isResting) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const star = currentStarRef.current;
        const hand = handPosRef.current;

        if (star) {
          // Check collision with hand
          let isTouching = false;
          if (hand) {
            const dx = hand.x - star.x;
            const dy = hand.y - star.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < star.radius + 20) {
              isTouching = true;
              star.holdProgress += 0.05; // ~0.5s to catch
            }
          }

          if (!isTouching && star.holdProgress > 0) {
            star.holdProgress = Math.max(0, star.holdProgress - 0.02);
          }

          // Caught the star!
          if (star.holdProgress >= 1.0) {
            setScore((s) => s + 15);
            setCorrectReps((r) => {
              const nextReps = r + 1;
              if (nextReps >= targetReps) {
                if (currentSet < totalSets) {
                  setIsResting(true);
                } else {
                  const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
                  onFinish({
                    correct: totalSets * targetReps,
                    incorrect: incorrectReps,
                    score: score + 15,
                    durationSec,
                  });
                }
              }
              return nextReps;
            });
            spawnNewStar(canvas.width, canvas.height);
          }

          // Draw target star
          ctx.save();
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 20;
          ctx.stroke();
          ctx.fill();

          // Draw progress ring
          if (star.holdProgress > 0) {
            ctx.beginPath();
            ctx.arc(
              star.x,
              star.y,
              star.radius + 6,
              -Math.PI / 2,
              -Math.PI / 2 + Math.PI * 2 * star.holdProgress
            );
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 6;
            ctx.stroke();
          }

          // Draw Star Icon Center
          ctx.fillStyle = '#fbbf24';
          ctx.font = '24px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⭐', star.x, star.y);

          // Star label
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(star.label, star.x, star.y + star.radius + 20);
          ctx.restore();
        }

        // Draw hand cursor
        if (hand) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(hand.x, hand.y, 22, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentSet, isResting, targetReps, totalSets, score, incorrectReps, onFinish]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between bg-slate-950 overflow-hidden select-none">
      {/* Top HUD */}
      <div className="absolute top-4 left-6 right-6 z-20 flex items-center justify-between text-white">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-2xl backdrop-blur-md">
            <span className="text-xs text-slate-400 block font-medium">เซ็ตที่ (Set)</span>
            <span className="text-lg font-bold text-amber-400">
              {currentSet} / {totalSets}
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-2xl backdrop-blur-md">
            <span className="text-xs text-slate-400 block font-medium">จับดาวสำเร็จ (Catches)</span>
            <span className="text-lg font-bold text-emerald-400">
              {correctReps} / {targetReps}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-2xl backdrop-blur-md">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span className="text-lg font-mono font-bold text-amber-300">{score}</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={720}
        height={960}
        onPointerMove={handlePointerMove}
        className="w-full h-full object-contain cursor-crosshair"
      />

      {isResting && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-white animate-in fade-in">
          <span className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-2">
            เยี่ยมมาก! จบเซ็ตที่ {currentSet} แล้ว
          </span>
          <h2 className="text-2xl font-bold mb-4">พักผ่อนก่อนเริ่มเซ็ตถัดไป (Rest Time)</h2>
          <div className="w-28 h-28 rounded-full border-4 border-amber-500 flex items-center justify-center text-4xl font-mono font-bold text-amber-400 animate-pulse">
            {restCountdown}s
          </div>
          <p className="text-xs text-slate-400 mt-4">แกว่งแขนเบาๆ เพื่อผ่อนคลายกล้ามเนื้อหัวไหล่</p>
        </div>
      )}

      <div className="absolute bottom-6 left-0 right-0 z-20 text-center pointer-events-none">
        <span className="bg-slate-900/80 text-slate-300 text-xs px-4 py-2 rounded-full border border-slate-700 backdrop-blur-sm">
          ⭐ เอื้อมมือไปแตะดวงดาวและค้างไว้สักครู่เพื่อจับดาวให้สำเร็จ
        </span>
      </div>
    </div>
  );
};
