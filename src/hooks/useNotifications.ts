import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  AppNotification,
  NotificationSettings,
  PermissionState,
  PrayerCache,
  PrayerKey,
} from '../lib/types';
import { STORAGE_KEYS, loadJSON, saveJSON } from '../lib/storage';
import { PRAYER_NAMES_TR, PRAYER_ORDER, getNextPrayer, toKey, timeOnDate } from '../lib/time';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  minutesBefore: 15,
  onTime: true,
  vibrate: true,
  prayers: {
    Fajr: true,
    Sunrise: false,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true,
  },
};

const NOTIFICATION_ICON = '/images/icon.png';
const CHANNEL_ID = 'prayer-times';

/**
 * Bildirim ID'si üretici.
 * Capacitor LocalNotifications int32 ID istiyor.
 * Tarih + vakit key + tip bilgisiyle çakışmasız ID üretir.
 *
 * Yapı:
 *   - "before" bildirimleri: base ID + 0
 *   - "onTime" bildirimleri: base ID + 1
 *
 * Base ID: gün + vakit sırasından deterministik bir sayı
 */
function makeNotificationId(dateKey: string, prayerIndex: number, type: 'before' | 'onTime'): number {
  // dateKey = "YYYY-MM-DD"
  const parts = dateKey.split('-').map(Number);
  // Gün bileşenlerinden basit bir hash oluştur (365 günlük döngüye sığsın)
  const dayHash = ((parts[0] % 100) * 400 + (parts[1] * 32) + parts[2]); // max ~40000
  const base = dayHash * 20 + prayerIndex * 2; // 6 vakit * 2 tip = 12 per day
  return base + (type === 'before' ? 0 : 1);
}

let channelCreated = false;
async function ensureNotificationChannel() {
  if (channelCreated || !Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Namaz Vakitleri',
      description: 'Namaz vakti hatırlatmaları ve vakit giriş bildirimleri',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    channelCreated = true;
  } catch {
    /* Kanal oluşturulamazsa devam et */
  }
}

function getWebNotificationPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  const p = Notification.permission;
  return p === 'default' ? 'prompt' : p;
}

/** Sistem bildirimi göster — anlık (uygulama açıkken) */
async function showImmediateSystemNotification(title: string, body: string, vibrate: boolean): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNotificationChannel();
      const perms = await LocalNotifications.checkPermissions();
      if (perms.display !== 'granted') return false;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2147483647),
            title,
            body,
            channelId: CHANNEL_ID,
            schedule: { at: new Date(Date.now() + 150) },
          },
        ],
      });
      return true;
    } catch (e) {
      console.warn('Native bildirim gönderilemedi:', e);
      return false;
    }
  }

  // Web ortamı
  if (getWebNotificationPermission() !== 'granted') return false;
  const options: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: `namaz-${Date.now()}`,
    lang: 'tr',
  };
  if (vibrate) options.vibrate = [200, 100, 200];

  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    /* SW yoksa aşağıya düş */
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/** Kısa ve yumuşak bir uyarı sesi (WebAudio; kullanıcı etkileşimi sonrası çalışır) */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [659.25, 783.99, 987.77];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* ses çalınamadı */
  }
}

// ─────────────────────────────────────────────────
// İleri tarihli (scheduled) bildirim planlayıcı
// ─────────────────────────────────────────────────

/**
 * Cache'deki tüm gelecekteki namaz vakitleri için ileri tarihli
 * LocalNotifications planlar. Android bu bildirimleri uygulama
 * kapalıyken bile gösterir (exact alarm).
 *
 * Önceki planlamaları iptal edip sıfırdan planlar.
 */
async function scheduleAllFutureNotifications(
  cache: PrayerCache,
  settings: NotificationSettings,
  placeName: string | null,
) {
  if (!Capacitor.isNativePlatform()) return;
  if (!settings.enabled) return;

  try {
    const perms = await LocalNotifications.checkPermissions();
    if (perms.display !== 'granted') return;
  } catch {
    return;
  }

  await ensureNotificationChannel();

  // Mevcut tüm planlanmış bildirimleri iptal et
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  } catch {
    /* iptal başarısız olursa devam et */
  }

  const place = placeName ? ` (${placeName})` : '';
  const nowMs = Date.now();
  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    channelId: string;
    schedule: { at: Date; allowWhileIdle: boolean };
  }> = [];

  const dayKeys = Object.keys(cache.days).sort();

  for (const dayKey of dayKeys) {
    const day = cache.days[dayKey];
    if (!day) continue;

    // dayKey = "YYYY-MM-DD" → Date
    const [y, m, d] = dayKey.split('-').map(Number);
    const dayDate = new Date(y, m - 1, d);

    for (let pi = 0; pi < PRAYER_ORDER.length; pi++) {
      const prayerKey = PRAYER_ORDER[pi];
      if (!settings.prayers[prayerKey]) continue;

      const prayerName = PRAYER_NAMES_TR[prayerKey];
      const prayerTime = day.times[prayerKey]; // "HH:MM"
      const prayerDate = timeOnDate(dayDate, prayerTime);
      const prayerMs = prayerDate.getTime();

      // Geçmişte kalan vakitleri atla
      if (prayerMs <= nowMs) continue;

      // 1) Vakit girdi bildirimi
      if (settings.onTime) {
        notifications.push({
          id: makeNotificationId(dayKey, pi, 'onTime'),
          title: `${prayerName} vakti girdi`,
          body: `${prayerName} vakti (${prayerTime})${place}.`,
          channelId: CHANNEL_ID,
          schedule: { at: prayerDate, allowWhileIdle: true },
        });
      }

      // 2) X dakika kala hatırlatma
      if (settings.minutesBefore > 0) {
        const beforeMs = prayerMs - settings.minutesBefore * 60_000;
        if (beforeMs > nowMs) {
          const mins = settings.minutesBefore;
          notifications.push({
            id: makeNotificationId(dayKey, pi, 'before'),
            title: `${prayerName} vaktine ${mins} dakika kaldı`,
            body: `${prayerName} vakti ${prayerTime}'de giriyor${place}.`,
            channelId: CHANNEL_ID,
            schedule: { at: new Date(beforeMs), allowWhileIdle: true },
          });
        }
      }
    }
  }

  // Capacitor LocalNotifications bir seferde çok fazla bildirim kabul edemeyebilir.
  // Android genelde 500 civarı bir limit koyar. Güvenli tarafta kalalım.
  const MAX_SCHEDULED = 450;
  const toSchedule = notifications.slice(0, MAX_SCHEDULED);

  if (toSchedule.length === 0) return;

  try {
    await LocalNotifications.schedule({ notifications: toSchedule });
    console.log(`[Notifications] ${toSchedule.length} bildirim planlandı.`);
  } catch (e) {
    console.warn('[Notifications] Bildirim planlama hatası:', e);
  }
}

// ─────────────────────────────────────────────────
// Dışa açılan hook state ve hook
// ─────────────────────────────────────────────────

export interface NotificationsState {
  permission: PermissionState;
  settings: NotificationSettings;
  updateSettings: (patch: Partial<NotificationSettings>) => void;
  togglePrayer: (key: PrayerKey) => void;
  requestPermission: () => Promise<PermissionState>;
  /** Ekranda gösterilen uygulama içi bildirim */
  toast: AppNotification | null;
  dismissToast: () => void;
  /** Test bildirimi gönder */
  sendTest: () => void;
}

/**
 * Namaz vakti bildirimleri:
 * - Vakte X dakika kala hatırlatma
 * - Vakit girdiğinde bildirim
 *
 * **İki katmanlı strateji:**
 * 1. İleri tarihli (scheduled) bildirimler → uygulama kapalıyken de çalışır.
 *    Cache veya ayarlar değiştiğinde tüm bildirimler yeniden planlanır.
 * 2. Uygulama açıkken ek olarak in-app toast + titreşim + ses.
 */
export function useNotifications(
  cache: PrayerCache | null,
  now: Date,
  placeName: string | null,
): NotificationsState {
  const isNative = Capacitor.isNativePlatform();
  const [permission, setPermission] = useState<PermissionState>(
    isNative ? 'prompt' : getWebNotificationPermission(),
  );

  const [settings, setSettings] = useState<NotificationSettings>(() => {
    const stored = loadJSON<Partial<NotificationSettings>>(STORAGE_KEYS.notificationSettings);
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...stored,
      prayers: { ...DEFAULT_NOTIFICATION_SETTINGS.prayers, ...(stored?.prayers ?? {}) },
    };
  });
  const [toast, setToast] = useState<AppNotification | null>(null);
  const notifiedRef = useRef<Set<string>>(
    new Set(loadJSON<string[]>(STORAGE_KEYS.notifiedIds) ?? []),
  );
  const toastTimer = useRef<number | null>(null);

  // Scheduled bildirimlerin son planlandığı cache+settings parmak izi
  const lastScheduleFingerprint = useRef<string>('');

  const persistNotified = () => {
    const arr = [...notifiedRef.current].slice(-60);
    notifiedRef.current = new Set(arr);
    saveJSON(STORAGE_KEYS.notifiedIds, arr);
  };

  const dismissToast = useCallback(() => {
    setToast(null);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  /** Uygulama açıkken anlık bildirim + toast + ses + titreşim */
  const notify = useCallback(
    (title: string, body: string) => {
      // Uygulama açıkken scheduled bildirim zaten tetiklenir (Android gösterir).
      // Ek olarak in-app toast, ses ve titreşim:
      if (settings.vibrate && navigator.vibrate) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {
          /* yoksay */
        }
      }
      playChime();
      setToast({ id: `${Date.now()}`, title, body, at: Date.now() });
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 12000);
    },
    [settings.vibrate],
  );

  const updateSettings = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveJSON(STORAGE_KEYS.notificationSettings, next);
      return next;
    });
  }, []);

  const togglePrayer = useCallback((key: PrayerKey) => {
    setSettings((prev) => {
      const next = { ...prev, prayers: { ...prev.prayers, [key]: !prev.prayers[key] } };
      saveJSON(STORAGE_KEYS.notificationSettings, next);
      return next;
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (isNative) {
      try {
        await ensureNotificationChannel();
        const res = await LocalNotifications.requestPermissions();
        const p: PermissionState =
          res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'prompt';
        setPermission(p);
        return p;
      } catch (err) {
        console.error('LocalNotifications izin isteği başarısız:', err);
        return 'denied';
      }
    }

    if (!('Notification' in window)) return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      const p: PermissionState = result === 'default' ? 'prompt' : result;
      setPermission(p);
      return p;
    } catch {
      const p = getWebNotificationPermission();
      setPermission(p);
      return p;
    }
  }, [isNative]);

  // İzin durumunu kontrol et
  useEffect(() => {
    if (isNative) {
      void ensureNotificationChannel();
      LocalNotifications.checkPermissions().then((res) => {
        if (res.display === 'granted') setPermission('granted');
        else if (res.display === 'denied') setPermission('denied');
        else setPermission('prompt');
      }).catch(() => {});
      return;
    }

    const onVis = () => setPermission(getWebNotificationPermission());
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isNative]);

  // ─────────────────────────────────────────────
  // İleri tarihli bildirimleri planla
  // Cache, settings veya izin değiştiğinde yeniden planla
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!cache || permission !== 'granted') return;

    // Parmak izi: ayarlar + cache fetchedAt + cache gün sayısı
    const fingerprint = JSON.stringify({
      enabled: settings.enabled,
      minutesBefore: settings.minutesBefore,
      onTime: settings.onTime,
      prayers: settings.prayers,
      fetchedAt: cache.fetchedAt,
      dayCount: Object.keys(cache.days).length,
      placeName,
    });

    if (fingerprint === lastScheduleFingerprint.current) return;
    lastScheduleFingerprint.current = fingerprint;

    void scheduleAllFutureNotifications(cache, settings, placeName);
  }, [cache, settings, permission, placeName]);

  // ─────────────────────────────────────────────
  // Uygulama açıkken in-app toast için listener
  // Native: LocalNotifications received event ile yakalayarak toast göster
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!isNative) return;

    const listener = LocalNotifications.addListener(
      'localNotificationReceived',
      (notification) => {
        // Uygulama foreground'dayken bildirim alındığında toast göster
        if (notification.title && notification.body) {
          if (settings.vibrate && navigator.vibrate) {
            try {
              navigator.vibrate([200, 100, 200]);
            } catch {
              /* yoksay */
            }
          }
          playChime();
          setToast({
            id: `${Date.now()}`,
            title: notification.title,
            body: notification.body,
            at: Date.now(),
          });
          if (toastTimer.current) window.clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setToast(null), 12000);
        }
      },
    );

    return () => {
      void listener.then((l) => l.remove());
    };
  }, [isNative, settings.vibrate]);

  const sendTest = useCallback(() => {
    const title = 'Namaz Vakitleri · Test';
    const body = `Bildirimler çalışıyor.${placeName ? ` Konum: ${placeName}` : ''}`;
    void showImmediateSystemNotification(title, body, settings.vibrate);
    notify(title, body);
  }, [notify, placeName, settings.vibrate]);

  // Web ortamı için: hâlâ reaktif kontrol (service worker yok)
  useEffect(() => {
    if (isNative) return; // Native'de scheduled bildirimler zaten hallediyor
    if (!settings.enabled || !cache) return;

    const next = getNextPrayer(cache.days, now);
    if (!next) return;

    const place = placeName ? ` (${placeName})` : '';

    // 1) Vakte X dakika kala hatırlatma
    if (settings.minutesBefore > 0 && settings.prayers[next.key]) {
      const remainingMs = next.at.getTime() - now.getTime();
      const thresholdMs = settings.minutesBefore * 60_000;
      if (remainingMs > 0 && remainingMs <= thresholdMs && remainingMs > thresholdMs - 5 * 60_000) {
        const id = `before:${toKey(next.at)}:${next.key}`;
        if (!notifiedRef.current.has(id)) {
          notifiedRef.current.add(id);
          persistNotified();
          const mins = Math.max(1, Math.round(remainingMs / 60_000));
          notify(
            `${next.name} vaktine ${mins} dakika kaldı`,
            `${next.name} vakti ${next.time}'de giriyor${place}.`,
          );
        }
      }
    }

    // 2) Vakit girdi
    if (settings.onTime && next.prevKey && next.prevAt && settings.prayers[next.prevKey]) {
      const sinceMs = now.getTime() - next.prevAt.getTime();
      if (sinceMs >= 0 && sinceMs < 2 * 60_000) {
        const id = `time:${toKey(next.prevAt)}:${next.prevKey}`;
        if (!notifiedRef.current.has(id)) {
          notifiedRef.current.add(id);
          persistNotified();
          const prevName = PRAYER_NAMES_TR[next.prevKey];
          const hh = String(next.prevAt.getHours()).padStart(2, '0');
          const mm = String(next.prevAt.getMinutes()).padStart(2, '0');
          notify(
            `${prevName} vakti girdi`,
            `${prevName} vakti (${hh}:${mm})${place}. Sıradaki vakit: ${next.name} ${next.time}.`,
          );
        }
      }
    }
  }, [now, cache, settings, placeName, notify, isNative]);

  return {
    permission,
    settings,
    updateSettings,
    togglePrayer,
    requestPermission,
    toast,
    dismissToast,
    sendTest,
  };
}
