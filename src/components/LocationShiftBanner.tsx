import { Check, CloudOff, Navigation, X } from 'lucide-react';
import type { LocationShift } from '../hooks/useLocationMonitor';

interface Props {
  shift: LocationShift;
  online: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function LocationShiftBanner({
  shift,
  online,
  onConfirm,
  onDismiss,
}: Props) {
  return (
    <div
      role="region"
      aria-label="Konum güncelleme önerisi"
      className="animate-fade-up relative overflow-hidden rounded-3xl border border-gold-500/40 bg-gradient-to-br from-night-800 via-night-850 to-night-900 p-4.5 shadow-xl sm:p-5"
    >
      {/* Arka plan ışık vurgusu */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gold-500/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/15 text-gold-400 shadow-inner">
            <Navigation className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-extrabold text-cream">
                Konum Değişikliği Algılandı
              </h3>
              <span className="inline-flex items-center rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 py-0.5 text-[11px] font-bold text-gold-300">
                ~{shift.distanceKm} km
              </span>
            </div>
            <p className="mt-0.5 text-xs text-sage">
              Yeni Konum:{' '}
              <span className="font-semibold text-cream">
                {shift.newLocation.name}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Kapat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sage transition-colors hover:bg-night-700 hover:text-cream"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="relative mt-3 text-sm leading-relaxed text-cream/90">
        Mevcut konumunuzdan yaklaşık{' '}
        <strong className="text-gold-300">{shift.distanceKm} km</strong>{' '}
        uzaklaştınız. Namaz vakitlerinin yeni konumunuza göre güncellenmesini
        ister misiniz?
      </p>

      {!online && (
        <div className="relative mt-2.5 flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <CloudOff className="h-4 w-4 shrink-0 text-amber-300" />
          <span>
            Çevrimdışısınız. Konum güncellenir; vakitler internet bağlantısı
            sağlandığında otomatik indirilir.
          </span>
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          className="flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-gold-500 px-5 py-2.5 text-sm font-bold text-night-950 transition-all hover:bg-gold-400 active:scale-[0.98] shadow-md shadow-gold-500/20"
        >
          <Check className="h-4 w-4" />
          Vakitleri Güncelle
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex flex-1 sm:flex-initial items-center justify-center rounded-xl border border-night-600 bg-night-800/80 px-4 py-2.5 text-sm font-semibold text-sage transition-colors hover:bg-night-700 hover:text-cream active:scale-[0.98]"
        >
          Şimdilik Kalsın
        </button>
      </div>
    </div>
  );
}
