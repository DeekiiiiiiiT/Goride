import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Info } from 'lucide-react';
import { ScenarioList } from './ScenarioList';
import { PolicySchedulePanel } from './PolicySchedulePanel';
import type { FuelScenario } from '../../types/fuel';

export function FuelConfiguration({
  scenarios,
  onScenariosChange,
}: {
  /** Parent-owned scenarios so Recon updates without Refresh Data. */
  scenarios?: FuelScenario[];
  onScenariosChange?: (scenarios: FuelScenario[]) => void;
}) {
    const [tab, setTab] = useState('rules');
    const [schedulePolicyId, setSchedulePolicyId] = useState<string | null>(null);

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
            <CardContent className="px-0 space-y-6">
                <Alert className="bg-slate-50 border-slate-200 text-slate-900">
                    <Info className="h-4 w-4 text-indigo-600" />
                    <AlertTitle>How policies work</AlertTitle>
                    <AlertDescription className="text-slate-700">
                        Rules set the split percentages. Schedule sets Monday periods and which
                        drivers use each version. Drivers with no version assignment use Default.
                        Changes apply to Consumption Reconciliation immediately.
                    </AlertDescription>
                </Alert>

                <Tabs
                    value={tab}
                    onValueChange={setTab}
                    className="w-full"
                >
                    <TabsList>
                        <TabsTrigger value="rules">Rules</TabsTrigger>
                        <TabsTrigger value="schedule">Schedule</TabsTrigger>
                    </TabsList>
                    <TabsContent value="rules" className="mt-6">
                        <ScenarioList
                            scenarios={scenarios}
                            onScenariosChange={onScenariosChange}
                            onViewSchedule={(policyId) => {
                                setSchedulePolicyId(policyId);
                                setTab('schedule');
                            }}
                        />
                    </TabsContent>
                    <TabsContent value="schedule" className="mt-6">
                        <PolicySchedulePanel
                          initialPolicyId={schedulePolicyId}
                          scenarios={scenarios}
                          onScenariosChange={onScenariosChange}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
