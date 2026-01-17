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
                        <CardTitle>Fuel Configuration</CardTitle>
                        <CardDescription>
                            Manage expense coverage scenarios and rules for your fleet.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                <Alert className="mb-8 bg-blue-50 border-blue-200 text-blue-900">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle>About Scenarios</AlertTitle>
                    <AlertDescription className="text-blue-800">
                        Scenarios allow you to define different expense coverage rules (e.g., "Company Car" vs. "Rental"). 
                        Assign these scenarios to vehicles or drivers to automate reimbursement calculations.
                    </AlertDescription>
                </Alert>

                <ScenarioList />
            </CardContent>
        </Card>
    );
}
