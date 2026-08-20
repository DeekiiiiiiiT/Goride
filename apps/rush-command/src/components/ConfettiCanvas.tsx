import { useEffect, useRef } from 'react';

const CONFETTI_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

interface Particle {
  x: number;
  y: number;
  r: number;
  d: number;
  color: string;
  tilt: number;
  tiltAngleIncremental: number;
  tiltAngle: number;
  draw: () => void;
  update: () => void;
}

function createParticle(width: number, height: number, ctx: CanvasRenderingContext2D): Particle {
  const particle = {
    x: Math.random() * width,
    y: Math.random() * height - height,
    r: Math.random() * 6 + 4,
    d: Math.random() * 10 + 10,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    tilt: Math.random() * 10 - 10,
    tiltAngleIncremental: Math.random() * 0.07 + 0.05,
    tiltAngle: 0,
    draw() {
      ctx.beginPath();
      ctx.lineWidth = particle.r;
      ctx.strokeStyle = particle.color;
      ctx.moveTo(particle.x + particle.tilt + particle.r / 2, particle.y);
      ctx.lineTo(particle.x + particle.tilt, particle.y + particle.tilt + particle.r / 2);
      ctx.stroke();
    },
    update() {
      particle.tiltAngle += particle.tiltAngleIncremental;
      particle.y += (Math.cos(particle.d) + 3 + particle.r / 2) / 2;
      particle.tilt = Math.sin(particle.tiltAngle) * 15;
      if (particle.y > height) {
        particle.y = -20;
        particle.x = Math.random() * width;
      }
    },
  };

  return particle;
}

interface ConfettiCanvasProps {
  className?: string;
}

export default function ConfettiCanvas({ className = '' }: ConfettiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let frameId = 0;
    const particles: Particle[] = [];

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const init = () => {
      resize();
      particles.length = 0;
      for (let i = 0; i < 100; i += 1) {
        particles.push(createParticle(width, height, ctx));
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });
      frameId = window.requestAnimationFrame(animate);
    };

    init();
    animate();

    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
