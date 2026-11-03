import { useState, useEffect } from 'react';
import { HeirsInput, Gender, EMPTY_HEIRS_INPUT } from '../types/inheritance';
import { updateHeirPersonName } from '../utils/heirNameUtils';
import {
  Users,
  X,
  Check,
  UserCheck,
  Heart,
  Baby,
  ShieldCheck,
  RotateCcw,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';

interface HeirConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  input: HeirsInput;
  onSave: (updated: HeirsInput) => void;
}

export function HeirConfigModal({
  isOpen,
  onClose,
  input,
  onSave,
}: HeirConfigModalProps) {
  const [formData, setFormData] = useState<HeirsInput>({ ...input });
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...input });
      setConfirmClearAll(false);
    }
  }, [isOpen, input]);

  if (!isOpen) return null;

  const handleGenderChange = (gender: Gender) => {
    setFormData((prev) => ({
      ...prev,
      deceasedGender: gender,
      wivesCount: gender === 'male' ? prev.wivesCount || 1 : 0,
      husbandAlive: gender === 'female',
    }));
  };

  const handleClearAllConfirmed = () => {
    setFormData({ ...EMPTY_HEIRS_INPUT, heirNames: {} });
    setConfirmClearAll(false);
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  const handlePersonNameChange = (groupKey: string, idx: number, val: string) => {
    setFormData((prev) => updateHeirPersonName(prev, groupKey, idx, val));
  };

  const renderNameInputs = (
    groupKey: string,
    count: number,
    labelPrefix: string,
    placeholderExample: string
  ) => {
    if (count <= 0) return null;
    const namesArr = formData.heirNames?.[groupKey] || [];
    return (
      <div className="mt-3 pt-3 border-t border-[#243449] space-y-2">
        <div className="text-[11px] font-semibold text-[#10B981] flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5 shrink-0" />
          <span>Qor Magacyada ({labelPrefix}):</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {Array.from({ length: count }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-[11px] font-mono tabular-nums text-[#94A3B8] w-20 shrink-0 truncate">
                {count === 1 ? labelPrefix : `${labelPrefix} ${idx + 1}:`}
              </span>
              <input
                type="text"
                value={namesArr[idx] || ''}
                onChange={(e) => handlePersonNameChange(groupKey, idx, e.target.value)}
                placeholder={`${placeholderExample} ${count > 1 ? idx + 1 : ''}`}
                className="flex-1 min-h-[40px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-1.5 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-xs no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Habeynta Dhaxaleeyda Sharciga ah"
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
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#F8FAFC] truncate">
                Habeynta Dhaxaleeyda (Faraa&apos;idka)
              </h2>
              <p className="text-[11px] text-[#94A3B8] truncate">
                Geli ehelka nool ee marxuumku ka tagay
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              className="hidden sm:inline-flex min-h-[36px] items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Keydi</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl hover:bg-[#0B1220] transition-colors cursor-pointer"
              aria-label="Xir daaqadda"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Destructive Clear Confirmation Banner */}
        {confirmClearAll && (
          <div className="px-4 py-2.5 bg-red-950/60 border-b border-red-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shrink-0">
            <div className="flex items-start gap-2 text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>
                Ma hubtaa inaad eber ka dhigto dhammaan xogta dhaxal-sugayaasha?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#0F1B2D] border border-[#243449] text-[#F8FAFC] font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Jooji
              </button>
              <button
                type="button"
                onClick={handleClearAllConfirmed}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Haa, Nadiifi
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Modal Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-3.5">
          {/* Section 1: Macluumaadka Marxuumka */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-3.5 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>1. Macluumaadka Marxuumka</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                  Magaca Marxuumka
                </label>
                <input
                  type="text"
                  value={formData.deceasedName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, deceasedName: e.target.value }))}
                  placeholder="Tusaale: Marxuum Axmed Jaamac"
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                  Jinsiga Marxuumka
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenderChange('male')}
                    className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      formData.deceasedGender === 'male'
                        ? 'bg-[#10B981] border-[#10B981] text-[#030712]'
                        : 'bg-[#0B1220] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Lab (Nin)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenderChange('female')}
                    className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      formData.deceasedGender === 'female'
                        ? 'bg-[#10B981] border-[#10B981] text-[#030712]'
                        : 'bg-[#0B1220] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Dheddig (Haweenay)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Sayga ama Xaaska */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-3.5 flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-400 shrink-0" />
              <span>2. Qoyska Tooska ah (Sayga / Xaaska)</span>
            </h3>

            {formData.deceasedGender === 'male' ? (
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                  Tirada Xaasaska Nool (0 ilaa 4 xaas)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[0, 1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, wivesCount: count }))}
                      className={`min-h-[44px] py-2 px-2 text-xs font-bold rounded-xl border transition-colors font-mono tabular-nums whitespace-nowrap shrink-0 cursor-pointer ${
                        formData.wivesCount === count
                          ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                          : 'bg-[#0B1220] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {count === 0 ? '0' : `${count} Xaas`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#94A3B8] mt-2 leading-relaxed">
                  Xaasasku waxay wadaagaan 1/8 (haddii farac jiro) ama 1/4 (haddii uusan farac jirin) oo si siman ayey u qaybsadaan.
                </p>
                {renderNameInputs('wives', formData.wivesCount, 'Xaaska', 'Xaliimo Cali')}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                  Sayga (Ninka xaaskiisu dhimatay) ma nool yahay?
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, husbandAlive: true }))}
                    className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      formData.husbandAlive
                        ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                        : 'bg-[#0B1220] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Haa, wuu nool yahay
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, husbandAlive: false }))}
                    className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      !formData.husbandAlive
                        ? 'bg-[#10B981] text-[#030712] border-[#10B981]'
                        : 'bg-[#0B1220] border-[#243449] text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Maya, ma noola
                  </button>
                </div>
                {renderNameInputs('husband', formData.husbandAlive ? 1 : 0, 'Sayga', 'Maxamed Jaamac')}
              </div>
            )}
          </div>

          {/* Section 3: Carruurta Tooska ah & Faraca */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-3.5 flex items-center gap-2">
              <Baby className="w-4 h-4 text-amber-400 shrink-0" />
              <span>3. Carruurta Marxuumka &amp; Carruurta Wiilka</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                  Tirada Wiilasha Nool
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={formData.sonsCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      sonsCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-sm text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                <span className="text-[11px] text-[#94A3B8] block mt-1">
                  Wiilku waa Casabah bi nafsihi (labanlaabka saamiga gabadha).
                </span>
                {renderNameInputs('sons', formData.sonsCount, 'Wiilka', 'Cabdiraxmaan')}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                  Tirada Gabdhaha Nool
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={formData.daughtersCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      daughtersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[44px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3.5 py-2 text-sm text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                <span className="text-[11px] text-[#94A3B8] block mt-1">
                  Haddii aysan wiilal jirin: 1 gabadh = 1/2, 2+ gabdhood = 2/3.
                </span>
                {renderNameInputs('daughters', formData.daughtersCount, 'Gabadha', 'Faadumo')}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[#243449]">
              <span className="text-xs font-semibold text-[#F8FAFC] block mb-2.5">
                Carruurta Wiilka (Haddii wiilashu dhinteen ama aysan jirin):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs text-[#94A3B8] block mb-1.5">Wiilasha Wiilka</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.grandsonsCount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        grandsonsCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                  />
                  {renderNameInputs(
                    'grandsons',
                    formData.grandsonsCount,
                    'Wiilka Wiilka',
                    'Magaca wiilka wiilka'
                  )}
                </div>
                <div>
                  <label className="text-xs text-[#94A3B8] block mb-1.5">Gabdhaha Wiilka</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.granddaughtersCount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        granddaughtersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                  />
                  {renderNameInputs(
                    'granddaughters',
                    formData.granddaughtersCount,
                    'Gabadha Wiilka',
                    'Magaca gabadha wiilka'
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Waalidiinta & Awooweyaasha */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-3.5 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span>4. Waalidiinta &amp; Awooweyaasha</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="min-h-[52px] flex items-center gap-3 p-3 bg-[#0B1220] rounded-xl border border-[#243449] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.fatherAlive}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, fatherAlive: e.target.checked }))
                    }
                    className="rounded bg-[#0F1B2D] border-[#243449] text-[#10B981] focus:ring-[#10B981] w-4 h-4 shrink-0"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-[#F8FAFC]">Aabbaha wuu nool yahay</div>
                    <div className="text-[11px] text-[#94A3B8]">
                      1/6 haddii carruur jirto, Casabah haddii kale
                    </div>
                  </div>
                </label>
                {renderNameInputs('father', formData.fatherAlive ? 1 : 0, 'Aabbaha', 'Xaaji Maxamed')}
              </div>

              <div>
                <label className="min-h-[52px] flex items-center gap-3 p-3 bg-[#0B1220] rounded-xl border border-[#243449] cursor-pointer hover:border-[#10B981]/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.motherAlive}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, motherAlive: e.target.checked }))
                    }
                    className="rounded bg-[#0F1B2D] border-[#243449] text-[#10B981] focus:ring-[#10B981] w-4 h-4 shrink-0"
                  />
                  <div className="text-xs">
                    <div className="font-bold text-[#F8FAFC]">Hooyada way nooshahay</div>
                    <div className="text-[11px] text-[#94A3B8]">
                      1/6 haddii carruur/walaalo jiraan, 1/3 haddii kale
                    </div>
                  </div>
                </label>
                {renderNameInputs('mother', formData.motherAlive ? 1 : 0, 'Hooyada', 'Maryan Xasan')}
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-[#243449] grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="min-h-[44px] flex items-center gap-2.5 p-2.5 bg-[#0B1220] rounded-xl border border-[#243449] cursor-pointer hover:border-[#10B981]/60 text-xs">
                  <input
                    type="checkbox"
                    checked={formData.paternalGrandfatherAlive}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        paternalGrandfatherAlive: e.target.checked,
                      }))
                    }
                    className="rounded bg-[#0F1B2D] border-[#243449] text-[#10B981] focus:ring-[#10B981] w-4 h-4 shrink-0"
                  />
                  <span className="text-[#F8FAFC] font-medium">Awoowaha (Aabbe)</span>
                </label>
                {renderNameInputs(
                  'paternalGrandfather',
                  formData.paternalGrandfatherAlive ? 1 : 0,
                  'Awoowaha',
                  'Magaca awoowaha'
                )}
              </div>

              <div>
                <label className="min-h-[44px] flex items-center gap-2.5 p-2.5 bg-[#0B1220] rounded-xl border border-[#243449] cursor-pointer hover:border-[#10B981]/60 text-xs">
                  <input
                    type="checkbox"
                    checked={formData.maternalGrandmotherAlive}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maternalGrandmotherAlive: e.target.checked,
                      }))
                    }
                    className="rounded bg-[#0F1B2D] border-[#243449] text-[#10B981] focus:ring-[#10B981] w-4 h-4 shrink-0"
                  />
                  <span className="text-[#F8FAFC] font-medium">Ayeeyada Hooyo</span>
                </label>
                {renderNameInputs(
                  'maternalGrandmother',
                  formData.maternalGrandmotherAlive ? 1 : 0,
                  'Ayeeyada Hooyo',
                  'Magaca ayeeyada hooyo'
                )}
              </div>

              <div>
                <label className="min-h-[44px] flex items-center gap-2.5 p-2.5 bg-[#0B1220] rounded-xl border border-[#243449] cursor-pointer hover:border-[#10B981]/60 text-xs">
                  <input
                    type="checkbox"
                    checked={formData.paternalGrandmotherAlive}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        paternalGrandmotherAlive: e.target.checked,
                      }))
                    }
                    className="rounded bg-[#0F1B2D] border-[#243449] text-[#10B981] focus:ring-[#10B981] w-4 h-4 shrink-0"
                  />
                  <span className="text-[#F8FAFC] font-medium">Ayeeyada Aabbe</span>
                </label>
                {renderNameInputs(
                  'paternalGrandmother',
                  formData.paternalGrandmotherAlive ? 1 : 0,
                  'Ayeeyada Aabbe',
                  'Magaca ayeeyada aabbe'
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Walaalaha */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-3.5">
              5. Walaalaha Marxuumka (Labada Waalid, Aabbe ama Hooyo)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="text-[#94A3B8] block mb-1.5">Walaalaha Dhashay (Lab)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.fullBrothersCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      fullBrothersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'fullBrothers',
                  formData.fullBrothersCount,
                  'Walaalka',
                  'Magaca walaalka'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Walaalaha Dhashay (Dheddig)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.fullSistersCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      fullSistersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'fullSisters',
                  formData.fullSistersCount,
                  'Walaasha',
                  'Magaca walaasha'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Walaalaha Aabbaha (Lab)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.paternalBrothersCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paternalBrothersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'paternalBrothers',
                  formData.paternalBrothersCount,
                  'Walaalka Aabbe',
                  'Magaca walaalka'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Walaalaha Aabbaha (Dheddig)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.paternalSistersCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paternalSistersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'paternalSisters',
                  formData.paternalSistersCount,
                  'Walaasha Aabbe',
                  'Magaca walaasha'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Walaalaha Hooyo (Lab)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.maternalBrothersCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      maternalBrothersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'maternalBrothers',
                  formData.maternalBrothersCount,
                  'Walaalka Hooyo',
                  'Magaca walaalka hooyo'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Walaalaha Hooyo (Dheddig)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.maternalSistersCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      maternalSistersCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'maternalSisters',
                  formData.maternalSistersCount,
                  'Walaasha Hooyo',
                  'Magaca walaasha hooyo'
                )}
              </div>
            </div>
          </div>

          {/* Section 6: Adeerrada & Ilma-adeerrada */}
          <div className="bg-[#0F1B2D] border border-[#243449] rounded-2xl p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-3.5">
              6. Adeerrada &amp; Ilma-adeerrada (Casabah Fog)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="text-[#94A3B8] block mb-1.5">Adeerrada Dhashay</label>
                <input
                  type="number"
                  min="0"
                  value={formData.fullPaternalUnclesCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      fullPaternalUnclesCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'fullPaternalUncles',
                  formData.fullPaternalUnclesCount,
                  'Adeerka',
                  'Magaca adeerka'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Adeerrada Aabbaha</label>
                <input
                  type="number"
                  min="0"
                  value={formData.paternalPaternalUnclesCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paternalPaternalUnclesCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'paternalPaternalUncles',
                  formData.paternalPaternalUnclesCount,
                  'Adeerka Aabbe',
                  'Magaca adeerka'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Ilma-adeer Dhashay</label>
                <input
                  type="number"
                  min="0"
                  value={formData.fullCousinsCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      fullCousinsCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'fullCousins',
                  formData.fullCousinsCount,
                  'Ilma-adeer',
                  'Magaca ilma-adeerka'
                )}
              </div>

              <div>
                <label className="text-[#94A3B8] block mb-1.5">Ilma-adeer Aabbe</label>
                <input
                  type="number"
                  min="0"
                  value={formData.paternalCousinsCount}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paternalCousinsCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-[#F8FAFC] font-mono-numbers tabular-nums font-bold focus:outline-none"
                />
                {renderNameInputs(
                  'paternalCousins',
                  formData.paternalCousinsCount,
                  'Ilma-adeer Aabbe',
                  'Magaca ilma-adeerka'
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Compact Modal Footer */}
        <div className="px-4 py-2.5 border-t border-[#243449] bg-[#0F1B2D] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setConfirmClearAll(true)}
            className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] bg-[#0B1220] border border-[#243449] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Nadiifi</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-[#F8FAFC] bg-[#0B1220] border border-[#243449] hover:border-[#94A3B8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ka Noqo
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[38px] inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Keydi &amp; Xisaabi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
