import React from 'react';
import { Trash2, Star } from 'lucide-react';
import { ExpenseSplitRule } from '../../types/data';

interface ScenarioCardProps {
  rule: ExpenseSplitRule;
  onUpdate: (id: string, field: keyof ExpenseSplitRule, value: any) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export const ScenarioCard: React.FC<ScenarioCardProps> = ({ rule, onUpdate, onDelete, onSetDefault }) => {
  const handleCompanyShareChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      onUpdate(rule.id, 'companyShare', val);
      onUpdate(rule.id, 'driverShare', 100 - val);
    } else if (e.target.value === '') {
      onUpdate(rule.id, 'companyShare', 0);
      onUpdate(rule.id, 'driverShare', 100);
    }
  };

  return (
    <div className={`bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-all relative ${
      rule.isDefault ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200"
    }`}>
      {rule.isDefault && (
        <div className="absolute -top-3 left-4 bg-indigo-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center shadow-sm">
          <Star className="w-3 h-3 mr-1 fill-current" /> Default Scenario
        </div>
      )}

      <div className="flex items-center justify-between mb-4 mt-2">
        <div className="flex-1 mr-4">
          <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">
            Scenario Name
          </label>
          <input
            type="text"
            value={rule.name || ''}
            onChange={(e) => onUpdate(rule.id, 'name', e.target.value)}
            placeholder="e.g. Ride Share"
            className="w-full text-sm font-semibold text-slate-900 border-b border-slate-200 focus:border-indigo-500 focus:outline-none py-1 placeholder:font-normal placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-1">
            {!rule.isDefault && (
                <button
                    onClick={() => onSetDefault(rule.id)}
                    className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors"
                    title="Set as Default"
                >
                    <Star size={18} />
                </button>
            )}
            <button
                onClick={() => onDelete(rule.id)}
                className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                title="Delete Scenario"
                disabled={rule.isDefault}
            >
                <Trash2 size={18} />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Company %
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              value={rule.companyShare}
              onChange={handleCompanyShareChange}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-slate-500 sm:text-sm">%</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Driver %
          </label>
          <div className="relative">
            <input
              type="number"
              value={rule.driverShare}
              readOnly
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-500 cursor-not-allowed focus:outline-none"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-slate-500 sm:text-sm">%</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-xs text-slate-500">
        <span>Total split must equal 100%</span>
        <span className={rule.companyShare + rule.driverShare === 100 ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
          Current: {rule.companyShare + rule.driverShare}%
        </span>
      </div>
    </div>
  );
};
