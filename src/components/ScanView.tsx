import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Search,
  XCircle,
  Info,
  History,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { MASTER_ALLERGENS } from '../data/allergensDatabase';
import { SCAN_PRESET_SAMPLES, ScanPresetSample } from '../data/sampleScans';
import { ScanResult, UserAllergenProfile, AllergenCategory } from '../types';

interface ScanViewProps {
  userProfile: UserAllergenProfile;
  scanHistory: ScanResult[];
  onAddScan: (result: ScanResult) => void;
  onDeleteScan: (id: string) => void;
}

/**
 * Longest edge, in pixels, for a stored scan photo. A modern phone camera produces a 3-8 MB data
 * URL; a handful of those exhausts the ~5 MB localStorage budget and the history silently stops
 * persisting. This is plenty for the thumbnail the history list shows, and the full-resolution
 * frame is still what gets sent to the model.
 */
const STORED_IMAGE_MAX_EDGE = 900;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Re-encodes a data URL down to `maxEdge` on its longest side. Returns the original on failure. */
function downscaleDataUrl(dataUrl: string, maxEdge = STORED_IMAGE_MAX_EDGE): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      if (scale === 1) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function formatScanTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso; // Tolerate entries saved by an older build.

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.floor((startOfToday.getTime() - date.getTime()) / 86400000);

  if (date >= startOfToday) return `${time} today`;
  if (dayDiff === 0) return `${time} yesterday`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export const ScanView: React.FC<ScanViewProps> = ({
  userProfile,
  scanHistory,
  onAddScan,
  onDeleteScan,
}) => {
  const [mode, setMode] = useState<'camera' | 'upload' | 'preset' | 'manual'>('preset');
  const [selectedImage, setSelectedImage] = useState<string | null>(SCAN_PRESET_SAMPLES[0].imageUrl);
  const [isScanning, setIsScanning] = useState(false);
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ image: string; preset?: ScanPresetSample } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  // Release the camera when the user leaves this tab, backgrounds the app, or closes it. Without
  // this the MediaStream tracks outlive the component and the device's camera indicator stays on.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') stopCamera();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', stopCamera);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', stopCamera);
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    setMode('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraActive(true);
      // The <video> mounts on the render triggered by setCameraActive, so attach after it exists.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      console.error('Camera access error:', err);
      stopCamera();
      setMode('upload');
      setCameraError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was declined. Allow camera access in your browser settings, or upload a photo instead.'
          : 'No camera is available on this device. Upload a photo instead.'
      );
    }
  };

  const captureCameraFrame = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setSelectedImage(dataUrl);
    stopCamera();
    await runScanAnalysis(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // Allow re-picking the same file after an error.
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setScanError('That file isn’t an image. Choose a JPEG, PNG, or HEIC photo.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setScanError('That photo is larger than 15 MB. Try a smaller image or take one with the camera.');
      return;
    }

    setScanError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSelectedImage(base64);
      runScanAnalysis(base64);
    };
    reader.onerror = () => {
      setScanError("Couldn't read that file. Try another photo.");
    };
    reader.readAsDataURL(file);
  };

  const handlePresetSelect = (preset: ScanPresetSample) => {
    setSelectedImage(preset.imageUrl);
    runScanAnalysis(preset.imageUrl, preset);
  };

  // Run the Gemini vision scan via /api/scan.
  const runScanAnalysis = async (imgData: string, presetOverride?: ScanPresetSample) => {
    setIsScanning(true);
    setCurrentResult(null);
    setScanError(null);
    lastScanRef.current = { image: imgData, preset: presetOverride };

    try {
      const payload: Record<string, any> = imgData.startsWith('data:')
        ? { imageBase64: imgData }
        : { imageUrl: imgData };

      if (presetOverride) {
        payload.presetHint = {
          speciesName: presetOverride.speciesName,
          scientificName: presetOverride.scientificName,
          category: presetOverride.category,
          confidence: presetOverride.confidence,
          matchedAllergenId: presetOverride.matchedAllergenId,
          identifyingFeatures: presetOverride.identifyingFeatures,
          details: presetOverride.details,
        };
      }

      const resp = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        throw new Error(`The scan service returned ${resp.status}`);
      }

      const resData = await resp.json();
      let scanData = resData?.data;

      // A preset carries verified botanical data, so it can stand in if the server fell back.
      if (presetOverride && (!scanData || resData.source === 'local-heuristic')) {
        scanData = {
          speciesName: presetOverride.speciesName,
          scientificName: presetOverride.scientificName,
          category: presetOverride.category,
          confidence: presetOverride.confidence,
          matchedAllergenId: presetOverride.matchedAllergenId,
          identifyingFeatures: presetOverride.identifyingFeatures,
          details: presetOverride.details,
        };
      }

      if (!scanData || typeof scanData !== 'object' || !scanData.speciesName) {
        throw new Error('The scan service returned an unreadable result');
      }

      const matchedId: string | undefined = scanData.matchedAllergenId;
      const isUserAllergen = Boolean(matchedId && userProfile.allergens[matchedId]);
      const userSeverity = isUserAllergen && matchedId ? userProfile.allergens[matchedId] : undefined;

      // A real camera/upload scan that fell back to a canned result did NOT analyse the user's
      // photo — that has to be disclosed, not shown as a real identification.
      const isSimulatedResult = !presetOverride && resData.source === 'local-heuristic';

      // Stored at a size that fits localStorage; the full-resolution frame went to the model.
      const storedImage = imgData.startsWith('data:') ? await downscaleDataUrl(imgData) : imgData;

      const newScanResult: ScanResult = {
        id: 'scan_' + Date.now(),
        timestamp: new Date().toISOString(),
        imageUrl: storedImage,
        speciesName: scanData.speciesName,
        scientificName: scanData.scientificName || '',
        category: (scanData.category as AllergenCategory) || 'non_allergen',
        confidence:
          typeof scanData.confidence === 'number' && Number.isFinite(scanData.confidence)
            ? scanData.confidence
            : undefined,
        isUserAllergen,
        matchedAllergenId: matchedId,
        userSeverity,
        details: scanData.details || '',
        identifyingFeatures: Array.isArray(scanData.identifyingFeatures) ? scanData.identifyingFeatures : [],
        locationStr: [userProfile.location.cityName, userProfile.location.region.split(',')[0]]
          .filter(Boolean)
          .join(', '),
        isSimulatedResult,
      };

      setCurrentResult(newScanResult);
      onAddScan(newScanResult);
    } catch (err) {
      console.error('Scan error:', err);
      setScanError(
        err instanceof TypeError
          ? "Couldn't reach the scan service. Check your connection and try again."
          : err instanceof Error
          ? `${err.message}. Try again in a moment.`
          : 'The scan failed. Try again in a moment.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const retryLastScan = () => {
    const last = lastScanRef.current;
    if (last) runScanAnalysis(last.image, last.preset);
  };

  const filteredDatabase = MASTER_ALLERGENS.filter((item) => {
    const query = manualSearchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) || item.scientificName.toLowerCase().includes(query)
    );
  });

  const modeButtonClass = (target: typeof mode) =>
    `flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
      mode === target ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <div className="space-y-6 pb-20 md:pb-8">

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Camera className="w-6 h-6 text-emerald-600" aria-hidden="true" />
            Scan Surroundings — AI Allergen Analyzer
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Identify trees, grasses, weeds, and molds using Gemini Vision AI and cross-reference your allergen profile.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto" role="tablist" aria-label="Scan input mode">
          <button type="button" role="tab" aria-selected={mode === 'preset'} onClick={() => { stopCamera(); setMode('preset'); }} className={modeButtonClass('preset')}>
            Sample Test
          </button>
          <button type="button" role="tab" aria-selected={mode === 'camera'} onClick={startCamera} className={modeButtonClass('camera')}>
            Camera
          </button>
          <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => { stopCamera(); setMode('upload'); }} className={modeButtonClass('upload')}>
            Upload
          </button>
          <button type="button" role="tab" aria-selected={mode === 'manual'} onClick={() => { stopCamera(); setMode('manual'); }} className={modeButtonClass('manual')}>
            Browse DB
          </button>
        </div>
      </div>

      {cameraError && (
        <div role="status" className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-900">{cameraError}</p>
        </div>
      )}

      {/* MAIN CAMERA / CAPTURE VIEW */}
      {mode !== 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Panel: Camera / Viewfinder / Upload */}
          <div className="lg:col-span-5 space-y-4">

            {/* Camera Feed / Image Preview Container */}
            <div className="relative aspect-4/3 rounded-3xl bg-slate-900 border-2 border-slate-800 overflow-hidden shadow-xl flex items-center justify-center">

              {mode === 'camera' && cameraActive ? (
                <div className="relative w-full h-full">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-8 border-2 border-emerald-400/60 rounded-2xl border-dashed pointer-events-none flex items-center justify-center">
                    <span className="text-[11px] font-bold text-emerald-300 bg-slate-900/80 px-3 py-1 rounded-full">
                      Align Plant or Leaf Here
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={captureCameraFrame}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-full shadow-2xl flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" /> Capture &amp; Scan Photo
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="absolute top-3 right-3 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-white text-[11px] font-bold rounded-full"
                  >
                    Turn camera off
                  </button>
                </div>
              ) : selectedImage ? (
                <div className="relative w-full h-full">
                  <img src={selectedImage} alt="Plant scan preview" className="w-full h-full object-cover" />
                  {isScanning && (
                    <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <Sparkles className="w-10 h-10 text-emerald-400 animate-spin" aria-hidden="true" />
                      <p className="text-sm font-extrabold text-white">Gemini AI Vision analyzing plant features…</p>
                      <p className="text-xs text-slate-400">Comparing botanical species against your allergen profile</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-3">
                  <Upload className="w-10 h-10 mx-auto text-slate-600" aria-hidden="true" />
                  <p className="text-xs font-semibold">Select a sample below or upload an image file</p>
                </div>
              )}

            </div>

            {/* Upload File Input */}
            {mode === 'upload' && (
              <label className="block p-4 bg-white border-2 border-dashed border-slate-300 rounded-2xl text-center cursor-pointer hover:border-emerald-500 transition-colors">
                <input type="file" accept="image/*" onChange={handleFileUpload} className="sr-only" />
                <span className="text-xs font-bold text-slate-700 flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Choose Image File from Device
                </span>
              </label>
            )}

            {/* Quick Sample Selector */}
            {mode === 'preset' && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Select Quick Test Sample Photo:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {SCAN_PRESET_SAMPLES.map((sample) => (
                    <button
                      type="button"
                      key={sample.id}
                      onClick={() => handlePresetSelect(sample)}
                      aria-pressed={selectedImage === sample.imageUrl}
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                        selectedImage === sample.imageUrl
                          ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <img src={sample.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      <span className="truncate">
                        <span className="text-xs font-bold text-slate-900 truncate block">{sample.speciesName}</span>
                        <span className="text-[10px] text-slate-400 capitalize">{sample.categoryName}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right Panel: SCAN RESULT DISPLAY */}
          <div className="lg:col-span-7 space-y-4">

            {scanError ? (
              <div role="alert" className="bg-white p-6 rounded-3xl border-2 border-amber-300 shadow-lg space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Scan didn't complete</h3>
                    <p className="text-xs text-slate-600 mt-1">{scanError}</p>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Nothing was added to your scan history.
                    </p>
                  </div>
                </div>
                {lastScanRef.current && (
                  <button
                    type="button"
                    onClick={retryLastScan}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Try this photo again</span>
                  </button>
                )}
              </div>
            ) : currentResult ? (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-lg space-y-5">

                {/* SIMULATED RESULT DISCLOSURE */}
                {currentResult.isSimulatedResult && (
                  <div className="p-4 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-xs text-amber-900">
                      <span className="font-black block">AI Vision Unavailable — Example Result Shown</span>
                      <span>Gemini could not analyze your photo right now, so this is a placeholder example, not a real identification of your image. Try again shortly.</span>
                    </div>
                  </div>
                )}

                {/* MATCH BANNER ALERT */}
                <div className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                  currentResult.isUserAllergen
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}>
                  {currentResult.isUserAllergen ? (
                    <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide">
                      {currentResult.isUserAllergen ? 'Match found in your profile' : 'Not in your allergen profile'}
                    </h3>
                    <p className="text-xs font-semibold mt-1">
                      {currentResult.isUserAllergen ? (
                        <>
                          Identified <strong>{currentResult.speciesName}</strong> — listed as one of your{' '}
                          <span className="underline font-bold capitalize">{currentResult.userSeverity} severity</span> allergens.
                        </>
                      ) : (
                        <>
                          Identified <strong>{currentResult.speciesName}</strong> — this species is not in your current profile list.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Species Header & Confidence */}
                <div className="flex justify-between items-start border-b border-slate-100 pb-4 gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                      Species Identification
                    </span>
                    <h2 className="text-xl font-black text-slate-900">{currentResult.speciesName}</h2>
                    {currentResult.scientificName && (
                      <p className="text-xs text-slate-500 italic font-medium">{currentResult.scientificName}</p>
                    )}
                  </div>

                  {/* Only shown when the model actually reported one. */}
                  {typeof currentResult.confidence === 'number' && (
                    <div className="text-right shrink-0">
                      <span className="text-xs text-slate-400 block">Match Confidence</span>
                      <div className="text-lg font-black text-emerald-600">{currentResult.confidence}%</div>
                    </div>
                  )}
                </div>

                {/* Key Identifying Features */}
                {currentResult.identifyingFeatures.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-800">Visual Identification Features:</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {currentResult.identifyingFeatures.map((feat, idx) => (
                        <span key={idx} className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg">
                          • {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description Details */}
                {currentResult.details && (
                  <div className="p-3 bg-slate-50 rounded-2xl text-xs text-slate-600 leading-relaxed border border-slate-100">
                    {currentResult.details}
                  </div>
                )}

                {/* Disclaimer Guardrail */}
                <div className="flex items-center gap-2 text-[11px] text-slate-400 italic">
                  <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Identification is a probabilistic model estimate, not diagnostic certainty.</span>
                </div>

              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center space-y-3">
                <Sparkles className="w-8 h-8 mx-auto text-emerald-600" aria-hidden="true" />
                <h3 className="text-sm font-bold text-slate-800">Ready to Scan Plant or Mold</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Capture a photo using your camera or choose a sample on the left to run Gemini Vision identification.
                </p>
              </div>
            )}

          </div>

        </div>
      )}

      {/* MANUAL SEARCH / BROWSE DATABASE MODE */}
      {mode === 'manual' && (
        <div className="space-y-4">
          <div>
            <label htmlFor="allergen-db-search" className="sr-only">
              Search the allergen database
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" />
              <input
                id="allergen-db-search"
                type="text"
                value={manualSearchQuery}
                onChange={(e) => setManualSearchQuery(e.target.value)}
                placeholder="Search allergen database by common or scientific name (e.g. Oak, Ragweed, Bermuda)…"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
              />
            </div>
          </div>

          {filteredDatabase.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl">
              No allergens in the database match "{manualSearchQuery}". Try a common name like "oak" or "ragweed".
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDatabase.map((item) => {
                const isSaved = Boolean(userProfile.allergens[item.id]);
                return (
                  <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="w-full h-32 object-cover" />
                    )}
                    <div className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                          <p className="text-[11px] text-slate-400 italic">{item.scientificName}</p>
                        </div>
                        {isSaved && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                            In Profile
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{item.description}</p>
                      <div className="text-[11px] font-semibold text-slate-500">Season: {item.season}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RECENT SCAN HISTORY LOG */}
      <div className="space-y-3 pt-4 border-t border-slate-200">
        <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
          <History className="w-4 h-4 text-slate-600" aria-hidden="true" /> Logged Camera Scan History ({scanHistory.length})
        </h2>

        {scanHistory.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            Scans you run are saved here on this device so you can look them up later.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scanHistory.map((scan) => (
              <div key={scan.id} className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
                <img src={scan.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                <div className="truncate flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-slate-900 truncate">{scan.speciesName}</span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${scan.isUserAllergen ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {scan.isUserAllergen ? 'Matches your profile' : 'Not in your profile'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{scan.scientificName}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-1">
                    <span className="truncate">{scan.locationStr}</span>
                    <span className="shrink-0">• {formatScanTimestamp(scan.timestamp)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteScan(scan.id)}
                  aria-label={`Delete scan of ${scan.speciesName}`}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
