import React, { useState } from 'react';
import { X, Loader2, Copy, Check, Shuffle, KeyRound } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { toast } from 'sonner@2.0.3';

interface Props {
  isOpen: boolean;
  userId: string;
  userName: string;
  userEmail: string;
  accessToken: string;
  onClose: () => void;
}

function generatePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  // Ensure at least one of each category
  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = pw.length; i < length; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }
  // Shuffle
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export function SetPasswordModal({ isOpen, userId, userName, userEmail, accessToken, onClose }: Props) {
  const [mode, setMode] = useState<'choose' | 'manual' | 'done'>('choose');
  const [password, setPassword] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleAutoGenerate = () => {
    const pw = generatePassword(12);
    setPassword(pw);
    setMode('done');
    applyPassword(pw);
  };

  const handleManualApply = () => {
    if (manualPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPassword(manualPassword);
    applyPassword(manualPassword);
  };

  const applyPassword = async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPassword(pw);
      setMode('done');
      toast.success(`Password set for ${userName || userEmail}`);
    } catch (err: any) {
      console.error('Set password error:', err);
      toast.error(err.message || 'Failed to set password');
      // Revert to choose mode on error
      setMode('choose');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    toast.success('Password copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setMode('choose');
    setPassword('');
    setManualPassword('');
    setCopied(false);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-400" /> Set New Password
          </h2>
          <button onClick={handleClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-slate-400">
          Set a new password for <span className="text-white font-medium">{userName || userEmail}</span>
        </p>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-xs text-amber-300">
            This will immediately change the user's password. Share the new password securely.
          </p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={handleAutoGenerate}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-left disabled:opacity-50"
            >
              <Shuffle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Auto-Generate</p>
                <p className="text-xs text-slate-500">Generate a secure 12-character password</p>
              </div>
            </button>
            <button
              onClick={() => setMode('manual')}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-left disabled:opacity-50"
            >
              <KeyRound className="w-5 h-5 text-slate-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Set Manually</p>
                <p className="text-xs text-slate-500">Type a custom password (min 8 chars)</p>
              </div>
            </button>
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">New Password</label>
              <input
                type="text"
                value={manualPassword}
                onChange={e => setManualPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              {manualPassword.length > 0 && manualPassword.length < 8 && (
                <p className="text-xs text-red-400 mt-1">{8 - manualPassword.length} more characters needed</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setMode('choose'); setManualPassword(''); }}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors">
                Back
              </button>
              <button
                onClick={handleManualApply}
                disabled={manualPassword.length < 8 || loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply
              </button>
            </div>
          </div>
        )}

        {mode === 'done' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
              </div>
            ) : (
              <>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  <p className="text-sm text-emerald-300">Password has been set successfully.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">New Password</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={password}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none"
                    />
                    <button onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors">
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
