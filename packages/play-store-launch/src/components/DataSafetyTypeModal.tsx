import React from 'react';
import { X } from 'lucide-react';
import type { DataSafetySchemaQuestion, DataSafetyState } from '../dataSafety/types';
import {
  setCheckboxValue,
  setRadioValue,
  setTextValue,
  updateRowValue,
} from '../dataSafety/csv';
import { DataSafetyQuestionField } from './DataSafetyQuestionField';

interface DataSafetyTypeModalProps {
  typeLabel: string;
  category: string;
  questions: DataSafetySchemaQuestion[];
  state: DataSafetyState;
  onChange: (next: DataSafetyState) => void;
  onClose: () => void;
}

export function DataSafetyTypeModal({
  typeLabel,
  category,
  questions,
  state,
  onChange,
  onClose,
}: DataSafetyTypeModalProps) {
  const handleQuestionChange = (question: DataSafetySchemaQuestion, value: unknown) => {
    if (question.kind === 'checkbox' && typeof value === 'object' && value !== null) {
      const { responseId, checked } = value as { responseId: string; checked: boolean };
      onChange(setCheckboxValue(state, question.questionId, responseId, checked));
      return;
    }
    if (question.kind === 'radio' && typeof value === 'string') {
      onChange(setRadioValue(state, question.questionId, value));
      return;
    }
    if (question.kind === 'ephemeral' && typeof value === 'boolean') {
      onChange(updateRowValue(state, question.questionId, '', value ? 'true' : 'false'));
      return;
    }
    if ((question.kind === 'text' || question.kind === 'boolean') && typeof value === 'string') {
      onChange(setTextValue(state, question.questionId, value));
    }
  };

  const sharedChecked = questions
    .find((q) => q.questionId.includes('PSL_DATA_USAGE_COLLECTION_AND_SHARING'))
    ?.options.find((o) => o.responseId === 'PSL_DATA_USAGE_ONLY_SHARED')?.selected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-labelledby="data-safety-type-title"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{category}</p>
            <h2 id="data-safety-type-title" className="text-lg font-medium text-slate-900">
              {typeLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-8 px-6 py-6">
          {questions.map((question) => {
            if (
              question.questionId.includes('DATA_USAGE_SHARING_PURPOSE') &&
              !sharedChecked
            ) {
              return null;
            }
            return (
              <DataSafetyQuestionField
                key={question.questionId}
                question={question}
                onChange={(value) => handleQuestionChange(question, value)}
              />
            );
          })}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
