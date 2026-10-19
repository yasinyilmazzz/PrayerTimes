import { useCallback, useEffect, useMemo, useState } from 'react';
import { MoonStar } from 'lucide-react';
import type { PageKey, Settings } from './lib/types';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePrayerStore } from './hooks/usePrayerStore';
import { useNow } from './hooks/useNow';
import { useAyah } from './hooks/useAyah';
import { useWeather, type WeatherTarget } from './hooks/useWeather';
import { useGeolocation } from './hooks/useGeolocation';
import { useNotifications } from './hooks/useNotifications';
import { resolveSettingsLocation, locationKey } from './lib/location';
import { STORAGE_KEYS, loadJSON, saveJSON } from './lib/storage';
import Header from './components/Header';
import PatternBackground from './components/PatternBackground';
import NotificationToast from './components/NotificationToast';
import PermissionsModal from './components/PermissionsModal';
import LocationShiftBanner from './components/LocationShiftBanner';
import { useLocationMonitor } from './hooks/useLocationMonitor';
import HomePage from './pages/HomePage';
import PrayerTimesPage from './pages/PrayerTimesPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const online = useOnlineStatus();
  const store = usePrayerStore(online);
  const { settings, cache, loading, error } = store;

  // İlk açılışta (kayıtlı ayar yoksa) kullanıcı Ayarlar'a yönlendirilir
  const [page, setPage] = useState<PageKey>(() => (settings ? 'home' : 'settings'));
  const effectivePage: PageKey = settings ? page : 'settings';

  // İlk kurulumda izin penceresi
  const [showPermissions, setShowPermissions] = useState<boolean>(
    () => !loadJSON<boolean>(STORAGE_KEYS.onboardingDone),
  );
  const finishOnboarding = useCallback(() => {
    saveJSON(STORAGE_KEYS.onboardingDone, true);
    setShowPermissions(false);
  }, []);

  const now = useNow(cache?.timezone);
  const ayahState = useAyah(online);
  const geo = useGeolocation();

  const resolved = useMemo(
    () => (settings ? resolveSettingsLocation(settings) : null),
    [settings],
  );

  /**
   * Hava durumu hedefi:
   * - Konum izni verilmişse cihaz konumu
   * - Aksi halde seçili şehir
   */
  const weatherTarget = useMemo<WeatherTarget | null>(() => {
    if (geo.permission === 'granted' && geo.point) {
      return {
        lat: geo.point.lat,
        lon: geo.point.lon,
        key: locationKey(geo.point.lat, geo.point.lon),
        name: geo.point.name,
        isDeviceLocation: true,
      };
    }
    if (resolved) {
      return {
        lat: resolved.lat,
        lon: resolved.lon,
        key: resolved.key,
        name: resolved.displayName,
        isDeviceLocation: resolved.isDeviceLocation,
      };
    }
    return null;
  }, [geo.permission, geo.point, resolved]);

  const weatherState = useWeather(weatherTarget, online);
  const notifications = useNotifications(cache, now, resolved?.shortName ?? null);

  const cityLabel = resolved
    ? resolved.isDeviceLocation
      ? resolved.displayName
      : `${resolved.displayName}, ${resolved.countryName}`
    : null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [effectivePage]);

  const handleSaveSettings = useCallback(
    (s: Settings) => {
      const isFirstRun = !settings;
      store.saveSettings(s);
      if (isFirstRun) setPage('home');
    },
    [settings, store],
  );

  const locationMonitor = useLocationMonitor({
    settings,
    online,
    onUpdateSettings: handleSaveSettings,
  });

  const handleNavigate = useCallback(
    (p: PageKey) => {
      if (!settings && p !== 'settings') return;
      setPage(p);
    },
    [settings],
  );

  return (
    <div className="relative min-h-screen bg-night-950">
      {/* Masaüstünde kenarlarda görünen desenli ambiyans */}
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <PatternBackground id="app-pattern" className="opacity-[0.035]" />
      </div>

      <NotificationToast toast={notifications.toast} onDismiss={notifications.dismissToast} />

      {showPermissions && (
        <PermissionsModal
          notificationPermission={notifications.permission}
          locationPermission={geo.permission}
          onRequestNotification={notifications.requestPermission}
          onRequestLocation={geo.request}
          onDone={finishOnboarding}
        />
      )}

      <div className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col border-night-800 bg-night-900 shadow-2xl sm:border-x">
        <Header
          page={effectivePage}
          onNavigate={handleNavigate}
          cityLabel={cityLabel}
          isDeviceLocation={!!resolved?.isDeviceLocation}
          online={online}
          locked={!settings}
        />

        <main className="w-full flex-1 px-4 py-5">
          {locationMonitor.pendingShift && effectivePage !== 'settings' && (
            <div className="mb-4">
              <LocationShiftBanner
                shift={locationMonitor.pendingShift}
                online={online}
                onConfirm={locationMonitor.confirmShift}
                onDismiss={locationMonitor.dismissShift}
              />
            </div>
          )}

          {effectivePage === 'home' && settings && (
            <HomePage
              settings={settings}
              cache={cache}
              now={now}
              loading={loading}
              error={error}
              online={online}
              onRetry={() => store.refresh(true)}
              ayahState={ayahState}
              weatherState={weatherState}
              weatherPlaceName={weatherTarget?.name ?? resolved?.displayName ?? ''}
              weatherFromDevice={!!weatherTarget?.isDeviceLocation}
            />
          )}

          {effectivePage === 'times' && settings && resolved && (
            <PrayerTimesPage
              key={resolved.key}
              cache={cache}
              now={now}
              cityName={resolved.displayName}
              online={online}
              loading={loading}
              onRefresh={() => store.refresh(true)}
            />
          )}

          {effectivePage === 'settings' && (
            <SettingsPage
              initialSettings={settings}
              isFirstRun={!settings}
              cache={cache}
              online={online}
              loading={loading}
              error={error}
              onSave={handleSaveSettings}
              onRefreshData={() => store.refresh(true)}
              geo={geo}
              notifications={notifications}
            />
          )}
        </main>

        <footer className="border-t border-night-800 px-4 py-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-sage-dark">
            <MoonStar className="h-3.5 w-3.5 text-gold-600" />
            Namaz Vakitleri · Veriler: Aladhan, AlQuran Cloud, Open-Meteo (ücretsiz
            kaynaklar)
          </p>
        </footer>
      </div>
    </div>
  );
}
