import React, { useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScenarioList } from './ScenarioList';
import { PolicySchedulePanel } from './PolicySchedulePanel';
import { FuelDualApprovalSettingsPanel } from './FuelDualApprovalSettingsPanel';
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
            <CardContent className="px-0 space-y-6">
                <FuelDualApprovalSettingsPanel />

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
