import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Trophy, Heart } from 'lucide-react';
import { MiniGameProps, MiniGameResult } from './types';

interface Balloon {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  speed: number;
  popped: boolean;
}

export const MG01BalloonPop: React.FC<MiniGameProps> = ({ config, onFinish, videoElement }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetReps = config.reps || 10;
  const totalSets = config.sets || 3;
  const restTimeSeconds = config.restSeconds || 20;

  const [currentSet, setCurrentSet] = useState<number>(1);
  const [correctReps, setCorrectReps] = useState<number>(0);
  const [incorrectReps, setIncorrectReps] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [isResting, setIsResting] = useState<boolean>(false);
  const [restCountdown, setRestCountdown] = useState<number>(restTimeSeconds);

  const startTimeRef = useRef<number>(Date.now());
  const balloonsRef = useRef<Balloon[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const handPosRef = useRef<{ x: number; y: number } | null>(null);

  // Colors for balloons
  const colors = ['#f43f5e', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  // Track mouse or touch for responsive testing and simulation
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    handPosRef.current = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  // Rest Countdown Timer
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

    let nextBalloonId = 1;

    const gameLoop = () => {
      if (!isResting) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Spawn balloons periodically
        if (Math.random() < 0.04 && balloonsRef.current.length < 5) {
          const radius = 35 + Math.random() * 15;
          balloonsRef.current.push({
            id: nextBalloonId++,
            x: radius + Math.random() * (canvas.width - radius * 2),
            y: canvas.height + radius,
            radius,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: 2.2 + Math.random() * 1.5,
            popped: false,
          });
        }

        const hand = handPosRef.current;

        // Draw and update balloons
        for (let i = balloonsRef.current.length - 1; i >= 0; i--) {
          const b = balloonsRef.current[i];
          b.y -= b.speed;

          // Check hand intersection
          if (hand && !b.popped) {
            const dx = hand.x - b.x;
            const dy = hand.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < b.radius + 25) {
              b.popped = true;
              setScore((s) => s + 10);
              setCorrectReps((r) => {
                const nextReps = r + 1;
                if (nextReps >= targetReps) {
                  // Set completed!
                  if (currentSet < totalSets) {
                    setIsResting(true);
                  } else {
                    // All sets finished!
                    const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
                    onFinish({
                      correct: totalSets * targetReps,
                      incorrect: incorrectReps,
                      score: score + 10,
                      durationSec,
                    });
                  }
                }
                return nextReps;
              });
            }
          }

          // Offscreen missed balloon
          if (b.y + b.radius < 0 && !b.popped) {
            setIncorrectReps((inc) => inc + 1);
            balloonsRef.current.splice(i, 1);
            continue;
          }

          if (b.popped) {
            // Draw pop burst effect
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius * 1.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fill();
            balloonsRef.current.splice(i, 1);
            continue;
          }

          // Draw balloon
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fillStyle = b.color;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = 15;
          ctx.fill();

          // String
          ctx.beginPath();
          ctx.moveTo(b.x, b.y + b.radius);
          ctx.lineTo(b.x + Math.sin(b.y * 0.05) * 6, b.y + b.radius + 25);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }

        // Draw hand cursor guide
        if (hand) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(hand.x, hand.y, 20, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.6)';
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
            <span className="text-lg font-bold text-emerald-400">
              {currentSet} / {totalSets}
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-2xl backdrop-blur-md">
            <span className="text-xs text-slate-400 block font-medium">จำนวนครั้ง (Reps)</span>
            <span className="text-lg font-bold text-cyan-400">
              {correctReps} / {targetReps}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-2xl backdrop-blur-md">
          <Trophy className="w-5 h-5 text-amber-400" />
          <span className="text-lg font-mono font-bold text-amber-300">{score}</span>
        </div>
      </div>

      {/* Interactive Game Canvas */}
      <canvas
        ref={canvasRef}
        width={720}
        height={960}
        onPointerMove={handlePointerMove}
        className="w-full h-full object-contain cursor-crosshair"
      />

      {/* Rest Countdown Modal Overlay */}
      {isResting && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-white animate-in fade-in">
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-2">
            ยอดเยี่ยม! จบเซ็ตที่ {currentSet} แล้ว
          </span>
          <h2 className="text-2xl font-bold mb-4">พักผ่อนก่อนเริ่มเซ็ตถัดไป (Rest Time)</h2>
          <div className="w-28 h-28 rounded-full border-4 border-emerald-500 flex items-center justify-center text-4xl font-mono font-bold text-emerald-400 animate-pulse">
            {restCountdown}s
          </div>
          <p className="text-xs text-slate-400 mt-4">หายใจเข้าลึกๆ ผ่อนคลายกล้ามเนื้อแขนและหัวไหล่</p>
        </div>
      )}

      {/* Bottom Hint */}
      <div className="absolute bottom-6 left-0 right-0 z-20 text-center pointer-events-none">
        <span className="bg-slate-900/80 text-slate-300 text-xs px-4 py-2 rounded-full border border-slate-700 backdrop-blur-sm">
          💡 เอื้อมมือหรือแตะลูกโป่งที่ลอยขึ้นมาให้แตกเพื่อฝึกการเคลื่อนไหวของข้อไหล่
        </span>
      </div>
    </div>
  );
};
