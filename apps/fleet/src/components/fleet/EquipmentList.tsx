import React from 'react';
import { EquipmentItem } from '../../types/equipment';
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Trash2 } from "lucide-react";

interface EquipmentListProps {
  items: EquipmentItem[];
  vehicleName?: string;
  onRemove?: (item: EquipmentItem) => void;
}

export function EquipmentList({ items, vehicleName, onRemove }: EquipmentListProps) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id} className="overflow-hidden">
           <div className="flex flex-row items-center p-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                   <h4 className="font-medium text-sm">{item.name}</h4>
                   <Badge variant={item.status === 'Damaged' || item.status === 'Missing' ? 'destructive' : 'secondary'}>
                      {item.status}
                   </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                   {item.category} • ${item.price} • {vehicleName || item.vehicleId}
                </p>
              </div>
              {onRemove && (
                 <Button variant="ghost" size="icon" onClick={() => onRemove(item)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                 </Button>
              )}
           </div>
        </Card>
      ))}
       {items.length === 0 && (
         <div className="text-center p-4 text-sm text-muted-foreground border border-dashed rounded-lg">
            No equipment assigned.
         </div>
       )}
    </div>
  );
}
