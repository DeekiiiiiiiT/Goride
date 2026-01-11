import React from 'react';
import { FleetAlert } from '../../utils/alertHelpers';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AlertTriangle, AlertCircle, Info, XCircle } from 'lucide-react';
import { Badge } from '../ui/badge';

interface AlertsListProps {
    alerts: FleetAlert[];
}

export function AlertsList({ alerts }: AlertsListProps) {
    const critical = alerts.filter(a => a.severity === 'critical');
    const warning = alerts.filter(a => a.severity === 'warning');
    const info = alerts.filter(a => a.severity === 'info');

    if (alerts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-xl bg-slate-50">
                <div className="h-12 w-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <Info className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-medium">All Clear!</h3>
                <p className="text-muted-foreground">No alerts found for inventory or vehicles.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {critical.length > 0 && (
                <AlertGroup title="Critical Attention Needed" alerts={critical} color="red" icon={XCircle} />
            )}
            {warning.length > 0 && (
                <AlertGroup title="Warnings" alerts={warning} color="amber" icon={AlertTriangle} />
            )}
            {info.length > 0 && (
                <AlertGroup title="Information" alerts={info} color="blue" icon={Info} />
            )}
        </div>
    );
}

function AlertGroup({ title, alerts, color, icon: Icon }: { title: string, alerts: FleetAlert[], color: 'red'|'amber'|'blue', icon: any }) {
    const colorClasses = {
        red: "bg-red-50 border-red-200 text-red-700",
        amber: "bg-amber-50 border-amber-200 text-amber-700",
        blue: "bg-blue-50 border-blue-200 text-blue-700"
    };

    return (
        <Card className="border shadow-sm overflow-hidden">
            <CardHeader className={`pb-3 ${colorClasses[color]} border-b`}>
                <CardTitle className="flex items-center text-lg">
                    <Icon className="mr-2 h-5 w-5" />
                    {title}
                    <Badge variant="secondary" className="ml-2 bg-white/50 text-current border-0">
                        {alerts.length}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y">
                    {alerts.map((alert: FleetAlert) => (
                        <div key={alert.id} className="p-4 flex items-start hover:bg-slate-50 transition-colors">
                            <div className="flex-1">
                                <h4 className="font-semibold text-sm text-slate-900">{alert.message}</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {alert.entityName}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-medium text-slate-600 block">{alert.details}</span>
                                {alert.date && (
                                    <span className="text-[10px] text-slate-400">
                                        {new Date(alert.date).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
