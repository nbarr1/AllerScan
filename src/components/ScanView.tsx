import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Search,
  MapPin,
  Clock,
  ChevronRight,
  RefreshCw,
  XCircle,
  Trees,
  Wheat,
  Flower2,
  Biohazard,
  Info,
  History
} from 'lucide-react';
import { MASTER_ALLERGENS } from '../data/allergensDatabase';
import { SCAN_PRESET_SAMPLES, ScanPresetSample } from '../data/sampleScans';
import { ScanResult, UserAllergenProfile, SeverityLevel, AllergenCategory } from '../types';

interface ScanViewProps {
  userProfile: UserAllergenProfile;
  scanHistory: ScanResult[];
  onAddScan: (result: ScanResult) => void;
}

export const ScanView: React.FC<ScanViewProps> = ({
  userProfile,
  scanHistory,
  onAddScan,
}) => {
  const [mode, setMode] = useState<'camera' | 'upload' | 'preset' | 'manual'>('preset');
  const [selectedImage, setSelectedImage] = useState<string | null>(SCAN_PRESET_SAMPLES[0].imageUrl);
  const [isScanning, setIsScanning] = useState(false);
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Start live webcam stream
  const startCamera = async () => {
    try {
      setCameraActive(true);
      setMode('camera');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      alert('Unable to access camera. Please allow camera permissions or upload an image file.');
      setCameraActive(false);
      setMode('upload');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const captureCameraFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setSelectedImage(dataUrl);
      stopCamera();
      runScanAnalysis(dataUrl);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSelectedImage(base64);
      runScanAnalysis(base64);
    };
    reader.readAsDataURL(file);
  };

  const handlePresetSelect = (preset: ScanPresetSample) => {
    setSelectedImage(preset.imageUrl);
    runScanAnalysis(preset.imageUrl, preset);
  };

  // Run Gemini AI vision scan via /api/scan
  const runScanAnalysis = async (imgData: string, presetOverride?: ScanPresetSample) => {
    setIsScanning(true);
    setCurrentResult(null);

    try {
      let payload: Record<string, any> = imgData.startsWith('data:')
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

      const resData = await resp.json();

      let scanData = resData.data;

      // If preset provided and fallback occurred, refine with preset details
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

      // Check if matched allergen is in user profile
      const matchedId = scanData.matchedAllergenId;
      const isUserAllergen = Boolean(matchedId && userProfile.allergens[matchedId]);
      const userSeverity = isUserAllergen ? userProfile.allergens[matchedId] : undefined;

      // A real camera/upload scan that fell back to a random canned result (Gemini unavailable)
      // did NOT actually analyze the user's photo — this must be disclosed, not shown as a real match.
      const isSimulatedResult = !presetOverride && resData.source === 'local-heuristic';

      const newScanResult: ScanResult = {
        id: 'scan_' + Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' Today',
        imageUrl: imgData,
        speciesName: scanData.speciesName || 'Identified Plant Species',
        scientificName: scanData.scientificName || 'Botanical Species',
        category: (scanData.category as AllergenCategory) || 'tree',
        confidence: scanData.confidence || 88,
        isUserAllergen,
        matchedAllergenId: matchedId,
        userSeverity,
        details: scanData.details || 'Botanical sample analyzed for environmental allergen risk.',
        identifyingFeatures: scanData.identifyingFeatures || ['Distinctive foliage', 'Reproductive floral structure'],
        locationStr: `${userProfile.location.cityName}, ${userProfile.location.region.split(',')[0]}`,
        isSimulatedResult,
      };

      setCurrentResult(newScanResult);
      onAddScan(newScanResult);
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Camera className="w-6 h-6 text-emerald-600" />
            "Scan Surroundings" — AI Allergen Analyzer
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Identify trees, grasses, weeds, and molds using Gemini Vision AI and cross-reference your allergen profile.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
          <button
            onClick={() => { stopCamera(); setMode('preset'); }}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
              mode === 'preset' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sample Test
          </button>
          <button
            onClick={startCamera}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
              mode === 'camera' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Camera
          </button>
          <button
            onClick={() => { stopCamera(); setMode('upload'); }}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
              mode === 'upload' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload
          </button>
          <button
            onClick={() => { stopCamera(); setMode('manual'); }}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
              mode === 'manual' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Browse DB
          </button>
        </div>
      </div>

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
                    className="w-full h-full object-cover"
                  />
                  {/* Viewfinder Reticle Overlay */}
                  <div className="absolute inset-8 border-2 border-emerald-400/60 rounded-2xl border-dashed pointer-events-none flex items-center justify-center">
                    <span className="text-[11px] font-bold text-emerald-300 bg-slate-900/80 px-3 py-1 rounded-full">
                      Align Plant or Leaf Here
                    </span>
                  </div>
                  <button
                    onClick={captureCameraFrame}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-full shadow-2xl flex items-center gap-2 animate-bounce"
                  >
                    <Camera className="w-4 h-4" /> Capture & Scan Photo
                  </button>
                </div>
              ) : selectedImage ? (
                <div className="relative w-full h-full">
                  <img
                    src={selectedImage}
                    alt="Plant scan preview"
                    className="w-full h-full object-cover"
                  />
                  {isScanning && (
                    <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <Sparkles className="w-10 h-10 text-emerald-400 animate-spin" />
                      <p className="text-sm font-extrabold text-white">Gemini AI Vision Analyzing Plant Features...</p>
                      <p className="text-xs text-slate-400">Comparing botanical species against your allergen profile</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-3">
                  <Upload className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-xs font-semibold">Select a sample below or upload an image file</p>
                </div>
              )}

            </div>

            {/* Upload File Input */}
            {mode === 'upload' && (
              <label className="block p-4 bg-white border-2 border-dashed border-slate-300 rounded-2xl text-center cursor-pointer hover:border-emerald-500 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <span className="text-xs font-bold text-slate-700 flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-600" /> Choose Image File from Device
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
                      key={sample.id}
                      onClick={() => handlePresetSelect(sample)}
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                        selectedImage === sample.imageUrl
                          ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <img
                        src={sample.imageUrl}
                        alt={sample.title}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-900 truncate">{sample.speciesName}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{sample.categoryName}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right Panel: SCAN RESULT DISPLAY */}
          <div className="lg:col-span-7 space-y-4">
            
            {currentResult ? (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-lg space-y-5 animate-in fade-in duration-200">

                {/* SIMULATED RESULT DISCLOSURE */}
                {currentResult.isSimulatedResult && (
                  <div className="p-4 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
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
                    <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide">
                      {currentResult.isUserAllergen
                        ? '⚠️ MATCH FOUND IN YOUR PROFILE!'
                        : 'NOT IN YOUR ALLERGEN PROFILE'}
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
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                      Species Identification
                    </span>
                    <h2 className="text-xl font-black text-slate-900">{currentResult.speciesName}</h2>
                    <p className="text-xs text-slate-500 italic font-medium">{currentResult.scientificName}</p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Match Confidence</span>
                    <div className="text-lg font-black text-emerald-600">{currentResult.confidence}%</div>
                  </div>
                </div>

                {/* Key Identifying Features */}
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

                {/* Description Details */}
                <div className="p-3 bg-slate-50 rounded-2xl text-xs text-slate-600 leading-relaxed border border-slate-100">
                  {currentResult.details}
                </div>

                {/* Disclaimer Guardrail */}
                <div className="flex items-center gap-2 text-[11px] text-slate-400 italic">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Confidence is calculated probabilistically by Vision AI and is not 100% diagnostic certainty.</span>
                </div>

              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center space-y-3">
                <Sparkles className="w-8 h-8 mx-auto text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800">Ready to Scan Plant or Mold</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Capture a photo using your camera or click a sample on the left to run Gemini Vision identification.
                </p>
              </div>
            )}

          </div>

        </div>
      )}

      {/* MANUAL SEARCH / BROWSE DATABASE MODE */}
      {mode === 'manual' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={manualSearchQuery}
              onChange={(e) => setManualSearchQuery(e.target.value)}
              placeholder="Search allergen database by common or scientific name (e.g. Oak, Ragweed, Bermuda)..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MASTER_ALLERGENS.filter(
              (item) =>
                item.name.toLowerCase().includes(manualSearchQuery.toLowerCase()) ||
                item.scientificName.toLowerCase().includes(manualSearchQuery.toLowerCase())
            ).map((item) => {
              const isSaved = Boolean(userProfile.allergens[item.id]);
              return (
                <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-shadow">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-32 object-cover" />
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                        <p className="text-[11px] text-slate-400 italic">{item.scientificName}</p>
                      </div>
                      {isSaved && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          In Profile
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{item.description}</p>
                    <div className="text-[11px] font-semibold text-slate-500">
                      Season: {item.season}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RECENT SCAN HISTORY LOG */}
      <div className="space-y-3 pt-4 border-t border-slate-200">
        <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
          <History className="w-4 h-4 text-slate-600" /> Logged Camera Scan History ({scanHistory.length})
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {scanHistory.map((scan) => (
            <div key={scan.id} className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <img src={scan.imageUrl} alt={scan.speciesName} className="w-14 h-14 rounded-xl object-cover shrink-0" />
              <div className="truncate flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-slate-900 truncate">{scan.speciesName}</span>
                  {scan.isUserAllergen ? (
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Profile Match" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Safe" />
                  )}
                </div>
                <div className="text-[11px] text-slate-400 truncate">{scan.scientificName}</div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-1">
                  <span>📍 {scan.locationStr}</span>
                  <span>• {scan.timestamp}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
