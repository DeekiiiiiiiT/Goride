import React from 'react';
import { Badge } from '../../../ui/badge';
import { cn } from '../../../ui/utils';
import { Check, Coffee, Truck, Wifi, Zap, Wind, ShoppingBag, Utensils, Warehouse, Key } from 'lucide-react';

export const COMMON_AMENITIES = [
  { id: '24_7', label: 'Open 24/7', icon: Key },
  { id: 'truck_stop', label: 'Truck Stop', icon: Truck },
  { id: 'def', label: 'DEF at Pump', icon: Zap },
  { id: 'convenience_store', label: 'Convenience Store', icon: ShoppingBag },
  { id: 'food', label: 'Hot Food / Restaurant', icon: Utensils },
  { id: 'restrooms', label: 'Restrooms', icon: Warehouse },
  { id: 'wifi', label: 'Free Wi-Fi', icon: Wifi },
  { id: 'air', label: 'Air / Vacuum', icon: Wind },
  { id: 'coffee', label: 'Coffee', icon: Coffee },
];

interface AmenitiesSelectorProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  readOnly?: boolean;
}

export function AmenitiesSelector({ selected = [], onChange, readOnly = false }: AmenitiesSelectorProps) {
  
  const toggleAmenity = (id: string) => {
    if (readOnly) return;
    if (selected.includes(id)) {
      onChange(selected.filter(i => i !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {COMMON_AMENITIES.map((amenity) => {
        const isSelected = selected.includes(amenity.id);
        const Icon = amenity.icon;
        
        return (
          <div
            key={amenity.id}
            onClick={() => toggleAmenity(amenity.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
              !readOnly && "cursor-pointer hover:bg-slate-50",
              isSelected 
                ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800" 
                : "bg-white text-slate-600 border-slate-200"
            )}
          >
            {isSelected && <Check className="h-3 w-3" />}
            {!isSelected && <Icon className="h-3 w-3 text-slate-400" />}
            {amenity.label}
          </div>
        );
      })}
    </div>
  );
}
