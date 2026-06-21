type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
};

const COLORS = ['#10b981', '#006c49', '#F59E0B', '#8b4ef7', '#ff778a'];

export function fireConfetti(durationMs = 2500) {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const particles: Particle[] = Array.from({ length: 80 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 120,
    y: canvas.height * 0.35,
    vx: (Math.random() - 0.5) * 8,
    vy: Math.random() * -12 - 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.random() * 6 + 4,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 10,
  }));

  const start = performance.now();

  const frame = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.rotation += p.rotationSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };

  requestAnimationFrame(frame);
}
