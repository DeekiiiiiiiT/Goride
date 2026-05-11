import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../../ui/SafeResponsiveContainer';
import { Minus, TrendingUp } from 'lucide-react';

interface PriceHistoryChartProps {
  data: { date: string; price: number }[];
}

export function PriceHistoryChart({ data }: PriceHistoryChartProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
           // Once we have valid dimensions, we can render the chart
           setShouldRender(true);
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
         <TrendingUp className="h-4 w-4 text-slate-500" />
         Price History (30 Days)
      </h3>
      <div ref={containerRef} className="h-[200px] w-full min-w-0 relative">
        {shouldRender && data.length > 1 ? (
           <ResponsiveContainer width="100%" height="100%" minWidth={0}>
             <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="date" 
                    tick={{fontSize: 10, fill: '#64748b'}} 
                    axisLine={false} 
                    tickLine={false} 
                    minTickGap={30}
                />
                <YAxis 
                    domain={['dataMin - 0.1', 'dataMax + 0.1']} 
                    tick={{fontSize: 10, fill: '#64748b'}} 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(val) => `$${val}`}
                    width={30}
                />
                <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}
                />
                <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#4f46e5" 
                    strokeWidth={3} 
                    dot={{ fill: '#4f46e5', strokeWidth: 2, r: 4, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                />
             </LineChart>
           </ResponsiveContainer>
        ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm absolute inset-0">
                <Minus className="h-8 w-8 mb-2 opacity-50" />
                {!shouldRender ? 'Loading chart...' : 'Not enough data for history'}
            </div>
        )}
      </div>
    </div>
  );
}