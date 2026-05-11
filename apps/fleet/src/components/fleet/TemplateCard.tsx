import React from 'react';
import { EquipmentTemplate } from '../../services/templateService';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import { Copy, Trash2 } from "lucide-react";

interface TemplateCardProps {
    template: EquipmentTemplate;
    onUse: (template: EquipmentTemplate) => void;
    onDelete?: (template: EquipmentTemplate) => void;
}

export function TemplateCard({ template, onUse, onDelete }: TemplateCardProps) {
    const totalCost = template.items.reduce((sum, item) => sum + item.price, 0);

    return (
        <Card className="flex flex-col">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{template.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                    {template.items.length} items • Total: ${totalCost.toFixed(2)}
                </p>
            </CardHeader>
            <CardContent className="flex-1 text-sm text-muted-foreground pb-2">
                {template.description || "No description provided."}
                <div className="mt-2 flex flex-wrap gap-1">
                    {template.items.slice(0, 3).map((i, idx) => (
                        <span key={idx} className="bg-secondary px-1.5 py-0.5 rounded text-[10px] text-secondary-foreground">
                            {i.name}
                        </span>
                    ))}
                    {template.items.length > 3 && (
                        <span className="text-[10px] py-0.5 px-1">+ {template.items.length - 3} more</span>
                    )}
                </div>
            </CardContent>
            <CardFooter className="pt-2 flex justify-between">
                 <Button variant="outline" size="sm" onClick={() => onUse(template)}>
                    <Copy className="h-3 w-3 mr-2"/> Use
                 </Button>
                 {onDelete && (
                     <Button variant="ghost" size="sm" onClick={() => onDelete(template)}>
                        <Trash2 className="h-3 w-3 text-red-500"/>
                     </Button>
                 )}
            </CardFooter>
        </Card>
    );
}
