import React from 'react';
import { DamageReport } from '../../types/equipment';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';

import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';

interface DamageHistoryTimelineProps {
    history?: DamageReport[];
    onDelete?: (id: string) => void;
}

export function DamageHistoryTimeline({ history, onDelete }: DamageHistoryTimelineProps) {
    if (!history || history.length === 0) {
        return <div className="text-sm text-slate-400 italic p-4 text-center border rounded-md border-dashed bg-slate-50">No damage history logged.</div>;
    }

    // Sort by date descending
    const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <ScrollArea className="h-[250px] pr-4">
            <div className="space-y-4 pl-1 pt-1">
                {sorted.map((report) => (
                    <div key={report.id} className="relative pl-6 border-l-2 border-slate-200 pb-2 last:pb-0 group">
                        <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white
                            ${report.severity === 'Critical' ? 'bg-red-500' : 
                              report.severity === 'Monitor' ? 'bg-orange-400' : 
                              'bg-yellow-400'}`}></div>
                        
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono text-slate-500">
                                    {new Date(report.date).toLocaleDateString()}
                                </span>
                                <span className="text-xs font-semibold text-slate-700">
                                    {report.reporterName}
                                </span>
                                <Badge variant="outline" className={`text-[10px] px-1 py-0 
                                    ${report.severity === 'Critical' ? 'border-red-500 text-red-600 bg-red-50' : 
                                    report.severity === 'Monitor' ? 'border-orange-400 text-orange-600 bg-orange-50' : 
                                    'border-yellow-400 text-yellow-600 bg-yellow-50'}`}>
                                    {report.severity}
                                </Badge>
                            </div>
                            {onDelete && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => onDelete(report.id)}
                                    title="Delete this report"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-1 mb-2">
                            {report.type.map(t => (
                                <Badge key={t} variant="secondary" className="text-[10px] px-1 bg-slate-100 text-slate-600 border-slate-200">
                                    {t}
                                </Badge>
                            ))}
                            {report.cost !== undefined && (
                                <Badge variant="secondary" className="text-[10px] px-1 bg-green-50 text-green-700 border-green-200">
                                    ${report.cost.toLocaleString()}
                                </Badge>
                            )}
                            {report.merchant && (
                                <Badge variant="secondary" className="text-[10px] px-1 bg-blue-50 text-blue-700 border-blue-200">
                                    {report.merchant}
                                </Badge>
                            )}
                        </div>

                        {report.description && (
                            <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded-md border border-slate-100">
                                {report.description}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
}
