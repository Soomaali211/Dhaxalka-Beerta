import React, { useEffect, useRef } from 'react';
import {
  APIProvider,
  Map,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';

const GMP_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

export type GoogleUnderlayStatus = 'loading' | 'ready' | 'fallback';

interface GoogleSatelliteUnderlayProps {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom: number;
  showHybridLabels: boolean;
  onStatusChange: (status: GoogleUnderlayStatus) => void;
}

const CameraAndStatusSync: React.FC<{
  center: { lat: number; lng: number };
  zoom: number;
  showHybridLabels: boolean;
  onStatusChange: (status: GoogleUnderlayStatus) => void;
}> = ({ center, zoom, showHybridLabels, onStatusChange }) => {
  const map = useMap();
  const loadingStatus = useApiLoadingStatus();
  const lastReportedRef = useRef<GoogleUnderlayStatus | null>(null);

  const reportStatus = (next: GoogleUnderlayStatus) => {
    if (lastReportedRef.current !== next) {
      lastReportedRef.current = next;
      onStatusChange(next);
    }
  };

  useEffect(() => {
    const win = window as unknown as { gm_authFailure?: () => void };
    const previousHandler = win.gm_authFailure;
    win.gm_authFailure = () => {
      reportStatus('fallback');
      if (typeof previousHandler === 'function') {
        previousHandler();
      }
    };
    return () => {
      win.gm_authFailure = previousHandler;
    };
  }, []);

  useEffect(() => {
    if (loadingStatus === APILoadingStatus.LOADED) {
      reportStatus('ready');
    } else if (
      loadingStatus === APILoadingStatus.FAILED ||
      loadingStatus === APILoadingStatus.AUTH_FAILURE
    ) {
      reportStatus('fallback');
    } else if (loadingStatus === APILoadingStatus.LOADING) {
      reportStatus('loading');
    }
  }, [loadingStatus]);

  useEffect(() => {
    if (!map) return;
    map.moveCamera({
      center: { lat: center.lat, lng: center.lng },
      zoom: Math.round(zoom),
    });
  }, [map, center.lat, center.lng, zoom]);

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(showHybridLabels ? 'hybrid' : 'satellite');
  }, [map, showHybridLabels]);

  return null;
};

export const GoogleSatelliteUnderlay: React.FC<GoogleSatelliteUnderlayProps> = ({
  apiKey,
  center,
  zoom,
  showHybridLabels,
  onStatusChange,
}) => {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
      <APIProvider
        apiKey={apiKey}
        solutionChannel="GMP_mcp_codeassist_v1_aistudio"
      >
        <Map
          defaultCenter={center}
          defaultZoom={Math.round(zoom)}
          mapTypeId={showHybridLabels ? 'hybrid' : 'satellite'}
          disableDefaultUI={false}
          zoomControl={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          rotateControl={false}
          scaleControl={false}
          cameraControl={false}
          keyboardShortcuts={false}
          gestureHandling="none"
          internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
          className="w-full h-full"
        />
        <CameraAndStatusSync
          center={center}
          zoom={zoom}
          showHybridLabels={showHybridLabels}
          onStatusChange={onStatusChange}
        />
      </APIProvider>
    </div>
  );
};
