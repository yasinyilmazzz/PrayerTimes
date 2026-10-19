import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { GeoPoint, Settings } from '../lib/types';
import { STORAGE_KEYS, loadJSON, saveJSON } from '../lib/storage';
import { distanceKm, findNearestCity } from '../data/locations';
import { reverseGeocode } from '../lib/api';

/** Mesafe eşiği: 50 km */
export const DISTANCE_THRESHOLD_KM = 50;

/** Arka plan kontrolleri arasındaki asgari süre (1 dakika) */
const MIN_CHECK_INTERVAL_MS = 60_000;

export interface LocationShift {
  distanceKm: number;
  newLocation: GeoPoint;
}

export interface UseLocationMonitorProps {
  settings: Settings | null;
  online: boolean;
  onUpdateSettings: (s: Settings) => void;
}

export interface LocationMonitorState {
  pendingShift: LocationShift | null;
  confirmShift: () => void;
  dismissShift: () => void;
  isChecking: boolean;
  checkNow: () => Promise<void>;
}

/**
 * İzin istemeden, hata fırlatmadan ve arayüzü kilitlemeden
 * sessizce cihazın güncel koordinatlarını alır.
 */
async function silentGetCoordinates(): Promise<{ lat: number; lon: number } | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') return null;

      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      });
      return {
        lat: Number(pos.coords.latitude.toFixed(4)),
        lon: Number(pos.coords.longitude.toFixed(4)),
      };
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return null;
    }

    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state !== 'granted') return null;
      } catch {
        // Query desteklenmiyorsa devam et
      }
    }

    return await new Promise<{ lat: number; lon: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: Number(pos.coords.latitude.toFixed(4)),
            lon: Number(pos.coords.longitude.toFixed(4)),
          });
        },
        () => resolve(null),
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 5 * 60 * 1000,
        },
      );
    });
  } catch {
    return null;
  }
}

/** Çevrimdışı ve çevrimiçi durumlara uygun yer adı tespit eder */
async function resolveLocationName(lat: number, lon: number, isOnline: boolean): Promise<string> {
  if (isOnline) {
    try {
      const name = await reverseGeocode(lat, lon);
      if (name) return name;
    } catch {
      // Çevrimdışı yedeğe geç
    }
  }
  const nearest = findNearestCity(lat, lon);
  return nearest.city.name;
}

export function useLocationMonitor({
  settings,
  online,
  onUpdateSettings,
}: UseLocationMonitorProps): LocationMonitorState {
  const [pendingShift, setPendingShift] = useState<LocationShift | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Kullanıcının "Şimdilik Kalsın" diyerek bu oturumda yoksaydığı koordinatlar
  const dismissedCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastCheckTimeRef = useRef<number>(0);
  const inFlightRef = useRef(false);

  const checkNow = useCallback(async () => {
    // Sadece konum modu seçilmişse ve kayıtlı bir konum varsa çalışır
    if (!settings || settings.mode !== 'location' || !settings.location) {
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsChecking(true);

    try {
      const coords = await silentGetCoordinates();
      if (!coords) return;

      const baseLat = settings.location.lat;
      const baseLon = settings.location.lon;
      const dist = distanceKm(baseLat, baseLon, coords.lat, coords.lon);

      // 50 km altında olsa dahi hava durumu için son bilinen koordinatı sessizce güncelle
      const storedGeo = loadJSON<GeoPoint>(STORAGE_KEYS.geo);
      const shouldUpdateGeo =
        !storedGeo || distanceKm(storedGeo.lat, storedGeo.lon, coords.lat, coords.lon) > 2;

      if (shouldUpdateGeo) {
        const placeName = await resolveLocationName(coords.lat, coords.lon, online);
        saveJSON(STORAGE_KEYS.geo, {
          lat: coords.lat,
          lon: coords.lon,
          name: placeName,
          at: new Date().toISOString(),
        });
      }

      // 50 km veya daha fazla uzaklaşılmışsa
      if (dist >= DISTANCE_THRESHOLD_KM) {
        // Kullanıcı bu civarda zaten "Şimdilik Kalsın" dediyse tekrar sorma (15 km tolerans)
        if (dismissedCoordRef.current) {
          const distFromDismissed = distanceKm(
            dismissedCoordRef.current.lat,
            dismissedCoordRef.current.lon,
            coords.lat,
            coords.lon,
          );
          if (distFromDismissed < 15) {
            return;
          }
        }

        const detectedName = await resolveLocationName(coords.lat, coords.lon, online);
        setPendingShift({
          distanceKm: Math.round(dist),
          newLocation: {
            lat: coords.lat,
            lon: coords.lon,
            name: detectedName,
          },
        });
      } else {
        // Kullanıcı eski konumun 50 km yakınına geri döndüyse açık olan soruyu kapat
        setPendingShift(null);
      }
    } finally {
      setIsChecking(false);
      inFlightRef.current = false;
      lastCheckTimeRef.current = Date.now();
    }
  }, [settings, online]);

  // Açılışta kontrol et
  useEffect(() => {
    if (settings?.mode === 'location' && settings.location) {
      void checkNow();
    }
  }, [settings?.mode, settings?.location?.lat, settings?.location?.lon, checkNow]);

  // Uygulama arka plandan ön plana geldiğinde kontrol et (en fazla dakikada 1 kez)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastCheckTimeRef.current;
        if (elapsed > MIN_CHECK_INTERVAL_MS) {
          void checkNow();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [checkNow]);

  const confirmShift = useCallback(() => {
    if (!pendingShift || !settings) return;

    const updatedSettings: Settings = {
      ...settings,
      mode: 'location',
      location: pendingShift.newLocation,
    };

    onUpdateSettings(updatedSettings);
    dismissedCoordRef.current = null;
    setPendingShift(null);
  }, [pendingShift, settings, onUpdateSettings]);

  const dismissShift = useCallback(() => {
    if (pendingShift) {
      dismissedCoordRef.current = {
        lat: pendingShift.newLocation.lat,
        lon: pendingShift.newLocation.lon,
      };
    }
    setPendingShift(null);
  }, [pendingShift]);

  return {
    pendingShift,
    confirmShift,
    dismissShift,
    isChecking,
    checkNow,
  };
}
