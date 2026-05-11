import React, { useState, useEffect } from 'react';
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';

interface Announcement {
  message: string;
  type: 'info' | 'warning' | 'critical';
  dismissible: boolean;
}

const STYLE_MAP = {
  info: { bg: 'bg-blue-500', text: 'text-white', icon: Info },
  warning: { bg: 'bg-amber-500', text: 'text-amber-950', icon: AlertTriangle },
  critical: { bg: 'bg-red-600', text: 'text-white', icon: AlertCircle },
};

export function AnnouncementBanner({ preview }: { preview?: boolean }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    if (sessionStorage.getItem('announcement_dismissed') === 'true') {
      setDismissed(true);
    }

    fetch(`${API_ENDPOINTS.admin}/platform-status`)
      .then(res => res.json())
      .then(data => {
        if (data.announcement) {
          setAnnouncement(data.announcement);
        }
      })
      .catch(() => {});
  }, []);

  if (!announcement || dismissed) return null;

  const style = STYLE_MAP[announcement.type];
  const IconComp = style.icon;

  const handleDismiss = () => {
    sessionStorage.setItem('announcement_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div className={`${style.bg} ${style.text} relative`}>
      {preview && (
        <div className="absolute top-0 right-0 bg-black/20 px-2 py-0.5 text-[10px] rounded-bl font-medium">
          PREVIEW — Visible to all users
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2.5 max-w-7xl mx-auto">
        <IconComp className="w-4 h-4 shrink-0" />
        <p className="text-sm flex-1">{announcement.message}</p>
        {announcement.dismissible && (
          <button
            onClick={handleDismiss}
            className="shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
            aria-label="Dismiss announcement"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
