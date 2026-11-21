import React, { useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScenarioList } from './ScenarioList';
import { PolicySchedulePanel } from './PolicySchedulePanel';
import { FuelDualApprovalSettingsPanel } from './FuelDualApprovalSettingsPanel';
import type { FuelScenario } from '../../types/fuel';
import { useQuery } from '@tanstack/react-query';
import { TollPolicyTab, TOLL_SETTINGS_KEY, fetchTollSettings } from '../fleet-financials/recon/tolls-v2/policy/TollPolicyTab';

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
    // Toll disputes (UI2): the Tolls tab appears once the company's toll settings were seeded (rollout step 2)
    // or the toll_disputes switch is on. Before that this page is exactly as it was.
    const tollSettings = useQuery({ queryKey: TOLL_SETTINGS_KEY, queryFn: fetchTollSettings, staleTime: 30_000, retry: false });
    const tollsOn = tollSettings.data?.seeded === true || tollSettings.data?.switches?.tollDisputes === true;

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
                        {tollsOn ? <TabsTrigger value="tolls">Tolls</TabsTrigger> : null}
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
                    {tollsOn ? (
                        <TabsContent value="tolls" className="mt-6">
                            <TollPolicyTab />
                        </TabsContent>
                    ) : null}
                </Tabs>
            </CardContent>
        </Card>
    );
}
