// src/components/kynthai/emergency-banner.tsx
// Emergency alert banner shown when there are unresolved alerts
// Safety-critical UI component

'use client';

import { useEffect, useState } from 'react';
import type { EmergencyAlert } from '@/lib/emergency-client';

interface EmergencyBannerProps {
  alerts: EmergencyAlert[];
  onDismiss: (alertId: string) => void;
}

export function EmergencyBanner({ alerts, onDismiss }: EmergencyBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (alerts.length > 0) {
      setVisible(true);
    }
  }, [alerts.length]);

  if (!visible || alerts.length === 0) return null;

  const tierColors: Record<string, string> = {
    low: 'bg-blue-100 border-blue-300 text-blue-800',
    medium: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    high: 'bg-orange-100 border-orange-300 text-orange-800',
    critical: 'bg-red-100 border-red-300 text-red-800',
  };

  const tierLabels: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'CRITICAL',
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 space-y-2 p-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="alert"
          aria-live="assertive"
          className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 shadow-lg ${tierColors[alert.tier] || tierColors.high}`}
        >
          <div>
            <p className="font-bold text-sm">
              {tierLabels[alert.tier]} — {alert.type.replace('_', ' ')}
            </p>
            <p className="text-xs opacity-80">
              {new Date(alert.created_at).toLocaleString()}
              {alert.location ? ` • ${alert.location}` : ''}
            </p>
          </div>
          <button
            onClick={() => onDismiss(alert.id)}
            className="px-3 py-1 text-xs font-semibold rounded bg-white/50 hover:bg-white/70 transition-colors"
          >
            Resolve
          </button>
        </div>
      ))}
    </div>
  );
}
