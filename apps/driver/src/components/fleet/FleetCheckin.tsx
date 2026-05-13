import React, { useState } from 'react';
import { CheckCircle, Calendar, Car, AlertCircle, Camera } from 'lucide-react';
import { useDriver } from '../../contexts/DriverContext';

export function FleetCheckin() {
  const { fleet } = useDriver();
  const [checkinComplete, setCheckinComplete] = useState(false);

  const checklistItems = [
    { id: 'exterior', label: 'Exterior condition check', completed: false },
    { id: 'interior', label: 'Interior cleanliness', completed: false },
    { id: 'tires', label: 'Tire pressure check', completed: false },
    { id: 'lights', label: 'All lights working', completed: false },
    { id: 'fluids', label: 'Fluid levels checked', completed: false },
    { id: 'documents', label: 'Documents in vehicle', completed: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Weekly Check-in</h1>
        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
          Fleet Only
        </span>
      </div>

      <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl p-4 border border-emerald-500/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Calendar className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-emerald-300 font-medium">This Week's Check-in</p>
            <p className="text-emerald-400/70 text-sm">
              {checkinComplete ? 'Completed' : 'Due by Sunday 11:59 PM'}
            </p>
          </div>
          {checkinComplete ? (
            <CheckCircle className="w-6 h-6 text-emerald-400" />
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-emerald-400/50" />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Vehicle Inspection
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
          {checklistItems.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700/30"
            >
              <div className="w-5 h-5 rounded border border-slate-600 flex items-center justify-center">
                {item.completed && <CheckCircle className="w-4 h-4 text-emerald-400" />}
              </div>
              <span className="text-slate-300 text-sm flex-1">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Photo Documentation
        </h2>
        <button className="w-full bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 border-dashed text-center hover:bg-slate-700/30 transition-colors">
          <Camera className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Tap to upload vehicle photos</p>
          <p className="text-slate-500 text-xs mt-1">Required: Front, back, and odometer</p>
        </button>
      </div>

      <button className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        Submit Check-in
      </button>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-medium text-sm">Weekly Requirement</p>
            <p className="text-amber-400/70 text-xs mt-1">
              Complete your check-in every week to stay in good standing with {fleet?.name || 'your fleet'}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
