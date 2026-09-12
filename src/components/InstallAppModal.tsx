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
  Sparkles
} from 'lucide-react';
import { Modal } from './Modal';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'native'>('ios');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detect if already running in standalone mode (installed PWA).
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const tabClass = (tab: typeof activeTab) =>
    `py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
      activeTab === tab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Install on iOS and Android"
      size="max-w-xl"
      header={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <Smartphone className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Install on iOS &amp; Android</h2>
            <p className="text-xs text-slate-500">Open AllerScan full-screen from your home screen</p>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      }
    >
      {isInstalled ? (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-emerald-900">
              <span className="font-bold block">AllerScan is already installed on this device</span>
              <span>You're running it as an installed app right now — no further setup needed.</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            To install it on another phone or tablet, open this page there and follow the steps for
            that platform.
          </p>
          <button
            type="button"
            onClick={() => setIsInstalled(false)}
            className="text-xs font-bold text-emerald-700 hover:underline"
          >
            Show the installation steps anyway
          </button>
        </div>
      ) : (
        <>
          {/* Tab Selection */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl mb-4 text-xs font-bold" role="tablist" aria-label="Install platform">
            <button type="button" role="tab" aria-selected={activeTab === 'ios'} onClick={() => setActiveTab('ios')} className={tabClass('ios')}>
              <Apple className="w-4 h-4 text-slate-800" aria-hidden="true" />
              <span>Apple iOS</span>
            </button>
            <button type="button" role="tab" aria-selected={activeTab === 'android'} onClick={() => setActiveTab('android')} className={tabClass('android')}>
              <Smartphone className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span>Android</span>
            </button>
            <button type="button" role="tab" aria-selected={activeTab === 'native'} onClick={() => setActiveTab('native')} className={tabClass('native')}>
              <Code className="w-4 h-4 text-indigo-600" aria-hidden="true" />
              <span>Capacitor</span>
            </button>
          </div>

          <div className="space-y-4 text-sm text-slate-700">

            {/* iOS INSTRUCTIONS */}
            {activeTab === 'ios' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/80 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs text-emerald-900">
                    <span className="font-bold">No App Store needed:</span> save AllerScan from Safari
                    to your Home Screen. It opens full-screen with camera access, and your profile,
                    logs and scans stay on the device.
                  </div>
                </div>

                <ol className="space-y-3">
                  {[
                    {
                      title: 'Open in Safari',
                      icon: <ExternalLink className="w-3 h-3 text-slate-400" aria-hidden="true" />,
                      body: "Open this app's URL in Apple Safari on your iPhone or iPad. Other iOS browsers can't add to the Home Screen.",
                    },
                    {
                      title: 'Tap the Share button',
                      icon: <Share2 className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />,
                      body: 'Tap the Share icon at the bottom of Safari (the square with an arrow pointing upward).',
                    },
                    {
                      title: 'Select "Add to Home Screen"',
                      icon: <PlusSquare className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />,
                      body: 'Scroll down the share sheet, tap Add to Home Screen, then confirm with Add.',
                    },
                  ].map((stepItem, idx) => (
                    <li key={stepItem.title} className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                      <span className="w-7 h-7 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>
                        <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          {stepItem.title} {stepItem.icon}
                        </span>
                        <span className="text-xs text-slate-500 mt-0.5 block">{stepItem.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ANDROID INSTRUCTIONS */}
            {activeTab === 'android' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/80 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs text-emerald-900">
                    <span className="font-bold">Progressive Web App:</span> installs to your app
                    drawer with its own window and camera permissions. Alerts appear in the app's
                    notification bell, not as Android system notifications.
                  </div>
                </div>

                {deferredPrompt && (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-2xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>Install on this device</span>
                  </button>
                )}

                <ol className="space-y-3">
                  {[
                    { title: 'Open in Chrome or Samsung Internet', body: 'Navigate to this URL on your Android device.' },
                    { title: 'Tap the browser menu (⋮)', body: 'Tap the three dots in the top-right corner of Chrome.' },
                    { title: 'Tap "Install app" or "Add to Home screen"', body: 'The AllerScan icon appears in your app drawer and home screen.' },
                  ].map((stepItem, idx) => (
                    <li key={stepItem.title} className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                      <span className="w-7 h-7 rounded-xl bg-emerald-700 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span>
                        <span className="font-bold text-xs text-slate-900 block">{stepItem.title}</span>
                        <span className="text-xs text-slate-500 mt-0.5 block">{stepItem.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* NATIVE APP STORE / PLAY STORE (CAPACITOR) */}
            {activeTab === 'native' && (
              <div className="space-y-3">
                <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-200/80 flex items-start gap-3">
                  <Layers className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-xs text-indigo-900">
                    <span className="font-bold">Capacitor configured:</span> the repository includes{' '}
                    <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono">capacitor.config.json</code> as a
                    starting point for native Xcode / Android Studio builds.
                  </div>
                </div>

                <div className="p-3 bg-slate-900 rounded-2xl text-slate-200 font-mono text-xs space-y-2 overflow-x-auto">
                  <div className="text-slate-400 text-[11px]">{'// 1. Install the Capacitor tooling'}</div>
                  <div className="text-emerald-400">npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android</div>
                  <div className="text-slate-400 text-[11px]">{'// 2. Build web assets & add mobile platforms'}</div>
                  <div className="text-emerald-400">npm run build</div>
                  <div className="text-emerald-400">npx cap add ios</div>
                  <div className="text-emerald-400">npx cap add android</div>
                  <div className="text-slate-400 text-[11px]">{'// 3. Open in Xcode or Android Studio'}</div>
                  <div className="text-emerald-400">npx cap open ios</div>
                  <div className="text-emerald-400">npx cap open android</div>
                </div>

                <p className="text-xs text-slate-500">
                  Set <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">server.url</code> in the Capacitor
                  config to a reachable HTTPS instance of this server first — a locally bundled build
                  loads from a non-web origin, which no HTTP-referrer restriction on the Maps key can match.
                </p>
              </div>
            )}

          </div>
        </>
      )}
    </Modal>
  );
};
