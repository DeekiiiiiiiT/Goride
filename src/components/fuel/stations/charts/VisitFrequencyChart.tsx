import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../../ui/SafeResponsiveContainer';
import { Calendar, Minus } from 'lucide-react';
import { FuelEntry } from '../../../../types/fuel';

interface VisitFrequencyChartProps {
  logs: FuelEntry[];
}

export function VisitFrequencyChart({ logs }: VisitFrequencyChartProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
           setShouldRender(true);
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const chartData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);

    logs.forEach(log => {
      const dayIndex = new Date(log.date).getDay();
      counts[dayIndex]++;
    });

    return days.map((day, index) => ({
      day,
      visits: counts[index]
    }));
  }, [logs]);

  const totalVisits = logs.length;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
         <Calendar className="h-4 w-4 text-slate-500" />
         Visit Frequency by Day
      </h3>
      <div ref={containerRef} className="h-[200px] w-full min-w-0 relative">
        {shouldRender && totalVisits > 0 ? (
           <ResponsiveContainer width="100%" height="100%" minWidth={0}>
             <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="day" 
                    tick={{fontSize: 10, fill: '#64748b'}} 
                    axisLine={false} 
                    tickLine={false} 
                />
                <YAxis 
                    tick={{fontSize: 10, fill: '#64748b'}} 
                    axisLine={false} 
                    tickLine={false}
                    allowDecimals={false}
                    width={30}
                />
                <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}
                />
                <Bar 
                    dataKey="visits" 
                    fill="#3b82f6" 
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                />
             </BarChart>
           </ResponsiveContainer>
        ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm absolute inset-0">
                <Minus className="h-8 w-8 mb-2 opacity-50" />
                {!shouldRender ? 'Loading chart...' : 'No visit data available'}
            </div>
        )}
      </div>
    </div>
  );
}