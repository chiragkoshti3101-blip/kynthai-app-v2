// src/components/kynthai/emergency-modal.tsx
// Modal for creating emergency alerts
// Safety-critical UI component with clear tier selection

'use client';

import { useState } from 'react';
import { EmergencyType, EmergencyTier } from '@/lib/emergency';

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (type: EmergencyType, tier: EmergencyTier, location?: string) => void;
  isSubmitting: boolean;
}

const EMERGENCY_TYPES: { value: EmergencyType; label: string; icon: string }[] = [
  { value: 'medical', label: 'Medical Emergency', icon: '🏥' },
  { value: 'fall', label: 'Fall', icon: '🧓' },
  { value: 'chest_pain', label: 'Chest Pain', icon: '💔' },
  { value: 'stroke', label: 'Stroke', icon: '🧠' },
  { value: 'allergic', label: 'Allergic Reaction', icon: '⚠️' },
  { value: 'other', label: 'Other', icon: '❓' },
];

const TIERS: { value: EmergencyTier; label: string; color: string; description: string }[] = [
  { value: 'low', label: 'Low', color: 'blue', description: 'Monitor situation' },
  { value: 'medium', label: 'Medium', color: 'yellow', description: 'Seek medical attention soon' },
  { value: 'high', label: 'High', color: 'orange', description: 'Urgent medical attention needed' },
  { value: 'critical', label: 'CRITICAL', color: 'red', description: 'Call emergency services NOW' },
];

export function EmergencyModal({ isOpen, onClose, onSubmit, isSubmitting }: EmergencyModalProps) {
  const [type, setType] = useState<EmergencyType>('medical');
  const [tier, setTier] = useState<EmergencyTier>('high');
  const [location, setLocation] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(type, tier, location || undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <h2 id="emergency-modal-title" className="text-lg font-bold text-gray-900 mb-4">
          Report Emergency
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What type of emergency?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {EMERGENCY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    type === t.value
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{t.icon}</span>
                  <p className="text-xs font-medium mt-1">{t.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Tier selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How urgent is it?
            </label>
            <div className="space-y-2">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTier(t.value)}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                    tier === t.value
                      ? t.color === 'red'
                        ? 'border-red-500 bg-red-50'
                        : t.color === 'orange'
                          ? 'border-orange-500 bg-orange-50'
                          : t.color === 'yellow'
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-semibold text-sm">{t.label}</span>
                  <p className="text-xs text-gray-500">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Location (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location (optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Kitchen, Bedroom, 123 Main St"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Sending...' : 'Send Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
