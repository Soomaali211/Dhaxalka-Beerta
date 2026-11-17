import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Check,
  Compass,
  Crosshair,
  MapPin,
  Maximize2,
  Navigation,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Ruler,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

export type MeasurementToolType = 'polygon' | 'polyline' | 'marker';
export type MeasurementModeType = 'manual' | 'gps';
export type MeasurementSessionStatus = 'idle' | 'configuring' | 'active' | 'paused' | 'finished';

export interface SavedMeasurement {
  id: string;
  type: MeasurementToolType;
  mode: MeasurementModeType;
  title: string;
  timestamp: string;
  latLngs: [number, number][];
  areaSqM?: number;
  perimeterM?: number;
  distanceM?: number;
  accuracyM?: number;
}

interface MapMeasurementManagerProps {
  mapInstance: L.Map | null;
  isPaperMode: boolean;
  onNotify: (title: string, message: string) => void;
  onSaveMeasurement: (measurement: SavedMeasurement) => void;
}

// Haversine distance in meters between two lat/lng points
function calculateHaversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate polygon area in square meters using Shoelace formula on local cartesian projection
function calculatePolygonAreaSqM(latLngs: [number, number][]): { areaSqM: number; perimeterM: number } {
  if (latLngs.length < 3) return { areaSqM: 0, perimeterM: 0 };
  
  let perimeter = 0;
  for (let i = 0; i < latLngs.length; i++) {
    const p1 = latLngs[i];
    const p2 = latLngs[(i + 1) % latLngs.length];
    perimeter += calculateHaversineDistanceMeters(p1[0], p1[1], p2[0], p2[1]);
  }

  // Reference latitude for meter conversion
  const refLat = latLngs[0][0];
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * refLat * Math.PI / 180);
  const mPerDegLng = 111412.84 * Math.cos(refLat * Math.PI / 180);

  const xy = latLngs.map(([lat, lng]) => [(lng - latLngs[0][1]) * mPerDegLng, (lat - refLat) * mPerDegLat]);

  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    area += x1 * y2 - x2 * y1;
  }

  return { areaSqM: Math.abs(area / 2), perimeterM: perimeter };
}

// Calculate polyline total distance
function calculatePolylineDistanceMeters(latLngs: [number, number][]): number {
  let dist = 0;
  for (let i = 0; i < latLngs.length - 1; i++) {
    dist += calculateHaversineDistanceMeters(latLngs[i][0], latLngs[i][1], latLngs[i + 1][0], latLngs[i + 1][1]);
  }
  return dist;
}

export const MapMeasurementManager: React.FC<MapMeasurementManagerProps> = ({
  mapInstance,
  isPaperMode,
  onNotify,
  onSaveMeasurement,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [selectedTool, setSelectedTool] = useState<MeasurementToolType | null>(null);
  const [isModeSelectorOpen, setIsModeSelectorOpen] = useState<boolean>(false);
  
  const [sessionStatus, setSessionStatus] = useState<MeasurementSessionStatus>('idle');
  const [activeMode, setActiveMode] = useState<MeasurementModeType>('manual');
  const [recordedPoints, setRecordedPoints] = useState<[number, number][]>([]);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(0);
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);
  const [measurementTitle, setMeasurementTitle] = useState<string>('');

  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet layer group for rendering measurements on map
  useEffect(() => {
    if (!mapInstance) return;
    const group = L.layerGroup().addTo(mapInstance);
    layerGroupRef.current = group;
    return () => {
      group.remove();
      layerGroupRef.current = null;
    };
  }, [mapInstance]);

  // Render geometry on map whenever recordedPoints changes
  useEffect(() => {
    if (!layerGroupRef.current) return;
    layerGroupRef.current.clearLayers();

    if (recordedPoints.length === 0) return;

    const group = layerGroupRef.current;

    if (selectedTool === 'marker') {
      recordedPoints.forEach((pt, idx) => {
        const marker = L.circleMarker(pt, {
          radius: 8,
          color: '#22C55E',
          fillColor: '#10B981',
          fillOpacity: 0.9,
          weight: 2.5,
        });
        marker.bindPopup(`<b>Marker #${idx + 1}</b><br/>Lat: ${pt[0].toFixed(5)}, Lng: ${pt[1].toFixed(5)}`);
        group.addLayer(marker);
      });
    } else if (selectedTool === 'polyline') {
      if (recordedPoints.length >= 2) {
        const polyline = L.polyline(recordedPoints, {
          color: '#3B82F6',
          weight: 4,
          opacity: 0.85,
        });
        group.addLayer(polyline);
      }
      recordedPoints.forEach((pt, idx) => {
        const ptMarker = L.circleMarker(pt, {
          radius: 5,
          color: '#1D4ED8',
          fillColor: '#93C5FD',
          fillOpacity: 1,
          weight: 2,
        });
        group.addLayer(ptMarker);
      });
    } else if (selectedTool === 'polygon') {
      if (recordedPoints.length >= 3) {
        const polygon = L.polygon(recordedPoints, {
          color: '#22C55E',
          fillColor: '#22C55E',
          fillOpacity: 0.25,
          weight: 3,
        });
        group.addLayer(polygon);
      } else if (recordedPoints.length >= 2) {
        const polyline = L.polyline(recordedPoints, {
          color: '#22C55E',
          weight: 3,
          dashArray: '5, 5',
        });
        group.addLayer(polyline);
      }
      recordedPoints.forEach((pt, idx) => {
        const ptMarker = L.circleMarker(pt, {
          radius: 6,
          color: '#15803D',
          fillColor: '#86EFAC',
          fillOpacity: 1,
          weight: 2,
        });
        group.addLayer(ptMarker);
      });
    }
  }, [recordedPoints, selectedTool]);

  // Handle Map Click for Manual Mode
  useEffect(() => {
    if (!mapInstance || sessionStatus !== 'active' || activeMode !== 'manual') return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const latLng: [number, number] = [e.latlng.lat, e.latlng.lng];
      setRecordedPoints((prev) => [...prev, latLng]);
    };

    mapInstance.on('click', handleMapClick);
    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [mapInstance, sessionStatus, activeMode]);

  // Handle GPS Tracking Mode
  useEffect(() => {
    if (sessionStatus !== 'active' || activeMode !== 'gps') {
      if (gpsWatchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchId);
        setGpsWatchId(null);
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify('GPS Cilad', 'Qalabkani ma taageero GPS tracking.');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 5;
        setGpsAccuracy(Math.round(accuracy));

        setRecordedPoints((prev) => {
          if (selectedTool === 'marker') {
            return [[lat, lng]];
          }
          // Avoid duplicate consecutive points if distance < 1 meter
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = calculateHaversineDistanceMeters(last[0], last[1], lat, lng);
            if (dist < 1.5) return prev;
          }
          return [...prev, [lat, lng]];
        });

        if (mapInstance && prevPointCountRef.current === 0) {
          mapInstance.setView([lat, lng], 17);
        }
      },
      (err) => {
        console.warn('GPS watch error:', err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    setGpsWatchId(id);

    return () => {
      navigator.geolocation.clearWatch(id);
    };
  }, [sessionStatus, activeMode, selectedTool, mapInstance]);

  const prevPointCountRef = useRef(0);
  useEffect(() => {
    prevPointCountRef.current = recordedPoints.length;
  }, [recordedPoints.length]);

  const handleSelectTool = (tool: MeasurementToolType) => {
    setSelectedTool(tool);
    setIsMenuOpen(false);
    setIsModeSelectorOpen(true);
  };

  const handleStartMeasurement = (mode: MeasurementModeType) => {
    setActiveMode(mode);
    setIsModeSelectorOpen(false);
    setSessionStatus('active');
    setRecordedPoints([]);
    setMeasurementTitle(
      selectedTool === 'polygon'
        ? 'Cabbirka Beerta (Polygon)'
        : selectedTool === 'polyline'
        ? 'Cabbirka Waddada (Polyline)'
        : 'Goobta Marker (Point)'
    );
    onNotify(
      'Cabbirku Waa Bilaabmay',
      mode === 'manual'
        ? 'Ku dhufo khariirada si aad u abuurto qodobbada xuduudka.'
        : 'GPS Tracking wuu shaqaynayaa. Dhaqaaq si aad u qabato xuduudaha.'
    );
  };

  const handlePauseResume = () => {
    setSessionStatus((prev) => (prev === 'active' ? 'paused' : 'active'));
  };

  const handleUndoPoint = () => {
    setRecordedPoints((prev) => prev.slice(0, -1));
  };

  const handleCancelSession = () => {
    setSessionStatus('idle');
    setSelectedTool(null);
    setRecordedPoints([]);
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers();
    }
    onNotify('Cabbirka Waa La Joojiyey', 'Lama keydin xogta cabbirka.');
  };

  const handleFinishAndSave = () => {
    if (recordedPoints.length < (selectedTool === 'marker' ? 1 : selectedTool === 'polyline' ? 2 : 3)) {
      onNotify('Xog Kugu Filan Ma Jiraan', 'Fadlan geli ugu yaraan qodobbada looga baahan yahay cabbirkan.');
      return;
    }

    const areaRes = selectedTool === 'polygon' ? calculatePolygonAreaSqM(recordedPoints) : { areaSqM: 0, perimeterM: 0 };
    const distanceM = selectedTool === 'polyline' ? calculatePolylineDistanceMeters(recordedPoints) : undefined;

    const newMeasurement: SavedMeasurement = {
      id: `MEAS-${Date.now().toString().slice(-6)}`,
      type: selectedTool || 'polygon',
      mode: activeMode,
      title: measurementTitle || `Cabbirka ${new Date().toLocaleTimeString()}`,
      timestamp: new Date().toISOString(),
      latLngs: recordedPoints,
      areaSqM: areaRes.areaSqM > 0 ? Math.round(areaRes.areaSqM) : undefined,
      perimeterM: areaRes.perimeterM > 0 ? Math.round(areaRes.perimeterM) : undefined,
      distanceM: distanceM !== undefined ? Math.round(distanceM) : undefined,
      accuracyM: activeMode === 'gps' ? gpsAccuracy : undefined,
    };

    onSaveMeasurement(newMeasurement);
    onNotify('Cabbirka Waa La Keydiyey', `Waxaa la keydiyey ${newMeasurement.title} guul leh.`);
    
    setSessionStatus('idle');
    setSelectedTool(null);
    setRecordedPoints([]);
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers();
    }
  };

  const currentAreaInfo = selectedTool === 'polygon' ? calculatePolygonAreaSqM(recordedPoints) : { areaSqM: 0, perimeterM: 0 };
  const currentDistM = selectedTool === 'polyline' ? calculatePolylineDistanceMeters(recordedPoints) : 0;

  return (
    <>
      {/* ONE FLOATING ACTION BUTTON (FAB) FOR MEASUREMENT */}
      <div className="absolute right-3 bottom-20 sm:bottom-24 z-30 flex flex-col items-end gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            if (sessionStatus === 'active') {
              // If active session, show panel instead
              return;
            }
            setIsMenuOpen((v) => !v);
            setIsModeSelectorOpen(false);
          }}
          aria-label="Cabbirka Dhulka iyo Khariirada"
          className="h-13 w-13 rounded-2xl bg-[#0B1220] hover:bg-[#111C2E] border border-emerald-500/50 text-[#22C55E] shadow-2xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer group"
          title="Nidaamka Cabbirka Dhulka (Measurement Tool)"
        >
          <Ruler className="w-6 h-6 stroke-[2.2] group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* POPUP MENU 1: THREE TOOLS (Field, Distance, Marker) */}
      {isMenuOpen && (
        <div className="absolute right-3 bottom-36 sm:bottom-40 z-40 w-64 rounded-2xl bg-white dark:bg-[#0B1220] border border-slate-200 dark:border-[#243449] shadow-2xl p-2.5 space-y-1.5 text-slate-900 dark:text-[#F8FAFC] animate-in fade-in zoom-in-95 duration-150 pointer-events-auto">
          <div className="flex items-center justify-between pb-1.5 px-2 border-b border-slate-200 dark:border-[#243449]">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Qalabka Cabbirka
            </span>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#16263D] text-slate-500 dark:text-slate-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleSelectTool('polygon')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-left transition-colors cursor-pointer group"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Square className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-extrabold">Field (Polygon)</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Cabbirka bedka iyo xuduudaha beerta</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool('polyline')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 text-left transition-colors cursor-pointer group"
          >
            <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
              <Route className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-extrabold">Distance (Polyline)</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Cabbirka waddooyinka iyo fogaanta</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool('marker')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/30 text-left transition-colors cursor-pointer group"
          >
            <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-extrabold">Marker (Point)</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Calaamadaynta goobaha gaarka ah</div>
            </div>
          </button>
        </div>
      )}

      {/* POPUP MENU 2: TWO MODES (Manual vs GPS) */}
      {isModeSelectorOpen && (
        <div className="absolute right-3 bottom-36 sm:bottom-40 z-40 w-64 rounded-2xl bg-white dark:bg-[#0B1220] border border-slate-200 dark:border-[#243449] shadow-2xl p-2.5 space-y-1.5 text-slate-900 dark:text-[#F8FAFC] animate-in fade-in zoom-in-95 duration-150 pointer-events-auto">
          <div className="flex items-center justify-between pb-1.5 px-2 border-b border-slate-200 dark:border-[#243449]">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Habka Cabbirka
            </span>
            <button
              type="button"
              onClick={() => setIsModeSelectorOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#16263D] text-slate-500 dark:text-slate-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleStartMeasurement('manual')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#16263D] text-left transition-colors cursor-pointer group"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Maximize2 className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-extrabold">Manual Measuring</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Ku sawir adoo ku dhufanaya khariirada</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleStartMeasurement('gps')}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#16263D] text-left transition-colors cursor-pointer group"
          >
            <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-xs font-extrabold">GPS Measuring</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Qabo GPS-kaaga adoo socda bannaanka</div>
            </div>
          </button>
        </div>
      )}

      {/* ACTIVE MEASUREMENT HUD / CONTROL BOTTOM SHEET */}
      {sessionStatus === 'active' && (
        <div className="fixed inset-x-3 bottom-16 sm:left-4 sm:w-[350px] lg:absolute lg:left-3 lg:bottom-3 z-50 rounded-2xl bg-white/98 dark:bg-[#0B1220]/98 backdrop-blur-md border border-slate-200 dark:border-[#243449] shadow-2xl p-3.5 space-y-3 text-slate-900 dark:text-[#F8FAFC] pointer-events-auto animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#243449] pb-2">
            <div>
              <div className="text-xs font-extrabold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>{measurementTitle} ({activeMode === 'gps' ? 'GPS Live' : 'Manual Touch'})</span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Qodobbada: {recordedPoints.length} {activeMode === 'gps' && `· ±${gpsAccuracy}m hubaal`}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCancelSession}
              className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer"
              title="Jooji Cabbirka"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Live Metric Cards */}
          <div className="grid grid-cols-2 gap-2 text-center">
            {selectedTool === 'polygon' && (
              <>
                <div className="rounded-xl bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#243449] p-2">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Bedka (Area)</div>
                  <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {Math.round(currentAreaInfo.areaSqM).toLocaleString()} m²
                  </div>
                  <div className="text-[9.5px] text-slate-400">
                    {(currentAreaInfo.areaSqM / 4200).toFixed(2)} Hectare
                  </div>
                </div>
                <div className="rounded-xl bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#243449] p-2">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Wareegga (Perimeter)</div>
                  <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                    {Math.round(currentAreaInfo.perimeterM).toLocaleString()} m
                  </div>
                </div>
              </>
            )}

            {selectedTool === 'polyline' && (
              <div className="col-span-2 rounded-xl bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#243449] p-2.5">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Fogaanta Warta (Distance)</div>
                <div className="text-base font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                  {Math.round(currentDistM).toLocaleString()} mitir ({ (currentDistM / 1000).toFixed(2) } km)
                </div>
              </div>
            )}

            {selectedTool === 'marker' && (
              <div className="col-span-2 rounded-xl bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#243449] p-2.5">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Goobta GPS-ka (Coordinates)</div>
                <div className="text-xs font-mono font-bold text-amber-500 tabular-nums">
                  {recordedPoints.length > 0 ? `${recordedPoints[0][0].toFixed(6)}°, ${recordedPoints[0][1].toFixed(6)}°` : 'Sugaya GPS...'}
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar: Start, Pause, Undo, Finish, Save */}
          <div className="flex items-center gap-1.5 pt-1">
            {activeMode === 'manual' && (
              <button
                type="button"
                onClick={handleUndoPoint}
                disabled={recordedPoints.length === 0}
                className="flex-1 min-h-[36px] rounded-xl bg-slate-100 dark:bg-[#0F1B2D] hover:bg-slate-200 dark:hover:bg-[#16263D] border border-slate-200 dark:border-[#243449] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleFinishAndSave}
              className="flex-[2] min-h-[38px] rounded-xl bg-[#22C55E] hover:bg-emerald-600 text-[#05130B] text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Keydi Cabbirka</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
