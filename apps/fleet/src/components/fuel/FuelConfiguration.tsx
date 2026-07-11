import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Info } from 'lucide-react';
import { ScenarioList } from './ScenarioList';

export function FuelConfiguration() {
    return (
        <Card className="border-0 shadow-none">
            <CardHeader className="px-0 pt-0">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Fleet Policy Configuration</CardTitle>
                        <CardDescription>
                            Manage company and driver expense splits for fuel.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-0 space-y-8">
                <Alert className="bg-slate-50 border-slate-200 text-slate-900">
                    <Info className="h-4 w-4 text-indigo-600" />
                    <AlertTitle>How policies work</AlertTitle>
                    <AlertDescription className="text-slate-700">
                        The Default policy applies to vehicles without a custom assignment.
                        Create additional policies for different company/driver splits, then assign vehicles to them.
                        Drivers inherit the policy through the vehicle they are on.
                    </AlertDescription>
                </Alert>

                <ScenarioList />
            </CardContent>
        </Card>
    );
}
