import { BookOpen, X, Scale, CheckCircle2 } from 'lucide-react';

interface QuranicProofsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuranicProofsModal({ isOpen, onClose }: QuranicProofsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-xs no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Daliilada Quraanka iyo Xeerarka Cilmiga Faraa'idka"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0B1220] border border-[#243449] text-[#F8FAFC] rounded-2xl w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Sticky Compact Modal Header */}
        <div className="px-4 py-2.5 border-b border-[#243449] flex items-center justify-between gap-2.5 bg-[#0F1B2D] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#F8FAFC] truncate">
                Daliilada Quraanka &amp; Xeerarka Faraa&apos;idka
              </h2>
              <p className="text-[11px] text-[#94A3B8] truncate">
                Aayadaha dhaxalka ee Suuradda An-Nisaa &amp; mabaadi&apos;da sharciga ah
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl hover:bg-[#0B1220] transition-colors cursor-pointer shrink-0"
            aria-label="Xir daaqadda"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-3.5 sm:p-4 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-3.5 text-xs">
          {/* Card 1: Ayah 11 */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#243449] pb-2.5">
              <span className="font-bold text-amber-300 text-sm">
                1. Aayadda Carruurta &amp; Waalidiinta (Suuradda An-Nisaa: 11)
              </span>
              <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                Suuradda 4 · Aayadda 11
              </span>
            </div>

            <div className="p-4 bg-[#0B1220] rounded-xl text-right font-arabic text-base sm:text-lg text-amber-100 leading-loose border border-[#243449]">
              يُوصِيكُمُ اللَّهُ فِي أَوْلَادِكُمْ ۖ لِلذَّكَرِ مِثْلُ حَظِّ الْأُنثَيَيْنِ ۚ فَإِن كُنَّ نِسَاءً فَوْقَ اثْنَتَيْنِ فَلَهُنَّ ثُلُثَا مَا تَرَكَ ۖ وَإِن كَانَتْ وَاحِدَةً فَلَهَا النِّصْفُ ۚ وَلِأَبَوَيْهِ لِكُلِّ وَاحِدٍ مِّنْهُمَا السُّدُسُ مِمَّا تَرَكَ إِن كَانَ لَهُ وَلَدٌ ۚ فَإِن لَّمْ يَكُن لَّهُ وَلَدٌ وَوَرِثَهُ أَبَوَاهُ فَلِأُمِّهِ الثُّلُثُ ۚ فَإِن كَانَ لَهُ إِخْوَةٌ فَلِأُمِّهِ السُّدُسُ ۚ مِن بَعْدِ وَصِيَّةٍ يُوصِي بِهَا أَوْ دَيْنٍ ۗ
            </div>

            <div className="text-[#94A3B8] leading-relaxed space-y-1">
              <p className="font-bold text-[#F8FAFC]">Micnaha &amp; Fasiraadda:</p>
              <p>
                &ldquo;Eebbe wuxuu idiinku dardaarayaa carruurtiinna: Wiilku wuxuu leeyahay saamiga laba gabdhood (2:1). Haddii ay yihiin dheddig laba ama wax ka badan waxay leeyihiin 2/3 waxa uu marxuumku ka tagay; haddii ay tahay hal gabadh waxay leedahay 1/2. Labada waalidna mid kasta wuxuu leeyahay 1/6 haddii uu marxuumku carruur leeyahay. Haddii uusan carruur lahayn oo ay waalidiintu dhaxlayaan, hooyadu waxay leedahay 1/3; haddii uu leeyahay walaalo (laba ama ka badan), hooyadu waxay leedahay 1/6; arrintaas oo dhan waxay ka dambaysaa dardaaran la dardaarmay ama deyn la bixinayo.&rdquo;
              </p>
            </div>
          </div>

          {/* Card 2: Ayah 12 */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#243449] pb-2.5">
              <span className="font-bold text-[#10B981] text-sm">
                2. Aayadda Sayga, Xaasaska &amp; Walaalaha Hooyo (Suuradda An-Nisaa: 12)
              </span>
              <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                Suuradda 4 · Aayadda 12
              </span>
            </div>

            <div className="p-4 bg-[#0B1220] rounded-xl text-right font-arabic text-base sm:text-lg text-emerald-100 leading-loose border border-[#243449]">
              وَلَكُمْ نِصْفُ مَا تَرَكَ أَزْوَاجُكُمْ إِن لَّمْ يَكُن لَّهُنَّ وَلَدٌ ۚ فَإِن كَانَ لَهُنَّ وَلَدٌ فَلَكُمُ الرُّبُعُ مِمَّا تَرَكْنَ ۚ مِن بَعْدِ وَصِيَّةٍ يُوصِينَ بِهَا أَوْ دَيْنٍ ۚ وَلَهُنَّ الرُّبُعُ مِمَّا تَرَكْتُمْ إِن لَّمْ يَكُن لَّكُمْ وَلَدٌ ۚ فَإِن كَانَ لَكُمْ وَلَدٌ فَلَهُنَّ الثُّمُنُ مِمَّا تَرَكْتُم
            </div>

            <div className="text-[#94A3B8] leading-relaxed space-y-1">
              <p className="font-bold text-[#F8FAFC]">Micnaha &amp; Fasiraadda:</p>
              <p>
                &ldquo;Waxaad leedihiin 1/2 waxa ay ka tageen xaasaskaagu haddaynaan carruur lahayn; hadday carruur leeyihiinna waxaad leedihiin 1/4. Xaasaskuna waxay leeyihiin 1/4 waxaad ka tagteen haddaydnaan carruur lahayn; haddii aad carruur leedihiinna waxay leeyihiin 1/8; waxaasi oo dhammina waa dardaaran iyo deymo ka dib.&rdquo;
              </p>
            </div>
          </div>

          {/* Card 3: Ayah 176 */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#243449] pb-2.5">
              <span className="font-bold text-sky-400 text-sm">
                3. Aayadda Kalaalah &amp; Walaalaha Dhashay (Suuradda An-Nisaa: 176)
              </span>
              <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                Suuradda 4 · Aayadda 176
              </span>
            </div>

            <div className="p-4 bg-[#0B1220] rounded-xl text-right font-arabic text-base sm:text-lg text-sky-100 leading-loose border border-[#243449]">
              يَسْتَفْتُونَكَ قُلِ اللَّهُ يُفْتِيكُمْ فِي الْكَلَالَةِ ۚ إِنِ امْرُؤٌ هَلَكَ لَيْسَ لَهُ وَلَدٌ وَلَهُ أُخْتٌ فَلَهَا نِصْفُ مَا تَرَكَ ۚ وَهُوَ يَرِثُهَا إِن لَّمْ يَكُن لَّهَا وَلَدٌ ۚ فَإِن كَانَتَا اثْنَتَيْنِ فَلَهُمَا الثُّلُثَانِ مِمَّا تَرَكَ ۚ وَإِن كَانُوا إِخْوَةً رِّجَالًا وَنِسَاءً فَلِلذَّكَرِ مِثْلُ حَظِّ الْأُنثَيَيْنِ
            </div>

            <div className="text-[#94A3B8] leading-relaxed space-y-1">
              <p className="font-bold text-[#F8FAFC]">Micnaha &amp; Fasiraadda:</p>
              <p>
                &ldquo;Waxay ku weydiinayaan fatwo, waxaad dhahdaa: Eebbe wuxuu idiinku fatwoonayaa Kalaalah (qofka dhintay isagoon ka tagin aabbe ama carruur): Haddii qofku dhinto oo uu leeyahay walaashiis dhalatay waxay leedahay 1/2; hadday laba yihiinna waxay leeyihiin 2/3; hadday yihiin walaalo rag iyo dumar ah, labku wuxuu leeyahay saamiga laba dheddig.&rdquo;
              </p>
            </div>
          </div>

          {/* Principles Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0F1B2D] p-4 rounded-2xl border border-[#243449]">
              <h4 className="font-bold text-[#F8FAFC] mb-2.5 flex items-center gap-2 text-sm">
                <Scale className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Qawaacidda Xisaabta Faraa&apos;idka:</span>
              </h4>
              <ul className="space-y-2 text-[#94A3B8] leading-relaxed">
                <li>
                  • <strong className="text-[#F8FAFC]">Asalka Mas&apos;alada (Asl):</strong> Saami-qaybiyaha guud (LCM) ee saamiyada go&apos;an (2, 3, 4, 6, 8, 12, 24).
                </li>
                <li>
                  • <strong className="text-[#F8FAFC]">Al-Cawl (العول):</strong> Marka wadarta saamiyadu ka bataan asalka, saami kasta waa la dhimaa si caddaalad ah.
                </li>
                <li>
                  • <strong className="text-[#F8FAFC]">Al-Radd (الرد):</strong> Marka saamiyadu ka yaraadaan 100% oon la hayn Casabah, dheeraadka dib baa loogu celiyaa dhaxaleeyda.
                </li>
                <li>
                  • <strong className="text-[#F8FAFC]">At-Tashih (التصحيح):</strong> Saamiyada oo la saxo si qof kasta u helo tiro qummaati ah oo aan jabir lahayn.
                </li>
              </ul>
            </div>

            <div className="bg-[#0F1B2D] p-4 rounded-2xl border border-[#243449]">
              <h4 className="font-bold text-[#F8FAFC] mb-2.5 flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>Kala Horreynta Xuquuqda Hantida:</span>
              </h4>
              <ol className="space-y-2 text-[#94A3B8] list-decimal list-inside leading-relaxed">
                <li>Diyaarinta Meydka &amp; Aaska (Tajheez wal-Kafan).</li>
                <li>Deymaha Eebbe (Sako, Kafaaro, Nadar) &amp; Addoomaha.</li>
                <li>Dardaaranka Sharciga ah (ugu badnaan 1/3 hantida soo harta).</li>
                <li>Qaybinta Dhaxalka ee dhaxaleeyda xaqqa u leh.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Sticky Compact Modal Footer */}
        <div className="px-4 py-2.5 border-t border-[#243449] bg-[#0F1B2D] flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 py-1.5 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Fahmay / Xir
          </button>
        </div>
      </div>
    </div>
  );
}
