import { useState, useEffect } from 'react';
import { EstateAssetItem, EstateDeductionItem, Currency } from '../types/inheritance';
import {
  Plus,
  Trash2,
  Coins,
  Receipt,
  X,
  Check,
  Info,
  RotateCcw,
  MapPin,
  AlertTriangle,
} from 'lucide-react';

interface AssetsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: EstateAssetItem[];
  deductions: EstateDeductionItem[];
  currency: Currency;
  onSave: (assets: EstateAssetItem[], deductions: EstateDeductionItem[]) => void;
  onOpenLandDesigner?: () => void;
}

export function AssetsConfigModal({
  isOpen,
  onClose,
  assets: initialAssets,
  deductions: initialDeductions,
  currency,
  onSave,
  onOpenLandDesigner,
}: AssetsConfigModalProps) {
  const [assetList, setAssetList] = useState<EstateAssetItem[]>([...initialAssets]);
  const [deductionList, setDeductionList] = useState<EstateDeductionItem[]>([...initialDeductions]);
  const [activeTab, setActiveTab] = useState<'assets' | 'deductions'>('assets');
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setAssetList([...initialAssets]);
      setDeductionList([...initialDeductions]);
      setConfirmClearAll(false);
    }
  }, [isOpen, initialAssets, initialDeductions]);

  if (!isOpen) return null;

  const handleClearAllConfirmed = () => {
    setAssetList([]);
    setDeductionList([]);
    setConfirmClearAll(false);
  };

  const totalAssets = assetList.reduce((sum, a) => sum + (a.estimatedValueUSD || 0), 0);
  const totalDeductions = deductionList.reduce((sum, d) => sum + (d.amountUSD || 0), 0);
  const netTarkah = Math.max(0, totalAssets - totalDeductions);

  // Asset CRUD
  const handleAddAsset = () => {
    const newItem: EstateAssetItem = {
      id: `asset_${Date.now()}`,
      category: 'real_estate',
      title: 'Dhul / Plot Meel Fiican ah',
      quantity: 3,
      unit: 'Plot',
      estimatedValueUSD: 60000,
      qualityTier: 'tier_1_prime',
      tierName: 'Heerka 1aad (Meel Fiican / Prime)',
      location: 'Wadada Laamiga ah',
      isUnvaluedLand: false,
    };
    setAssetList([...assetList, newItem]);
  };

  const handleAddUnvaluedLand = () => {
    const newItem: EstateAssetItem = {
      id: `asset_${Date.now()}`,
      category: 'real_estate',
      title: 'Dhul Baloodho ah (Aan Lacag ku Qiimaysnayn)',
      quantity: 12,
      unit: 'Plot',
      estimatedValueUSD: 0,
      isUnvaluedLand: true,
      plotSize: '18x24 m²',
      qualityTier: 'tier_1_prime',
      tierName: 'Heerka 1aad (Meel Fiican / Prime)',
      location: 'Bartamaha Magaalada',
    };
    setAssetList([...assetList, newItem]);
  };

  const handleUpdateAsset = (id: string, updates: Partial<EstateAssetItem>) => {
    setAssetList(assetList.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const handleDeleteAsset = (id: string) => {
    setAssetList(assetList.filter((item) => item.id !== id));
  };

  // Deduction CRUD
  const handleAddDeduction = () => {
    const newItem: EstateDeductionItem = {
      id: `deduction_${Date.now()}`,
      category: 'debt_human',
      title: 'Deyn Cusub',
      amountUSD: 1000,
      isCustom: true,
    };
    setDeductionList([...deductionList, newItem]);
  };

  const handleUpdateDeduction = (id: string, updates: Partial<EstateDeductionItem>) => {
    setDeductionList(deductionList.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const handleDeleteDeduction = (id: string) => {
    setDeductionList(deductionList.filter((item) => item.id !== id));
  };

  const handleSave = () => {
    onSave(assetList, deductionList);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Diiwaanka Hantida iyo Deymaha Marxuumka"
    >
      <div className="bg-[#0B1220] border border-[#243449] text-[#F8FAFC] rounded-t-3xl sm:rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        <div className="w-10 h-1.5 bg-[#243449] rounded-full mx-auto mt-3 sm:hidden shrink-0" />

        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#243449] flex items-center justify-between gap-3 bg-[#0F1B2D]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#F8FAFC] truncate">
                Diiwaanka Hantida &amp; Deymaha Marxuumka
              </h2>
              <p className="text-xs text-[#94A3B8] truncate">
                Geli hantida guud iyo xuquuqda ka horreysa qaybinta dhaxalka
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              className="hidden sm:inline-flex min-h-[42px] items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Keydi Hantida</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl hover:bg-[#0B1220] transition-colors cursor-pointer"
              aria-label="Xir daaqadda"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher & Quick Financial Summary */}
        <div className="bg-[#0B1220] border-b border-[#243449] px-5 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-[#0F1B2D] border border-[#243449] rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('assets')}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'assets'
                  ? 'bg-[#10B981] text-[#030712]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Coins className="w-3.5 h-3.5 shrink-0" />
              <span>Hantida Guud ({assetList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('deductions')}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'deductions'
                  ? 'bg-[#10B981] text-[#030712]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 shrink-0" />
              <span>Deymaha &amp; Dardaaranka ({deductionList.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono-numbers tabular-nums">
            <div>
              <span className="text-[#94A3B8] text-[11px] block">Hantida ({currency})</span>
              <span className="text-[#10B981] font-bold">${totalAssets.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[#94A3B8] text-[11px] block">Deymaha</span>
              <span className="text-rose-400 font-bold">-${totalDeductions.toLocaleString()}</span>
            </div>
            <div className="border-l border-[#243449] pl-4">
              <span className="text-[#94A3B8] text-[11px] block">Saafiga Tarkada</span>
              <span className="text-[#F8FAFC] font-extrabold">${netTarkah.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Inline Confirmation Banner for Destructive Clear */}
        {confirmClearAll && (
          <div className="px-5 sm:px-6 py-3.5 bg-red-950/60 border-b border-red-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>
                Ma hubtaa inaad nadiifiso dhammaan liiska hantida ({assetList.length}) iyo deymaha ({deductionList.length}) ee daaqaddan?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0F1B2D] border border-[#243449] text-[#F8FAFC] font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Jooji
              </button>
              <button
                type="button"
                onClick={handleClearAllConfirmed}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Haa, Nadiifi
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'assets' ? (
            <div className="space-y-4">
              {/* Sharia Quality Tiering Guidance */}
              <div className="bg-[#0F1B2D] border border-[#243449] rounded-xl p-3.5 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-[#94A3B8] leading-relaxed">
                  <strong className="text-[#F8FAFC] font-bold block mb-0.5">
                    Xeerka Qaybinta Heerarka Hantida (Saamiga 2:1 ee Heer Kasta):
                  </strong>
                  Haddii wiilku helo <strong className="text-[#F8FAFC]">2 plot oo meel fiican ku yaalla</strong>, gabadhuna waa inay heshaa <strong className="text-[#F8FAFC]">1 plot oo isla heerkaas ah</strong>. Halkan ku qeex heerka hantida (Heerka 1aad: Meel Fiican, Heerka 2aad: Dhexe, Heerka 3aad: Duleed) si nidaamku u ilaaliyo caddaaladda.
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-xs text-[#94A3B8]">
                  Liiska hantida (dhul/plots, guryo, beero, xoolo, lacag, dahab):
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenLandDesigner && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenLandDesigner();
                      }}
                      className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#F8FAFC] bg-[#0F1B2D] hover:border-[#10B981] border border-[#243449] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                      <span>Khariidadda Blocks &amp; Plots (GIS)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddUnvaluedLand}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-300 bg-[#0F1B2D] hover:border-amber-400/60 border border-[#243449] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>+ Dhul Aan Qiimaysnayn (Plots)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAsset}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Ku Dar Hanti Cusub</span>
                  </button>
                </div>
              </div>

              {assetList.length === 0 ? (
                <div className="text-center py-10 rounded-xl bg-[#0F1B2D]/60 border border-[#243449] text-xs text-[#94A3B8]">
                  Ma jirto hanti la diiwaangeliyey. Taabo &ldquo;Ku Dar Hanti Cusub&rdquo; si aad u bilowdo.
                </div>
              ) : (
                assetList.map((item) => (
                  <div
                    key={item.id}
                    className={`border rounded-xl p-4 space-y-3 transition-colors bg-[#0F1B2D] ${
                      item.isUnvaluedLand ? 'border-amber-500/40' : 'border-[#243449]'
                    }`}
                  >
                    {/* Top Row: Unvalued Land Toggle */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#243449]">
                      <label className="min-h-[36px] flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={item.isUnvaluedLand || false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            handleUpdateAsset(item.id, {
                              isUnvaluedLand: checked,
                              category: checked ? 'real_estate' : item.category,
                              unit: checked ? item.unit || 'Plot' : item.unit,
                              estimatedValueUSD: checked ? 0 : item.estimatedValueUSD || 50000,
                              plotSize: checked ? item.plotSize || '18x24 m²' : item.plotSize,
                            });
                          }}
                          className="rounded border-[#243449] bg-[#0B1220] text-[#10B981] focus:ring-[#10B981] h-4 w-4 cursor-pointer shrink-0"
                        />
                        <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Dhul aan lacag ku qiimaysnayn (Plots sidooda loo qaybinayo)</span>
                        </span>
                      </label>

                      {item.isUnvaluedLand && (
                        <span className="text-xs font-mono tabular-nums font-semibold text-amber-300">
                          Plots Sidooda ah · $0 Qiimeyn
                        </span>
                      )}
                    </div>

                    {/* Row 1: Category, Title, Quality Tier */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-3">
                        <label className="text-[11px] text-[#94A3B8] font-medium block mb-1">
                          Nooca Hantida
                        </label>
                        <select
                          value={item.category}
                          onChange={(e) =>
                            handleUpdateAsset(item.id, { category: e.target.value as EstateAssetItem['category'] })
                          }
                          className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] focus:outline-none"
                        >
                          <option value="real_estate">Dhul / Plots / Guri</option>
                          <option value="farm_land">Beer / Dhul Beereed</option>
                          <option value="livestock">Xoolo (Geel, Lo&apos;, Ari)</option>
                          <option value="bank">Bangi / Xisaab Kayd</option>
                          <option value="cash">Lacag Cadaan ah</option>
                          <option value="gold_jewelry">Dahab / Qalab Qaali ah</option>
                          <option value="business">Ganacsi / Saamiyo</option>
                          <option value="receivables">Deymo dibadda ka maqan</option>
                          <option value="other">Hanti Kale</option>
                        </select>
                      </div>

                      <div className="sm:col-span-5">
                        <label className="text-[11px] text-[#94A3B8] font-medium block mb-1">
                          Magaca / Faahfaahinta
                        </label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleUpdateAsset(item.id, { title: e.target.value })}
                          placeholder="Tusaale: 12 Plot oo Hargeysa ah..."
                          className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-[11px] text-amber-300 font-semibold block mb-1">
                          Heerka / Tayada Dhulka
                        </label>
                        <select
                          value={item.qualityTier || 'tier_1_prime'}
                          onChange={(e) =>
                            handleUpdateAsset(item.id, {
                              qualityTier: e.target.value as EstateAssetItem['qualityTier'],
                              tierName:
                                e.target.value === 'tier_1_prime'
                                  ? 'Heerka 1aad (Meel Fiican / Prime)'
                                  : e.target.value === 'tier_2_standard'
                                  ? 'Heerka 2aad (Heer Dhexe)'
                                  : 'Heerka 3aad (Heer Hoose / Duleed)',
                            })
                          }
                          className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-amber-200 font-semibold focus:outline-none"
                        >
                          <option value="tier_1_prime">Heerka 1aad: Meel Fiican</option>
                          <option value="tier_2_standard">Heerka 2aad: Heer Dhexe</option>
                          <option value="tier_3_basic">Heerka 3aad: Heer Hoose / Duleed</option>
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Location, Quantity, Unit, Value/Size, Delete */}
                    <div className="grid grid-cols-2 sm:grid-cols-12 gap-3 items-end pt-2 border-t border-[#243449]">
                      <div className="col-span-2 sm:col-span-3">
                        <label className="text-[11px] text-[#94A3B8] font-medium block mb-1">
                          Goobta
                        </label>
                        <input
                          type="text"
                          value={item.location || ''}
                          onChange={(e) => handleUpdateAsset(item.id, { location: e.target.value })}
                          placeholder="Tusaale: Wadada Laamiga ah..."
                          className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2">
                        <label className="text-[11px] text-[#94A3B8] font-semibold block mb-1">
                          Tirada
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || 1}
                          onChange={(e) =>
                            handleUpdateAsset(item.id, {
                              quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-2.5 py-2 text-xs text-[#F8FAFC] font-mono-numbers tabular-nums text-center font-bold focus:outline-none"
                        />
                      </div>

                      <div className="col-span-1 sm:col-span-2">
                        <label className="text-[11px] text-[#94A3B8] font-medium block mb-1">
                          Halbeegga
                        </label>
                        <input
                          type="text"
                          value={item.unit || (item.category === 'livestock' ? 'Neef' : 'Plot')}
                          onChange={(e) => handleUpdateAsset(item.id, { unit: e.target.value })}
                          placeholder="Plot / Neef"
                          className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-2.5 py-2 text-xs text-[#F8FAFC] text-center focus:outline-none"
                        />
                      </div>

                      {item.isUnvaluedLand ? (
                        <div className="col-span-2 sm:col-span-4">
                          <label className="text-[11px] text-amber-300 font-medium block mb-1">
                            Cabbirka Baloodhkiiba (Ikhtiyaari)
                          </label>
                          <input
                            type="text"
                            value={item.plotSize || ''}
                            onChange={(e) => handleUpdateAsset(item.id, { plotSize: e.target.value })}
                            placeholder="Tusaale: 18x24 m² (432 m²)"
                            className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-amber-200 font-mono tabular-nums focus:outline-none"
                          />
                        </div>
                      ) : (
                        <div className="col-span-2 sm:col-span-4">
                          <label className="text-[11px] text-[#94A3B8] font-medium block mb-1">
                            Wadarta Qiimaha ({currency})
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-3 text-xs text-[#94A3B8]">$</span>
                            <input
                              type="number"
                              min="0"
                              value={item.estimatedValueUSD}
                              onChange={(e) =>
                                handleUpdateAsset(item.id, {
                                  estimatedValueUSD: Math.max(0, parseFloat(e.target.value) || 0),
                                })
                              }
                              className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl pl-7 pr-3 py-2 text-xs text-[#10B981] font-mono-numbers tabular-nums font-bold focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      <div className="col-span-2 sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(item.id)}
                          className="min-h-[42px] min-w-[42px] flex items-center justify-center text-[#94A3B8] hover:text-rose-400 rounded-xl hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Tirtir hantidan"
                          aria-label="Tirtir hantidan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[#94A3B8]">
                  Xuquuqda iyo deymaha ka horreeya dhaxalka shareecada Islaamka:
                </span>
                <button
                  type="button"
                  onClick={handleAddDeduction}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Ku Dar Deyn / Kharash</span>
                </button>
              </div>

              {deductionList.length === 0 ? (
                <div className="text-center py-8 rounded-xl bg-[#0F1B2D]/60 border border-[#243449] text-xs text-[#94A3B8]">
                  Ma jirto deyn ama dardaaran diiwaangashan.
                </div>
              ) : (
                deductionList.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#0F1B2D] border border-[#243449] rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
                  >
                    <div className="w-full sm:w-52">
                      <label className="text-[11px] text-[#94A3B8] block mb-1">Nooca Xuquuqda</label>
                      <select
                        value={item.category}
                        onChange={(e) =>
                          handleUpdateDeduction(item.id, {
                            category: e.target.value as EstateDeductionItem['category'],
                          })
                        }
                        className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] focus:outline-none"
                      >
                        <option value="funeral">Diyaarinta &amp; Aaska (Tajheez)</option>
                        <option value="debt_divine">Deynta Eebbe (Sako, Kafaaro, Xaj)</option>
                        <option value="debt_human">Deynta Addoomaha (Qaan shakhsi)</option>
                        <option value="will_wasiyyah">Dardaaran Shariici ah (Wasiyyah)</option>
                      </select>
                    </div>

                    <div className="flex-1">
                      <label className="text-[11px] text-[#94A3B8] block mb-1">Faahfaahinta</label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateDeduction(item.id, { title: e.target.value })}
                        placeholder="Tusaale: Deynta Dukaanka, Kharashka Kafanka..."
                        className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none"
                      />
                    </div>

                    <div className="w-full sm:w-40">
                      <label className="text-[11px] text-[#94A3B8] block mb-1">
                        Cadadka ({currency})
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-3 text-xs text-[#94A3B8]">$</span>
                        <input
                          type="number"
                          min="0"
                          value={item.amountUSD}
                          onChange={(e) =>
                            handleUpdateDeduction(item.id, {
                              amountUSD: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full min-h-[42px] bg-[#0B1220] border border-[#243449] focus:border-[#10B981] rounded-xl pl-7 pr-3 py-2 text-xs text-rose-400 font-mono-numbers tabular-nums font-bold focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteDeduction(item.id)}
                      className="min-h-[42px] min-w-[42px] flex items-center justify-center text-[#94A3B8] hover:text-rose-400 rounded-xl hover:bg-rose-950/40 transition-colors self-end cursor-pointer"
                      title="Tirtir"
                      aria-label="Tirtir kharashkan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}

              <div className="bg-[#0F1B2D] border border-[#243449] rounded-xl p-4 text-xs text-[#94A3B8] flex items-start gap-2.5 mt-4">
                <Info className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-[#F8FAFC]">
                    Kala Horreynta Xuquuqda Sharciga ah (Tartib al-Huquq):
                  </strong>
                  <ol className="list-decimal list-inside space-y-1 mt-1.5 text-[11px] text-[#94A3B8] leading-relaxed">
                    <li>Kharashka diyaarinta meydka, kafanka iyo aaska (iyadoon la iska badinayn).</li>
                    <li>Deymaha marxuumka lagu leeyahay (deynta Eebbe iyo ta aadanaha).</li>
                    <li>
                      Dardaaranka sharciga ah (Wasiyyah) oo aan ka badnayn 1/3 hantida ka soo harta deymaha, lagana dardaarmi karin dhaxalaha.
                    </li>
                    <li>Qaybinta hantida saafiga ah (Tarkah) ee loogu qaybinayo dhaxaleeyda.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-4 pb-safe border-t border-[#243449] bg-[#0F1B2D] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setConfirmClearAll(true)}
            disabled={assetList.length === 0 && deductionList.length === 0}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40 bg-[#0B1220] border border-[#243449] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Nadiifi Dhammaan Hantida</span>
          </button>

          <div className="flex items-center gap-2.5 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 text-xs font-semibold text-[#F8FAFC] bg-[#0B1220] border border-[#243449] hover:border-[#94A3B8] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ka Noqo
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-initial min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-[#030712] bg-[#10B981] hover:bg-[#059669] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>Keydi &amp; Xisaabi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
