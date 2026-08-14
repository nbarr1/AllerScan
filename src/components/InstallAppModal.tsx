import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Apple,
  Download,
  Share2,
  PlusSquare,
  CheckCircle2,
  ExternalLink,
  Code,
  Layers,
  Sparkles,
  X
} from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'native'>('ios');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detect if already running in standalone mode (installed PWA)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    // Capture beforeinstallprompt for Android / Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                Install on iOS & Android
              </h2>
              <p className="text-xs text-slate-500">Run AllerScan as a native full-screen mobile app</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl my-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('ios')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'ios'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Apple className="w-4 h-4 text-slate-800" />
            <span>Apple iOS</span>
          </button>

          <button
            onClick={() => setActiveTab('android')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'android'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>Android</span>
          </button>

          <button
            onClick={() => setActiveTab('native')}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'native'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code className="w-4 h-4 text-indigo-600" />
            <span>Capacitor / SDK</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-sm text-slate-700">
          
          {/* iOS INSTRUCTIONS */}
          {activeTab === 'ios' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/80 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900">
                  <span className="font-bold">Zero App Store Installation:</span> Save AllerScan directly from Safari to your iPhone or iPad Home Screen with full camera and offline storage capabilities.
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="w-7 h-7 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      Open in Safari <ExternalLink className="w-3 h-3 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Open this application's preview or deployed URL in Apple Safari on your iPhone or iPad.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="w-7 h-7 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      Tap the Share Button <Share2 className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tap the Share icon at the bottom of Safari (the square with an arrow pointing upward).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="w-7 h-7 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      Select "Add to Home Screen" <PlusSquare className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Scroll down the share sheet and tap <span className="font-bold text-slate-800">Add to Home Screen</span>, then confirm with <span className="font-bold text-slate-800">Add</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ANDROID INSTRUCTIONS */}
          {activeTab === 'android' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/80 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900">
                  <span className="font-bold">Progressive Web App (PWA):</span> Installs like a native Android APK with standalone windowing, live notifications, and camera permissions.
                </div>
              </div>

              {deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-2xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>One-Click Install on this Device</span>
                </button>
              )}

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="w-7 h-7 rounded-xl bg-emerald-700 text-white font-black text-xs flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900">Open in Chrome or Samsung Internet</div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Navigate to this URL on your Android mobile device.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="w-7 h-7 rounded-xl bg-emerald-700 text-white font-black text-xs flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900">Tap Browser Menu (⋮)</div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tap the 3 dots in the top right corner of Chrome.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="w-7 h-7 rounded-xl bg-emerald-700 text-white font-black text-xs flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900">Tap "Install App" or "Add to Home screen"</div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      The AllerScan app icon will appear in your Android app drawer and home screen.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NATIVE APP STORE / PLAY STORE (CAPACITOR) */}
          {activeTab === 'native' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-200/80 flex items-start gap-3">
                <Layers className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-900">
                  <span className="font-bold">Capacitor Configured:</span> The workspace includes pre-configured <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono">capacitor.config.json</code> ready for export and native Xcode / Android Studio builds.
                </div>
              </div>

              <div className="p-3 bg-slate-900 rounded-2xl text-slate-200 font-mono text-xs space-y-2 overflow-x-auto">
                <div className="text-slate-400 text-[11px]">// 1. Export project via Settings &gt; Export ZIP / GitHub</div>
                <div className="text-emerald-400">npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android</div>
                <div className="text-slate-400 text-[11px]">// 2. Build web assets &amp; add mobile platforms</div>
                <div className="text-emerald-400">npm run build</div>
                <div className="text-emerald-400">npx cap add ios</div>
                <div className="text-emerald-400">npx cap add android</div>
                <div className="text-slate-400 text-[11px]">// 3. Open in Xcode or Android Studio</div>
                <div className="text-emerald-400">npx cap open ios</div>
                <div className="text-emerald-400">npx cap open android</div>
              </div>

              <p className="text-xs text-slate-500">
                You can then sign and deploy directly to the <span className="font-semibold text-slate-800">Apple App Store</span> and <span className="font-semibold text-slate-800">Google Play Store</span>.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
