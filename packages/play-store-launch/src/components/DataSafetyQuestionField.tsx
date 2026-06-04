import React from 'react';
import type { DataSafetySchemaQuestion } from '../dataSafety/types';

interface DataSafetyQuestionFieldProps {
  question: DataSafetySchemaQuestion;
  onChange: (value: unknown) => void;
}

export function DataSafetyQuestionField({ question, onChange }: DataSafetyQuestionFieldProps) {
  const isUrlOrTextField =
    question.kind === 'text' ||
    question.questionId.includes('URL') ||
    question.questionId.includes('SPECIFY');

  if (question.options.length === 0 && question.kind !== 'ephemeral' && !isUrlOrTextField) {
    const checked = question.value === 'true';
    return (
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? 'true' : '')}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
        />
        <span className="text-sm text-slate-800">{question.title}</span>
      </label>
    );
  }

  if (isUrlOrTextField || (question.options.length === 0 && question.kind === 'text')) {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-900">{question.title}</label>
        <input
          type="text"
          value={question.value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    );
  }

  if (question.kind === 'ephemeral') {
    const isYes = question.value === 'true';
    const isNo = question.value === 'false';
    return (
      <div>
        <p className="text-sm font-medium text-slate-900">{question.title}</p>
        <p className="mt-1 text-sm text-slate-600">
          Processing data ephemerally means accessing and using data while it is only stored in memory,
          and is retained for no longer than necessary to service the specific request in real-time.
        </p>
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={question.questionId}
              checked={isYes}
              onChange={() => onChange(true)}
              className="mt-1 h-4 w-4 border-slate-300 text-blue-600"
            />
            <span className="text-sm text-slate-800">Yes, this collected data is processed ephemerally</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name={question.questionId}
              checked={isNo}
              onChange={() => onChange(false)}
              className="mt-1 h-4 w-4 border-slate-300 text-blue-600"
            />
            <span className="text-sm text-slate-800">No, this collected data is not processed ephemerally</span>
          </label>
        </div>
      </div>
    );
  }

  if (question.kind === 'radio') {
    return (
      <div>
        <p className="text-sm font-medium text-slate-900">{question.title}</p>
        <div className="mt-3 space-y-2">
          {question.options.map((opt) => (
            <label key={opt.responseId} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name={question.questionId}
                checked={opt.selected}
                onChange={() => onChange(opt.responseId)}
                className="mt-1 h-4 w-4 border-slate-300 text-blue-600"
              />
              <span className="text-sm text-slate-800">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (question.options.length === 1 && question.kind === 'boolean') {
    const opt = question.options[0];
    return (
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={opt.selected}
          onChange={(e) => onChange({ responseId: opt.responseId, checked: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
        />
        <span className="text-sm text-slate-800">{question.title}</span>
      </label>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-900">{question.title}</p>
      {question.kind === 'checkbox' && (
        <p className="mt-0.5 text-xs text-slate-500">Select all that apply.</p>
      )}
      <div className="mt-3 space-y-2">
        {question.options.map((opt) => (
          <label key={opt.responseId} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={opt.selected}
              onChange={(e) =>
                onChange({ responseId: opt.responseId, checked: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span className="text-sm text-slate-800">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
