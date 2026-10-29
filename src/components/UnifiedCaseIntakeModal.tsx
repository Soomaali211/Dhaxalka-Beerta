import { useState } from 'react';
import { 
  HeirsInput, 
  EstateAssetItem, 
  EstateDeductionItem, 
  Currency, 
  EMPTY_HEIRS_INPUT, 
  Gender, 
  AssetQualityTier 
} from '../types/inheritance';
import { updateHeirPersonName } from '../utils/heirNameUtils';
import { 
  UserCheck, 
  Users, 
  Coins, 
  Check, 
  X, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Sparkles, 
  Heart, 
  Baby, 
  ShieldCheck, 
  Receipt,
  Info,
  CheckCircle2,
  MapPin,
  UserPlus
} from 'lucide-react';

interface UnifiedCaseIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: Currency;
  onSaveCase: (
    heirs: HeirsInput, 
    assets: EstateAssetItem[], 
    deductions: EstateDeductionItem[],
    autoClear: boolean
  ) => void;
}

export function UnifiedCaseIntakeModal({
  isOpen,
  onClose,
  currency,
  onSaveCase,
}: UnifiedCaseIntakeModalProps) {
  const [activeStep, setActiveStep] = useState<'marxuum' | 'dhaxleey' | 'hanti'>('marxuum');
  
  // Form States
  const [heirsData, setHeirsData] = useState<HeirsInput>({ ...EMPTY_HEIRS_INPUT });
  const [assetList, setAssetList] = useState<EstateAssetItem[]>([]);
  const [deductionList, setDeductionList] = useState<EstateDeductionItem[]>([]);
  
  // Auto-clear setting (requested by user: "Waa in form Ku automatic isku clear gareeyaa marka la buuxiyo xogta marxuumka , dhaxlaha hantida")
  const [autoClearOnSave, setAutoClearOnSave] = useState<boolean>(true);
  const [showAutoClearSuccess, setShowAutoClearSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleGenderChange = (gender: Gender) => {
    setHeirsData(prev => ({
      ...prev,
      deceasedGender: gender,
      wivesCount: gender === 'male' ? (prev.wivesCount || 1) : 0,
      husbandAlive: gender === 'female',
    }));
  };

  const handleClearAll = () => {
    setHeirsData({ ...EMPTY_HEIRS_INPUT });
    setAssetList([]);
    setDeductionList([]);
    setShowAutoClearSuccess(false);
  };

  const handlePersonNameChange = (groupKey: string, idx: number, val: string) => {
    setHeirsData(prev => updateHeirPersonName(prev, groupKey, idx, val));
  };

  const renderNameInputs = (groupKey: string, count: number, labelPrefix: string, placeholderExample: string) => {
    if (count <= 0) return null;
    const namesArr = heirsData.heirNames?.[groupKey] || [];
    return (
      <div className="mt-2.5 pt-2.5 border-t border-neutral-800/80 space-y-2">
        <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          <span>Qor Magaca Qofkasta ({labelPrefix}):</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: count }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-neutral-400 w-16 shrink-0">
                {count === 1 ? labelPrefix : `${labelPrefix} ${idx + 1}:`}
              </span>
              <input
                type="text"
                value={namesArr[idx] || ''}
                onChange={(e) => handlePersonNameChange(groupKey, idx, e.target.value)}
                placeholder={`${placeholderExample} ${count > 1 ? idx + 1 : ''}`}
                className="flex-1 bg-neutral-950 border border-neutral-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const handleAddAsset = (category: EstateAssetItem['category'] = 'real_estate') => {
    const newItem: EstateAssetItem = {
      id: `asset_${Date.now()}`,
      category,
      title: category === 'real_estate' ? 'Dhul / Plot Meel Fiican ah' : category === 'livestock' ? 'Geel / Ari' : 'Hanti Cusub',
      quantity: category === 'real_estate' ? 3 : 1,
      unit: category === 'real_estate' ? 'Plot' : category === 'livestock' ? 'Neef' : 'Xabbo',
      estimatedValueUSD: 50000,
      qualityTier: 'tier_1_prime',
      tierName: 'Heerka 1aad (Meel Fiican / Prime)',
      location: 'Wadada Laamiga ah',
      isUnvaluedLand: false,
    };
    setAssetList(prev => [...prev, newItem]);
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
      plotSize: '20x20 m²',
      qualityTier: 'tier_1_prime',
      tierName: 'Heerka 1aad (Meel Fiican / Prime)',
      location: 'Dagmada Hodan / Bartamaha Magaalada',
    };
    setAssetList(prev => [...prev, newItem]);
  };

  const handleUpdateAsset = (id: string, updates: Partial<EstateAssetItem>) => {
    setAssetList(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleDeleteAsset = (id: string) => {
    setAssetList(prev => prev.map(item => item).filter(item => item.id !== id));
  };

  const handleAddDeduction = () => {
    const newItem: EstateDeductionItem = {
      id: `deduction_${Date.now()}`,
      category: 'debt_human',
      title: 'Deyn Dad lagu leeyahay',
      amountUSD: 1000,
      isCustom: true,
    };
    setDeductionList(prev => [...prev, newItem]);
  };

  const handleUpdateDeduction = (id: string, updates: Partial<EstateDeductionItem>) => {
    setDeductionList(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleDeleteDeduction = (id: string) => {
    setDeductionList(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveAndSubmit = () => {
    // 1. Submit current case
    onSaveCase(heirsData, assetList, deductionList, autoClearOnSave);

    // 2. If auto-clear is enabled, automatically clear form fields
    if (autoClearOnSave) {
      setHeirsData({ ...EMPTY_HEIRS_INPUT });
      setAssetList([]);
      setDeductionList([]);
      setShowAutoClearSuccess(true);
      setActiveStep('marxuum');
      setTimeout(() => {
        onClose();
        setShowAutoClearSuccess(false);
      }, 1200);
    } else {
      onClose();
    }
  };

  const totalAssetsUSD = assetList.reduce((sum, item) => sum + (item.estimatedValueUSD || 0), 0);
  const totalDeductionsUSD = deductionList.reduce((sum, item) => sum + (item.amountUSD || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Foomka Dhameystiran ee Kiis Cusub
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Marxuum + Dhaxleey + Hanti
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Buuxi xogta marxuumka, ehelka dhaxlaya iyo hantida si toos ahna u kaydi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearAll}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
              title="Galaas ka dhig / nadiifi dhammaan qeybaha"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Nadiifi Foomka</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAndSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg hover:shadow-emerald-900/40 transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Keydi & Xisaabi (Save)</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Banner when Auto-cleared */}
        {showAutoClearSuccess && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-6 py-3 flex items-center justify-between text-xs text-emerald-200">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                Xogta marxuumka, dhaxlayaasha iyo hantida si guul leh ayaa loo keydiyey! Foomkuna si toos ah ayuu isku nadiifiyey (Auto-cleared) kiis cusub ahaan.
              </span>
            </div>
          </div>
        )}

        {/* 3 Steps Navigation */}
        <div className="bg-neutral-950/70 border-b border-neutral-800 px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setActiveStep('marxuum')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeStep === 'marxuum'
                  ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>1. Xogta Marxuumka</span>
              {heirsData.deceasedName && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveStep('dhaxleey')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeStep === 'dhaxleey'
                  ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span>2. Dhaxlayaasha (Heirs)</span>
              {(heirsData.sonsCount > 0 || heirsData.daughtersCount > 0 || heirsData.wivesCount > 0 || heirsData.fatherAlive || heirsData.motherAlive) && (
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveStep('hanti')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeStep === 'hanti'
                  ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Coins className="w-4 h-4 text-teal-400" />
              <span>3. Hantida & Deymaha</span>
              {assetList.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-teal-500/20 text-teal-300 font-mono">
                  {assetList.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="hidden md:flex items-center gap-4 text-xs font-mono-numbers">
            <div>
              <span className="text-neutral-500 text-[10px] block">Hantida:</span>
              <span className="text-emerald-400 font-bold">${totalAssetsUSD.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-neutral-500 text-[10px] block">Deymaha:</span>
              <span className="text-rose-400 font-bold">-${totalDeductionsUSD.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ================= STEP 1: XOGTA MARXUUMKA ================= */}
          {activeStep === 'marxuum' && (
            <div className="space-y-5 animate-in fade-in-50 duration-150">
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>Xogta Guud ee Marxuumka</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Magaca Marxuumka / Marxuumadda <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={heirsData.deceasedName}
                      onChange={(e) => setHeirsData(prev => ({ ...prev, deceasedName: e.target.value }))}
                      placeholder="e.g. Marxuum Jaamac Cali Shire"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                      Jinsiga Marxuumka <span className="text-rose-400">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleGenderChange('male')}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          heirsData.deceasedGender === 'male'
                            ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300 shadow-sm'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Lab (Ninka dhintay)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenderChange('female')}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          heirsData.deceasedGender === 'female'
                            ? 'bg-emerald-600/25 border-emerald-500 text-emerald-300 shadow-sm'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Dheddig (Haweeneyda dhimatay)
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Taariikhda Geerida (Ikhtiyaari)
                  </label>
                  <input
                    type="date"
                    value={heirsData.dateOfDeath || ''}
                    onChange={(e) => setHeirsData(prev => ({ ...prev, dateOfDeath: e.target.value }))}
                    className="w-full sm:w-64 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Quick Prompt to Next */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveStep('dhaxleey')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
                >
                  U gudub Dhaxlayaasha →
                </button>
              </div>
            </div>
          )}

          {/* ================= STEP 2: DHAXLAYAASHA ================= */}
          {activeStep === 'dhaxleey' && (
            <div className="space-y-5 animate-in fade-in-50 duration-150">
              
              {/* Spouses */}
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span>Qoyska Tooska ah (Sayga / Xaaska)</span>
                </h4>

                {heirsData.deceasedGender === 'male' ? (
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                      Tirada Xaasaska Nool (0 ilaa 4 xaas)
                    </label>
                    <div className="flex items-center gap-2">
                      {[0, 1, 2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setHeirsData(prev => ({ ...prev, wivesCount: count }))}
                          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                            heirsData.wivesCount === count
                              ? 'bg-emerald-600 text-white border-emerald-500'
                              : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {count === 0 ? 'Xaas ma leh' : `${count} Xaas`}
                        </button>
                      ))}
                    </div>
                    {renderNameInputs('wives', heirsData.wivesCount, 'Xaaska', 'e.g. Xaliimo Cali')}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                      Sayga (Ninka xaaskiisu dhimatay) ma nool yahay?
                    </label>
                    <div className="grid grid-cols-2 gap-3 max-w-sm">
                      <button
                        type="button"
                        onClick={() => setHeirsData(prev => ({ ...prev, husbandAlive: true }))}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          heirsData.husbandAlive
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Haa, wuu nool yahay
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeirsData(prev => ({ ...prev, husbandAlive: false }))}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          !heirsData.husbandAlive
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Maya (Hore u dhintay)
                      </button>
                    </div>
                    {renderNameInputs('husband', heirsData.husbandAlive ? 1 : 0, 'Sayga', 'e.g. Maxamed Jaamac')}
                  </div>
                )}
              </div>

              {/* Children */}
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Baby className="w-4 h-4 text-amber-400" />
                  <span>Carruurta Marxuumka (Wiilasha & Gabdhaha)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-neutral-900/80 p-3 rounded-lg border border-neutral-800">
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Tirada Wiilasha Nool
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        value={heirsData.sonsCount}
                        onChange={(e) => setHeirsData(prev => ({ ...prev, sonsCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono font-bold"
                      />
                      <span className="text-xs text-neutral-400">Wiil</span>
                    </div>
                    {renderNameInputs('sons', heirsData.sonsCount, 'Wiilka', 'e.g. Cabdiraxmaan Maxamed')}
                  </div>

                  <div className="bg-neutral-900/80 p-3 rounded-lg border border-neutral-800">
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Tirada Gabdhaha Nool
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        value={heirsData.daughtersCount}
                        onChange={(e) => setHeirsData(prev => ({ ...prev, daughtersCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono font-bold"
                      />
                      <span className="text-xs text-neutral-400">Gabadh</span>
                    </div>
                    {renderNameInputs('daughters', heirsData.daughtersCount, 'Gabadha', 'e.g. Faadumo Maxamed')}
                  </div>
                </div>
              </div>

              {/* Parents */}
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Waalidiinta Marxuumka</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1.5">Aabbaha ma nool yahay?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setHeirsData(prev => ({ ...prev, fatherAlive: true }))}
                        className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          heirsData.fatherAlive
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Haa, wuu nool yahay
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeirsData(prev => ({ ...prev, fatherAlive: false }))}
                        className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          !heirsData.fatherAlive
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Maya, wuu dhintay
                      </button>
                    </div>
                    {renderNameInputs('father', heirsData.fatherAlive ? 1 : 0, 'Aabbaha', 'e.g. Xaaji Maxamed')}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1.5">Hooyadu ma nooshahay?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setHeirsData(prev => ({ ...prev, motherAlive: true }))}
                        className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          heirsData.motherAlive
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Haa, way nooshahay
                      </button>
                      <button
                        type="button"
                        onClick={() => setHeirsData(prev => ({ ...prev, motherAlive: false }))}
                        className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition-all ${
                          !heirsData.motherAlive
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Maya, way dhimatay
                      </button>
                    </div>
                    {renderNameInputs('mother', heirsData.motherAlive ? 1 : 0, 'Hooyada', 'e.g. Hooyo Maryan')}
                  </div>
                </div>
              </div>

              {/* Siblings */}
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Walaalaha Marxuumka (Haddii carruur ama aabbe jirin)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-neutral-400 block mb-1">Walaal Dhashay (Lab)</label>
                    <input
                      type="number"
                      min="0"
                      value={heirsData.fullBrothersCount}
                      onChange={(e) => setHeirsData(prev => ({ ...prev, fullBrothersCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                    {renderNameInputs('fullBrothers', heirsData.fullBrothersCount, 'Walaalka', 'Magaca walaalka')}
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Walaal Dhashay (Dheddig)</label>
                    <input
                      type="number"
                      min="0"
                      value={heirsData.fullSistersCount}
                      onChange={(e) => setHeirsData(prev => ({ ...prev, fullSistersCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                    {renderNameInputs('fullSisters', heirsData.fullSistersCount, 'Walaasha', 'Magaca walaasha')}
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Walaal Aabbe (Lab)</label>
                    <input
                      type="number"
                      min="0"
                      value={heirsData.paternalBrothersCount}
                      onChange={(e) => setHeirsData(prev => ({ ...prev, paternalBrothersCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                    {renderNameInputs('paternalBrothers', heirsData.paternalBrothersCount, 'Walaalka Aabbe', 'Magaca walaalka')}
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Walaal Aabbe (Dheddig)</label>
                    <input
                      type="number"
                      min="0"
                      value={heirsData.paternalSistersCount}
                      onChange={(e) => setHeirsData(prev => ({ ...prev, paternalSistersCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                    {renderNameInputs('paternalSisters', heirsData.paternalSistersCount, 'Walaasha Aabbe', 'Magaca walaasha')}
                  </div>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep('marxuum')}
                  className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  ← Dib ugu noqo Marxuumka
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep('hanti')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
                >
                  U gudub Hantida & Deymaha →
                </button>
              </div>

            </div>
          )}

          {/* ================= STEP 3: HANTIDA & DEYMAHA ================= */}
          {activeStep === 'hanti' && (
            <div className="space-y-5 animate-in fade-in-50 duration-150">
              
              {/* Asset Quality Tiers Notice */}
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90 leading-relaxed">
                  <strong className="text-amber-300 font-semibold block mb-0.5">
                    Xeerka Qaybinta Heerarka Hantida (Asset Quality Tiers & 2:1 Parity):
                  </strong>
                  Haddii wiilku uu helo <strong>2 plot oo meel fiican ku yaala</strong>, gabadhuna waa inay heshaa <strong>1 plot oo meel fiican ku yaala</strong>. Halkan ku qeex heerka hantida (Heerka 1aad: Meel Fiican/Prime, Heerka 2aad: Dhexe, Heerka 3aad: Duleed).
                </div>
              </div>

              {/* Quick Add Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-medium text-neutral-300">
                  Liiska Hantida ({assetList.length}):
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddUnvaluedLand}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-200 bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/40 rounded-lg transition-colors cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>+ Dhul Aan Lacag Lahayn (Plots Kaliya)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddAsset('real_estate')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Dhul / Plots / Guri</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddAsset('livestock')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Xoolo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddAsset('farm_land')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Beer</span>
                  </button>
                </div>
              </div>

              {/* Asset Items */}
              {assetList.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-neutral-800 rounded-xl bg-neutral-950/40">
                  <Coins className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                  <p className="text-xs text-neutral-400">Hanti wali lama gelin.</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleAddUnvaluedLand}
                      className="px-3 py-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/50 rounded-lg border border-amber-500/40 cursor-pointer"
                    >
                      + Ku dar Dhul aan Lacag Lahayn (Plots)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddAsset('real_estate')}
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/50 rounded-lg border border-emerald-500/30 cursor-pointer"
                    >
                      + Ku dar Hanti Lacag ku Qiimaysan
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {assetList.map((item) => (
                    <div
                      key={item.id}
                      className={`border rounded-xl p-3.5 space-y-3 transition-colors ${
                        item.isUnvaluedLand 
                          ? 'bg-neutral-950/90 border-amber-500/40' 
                          : 'bg-neutral-950/80 border-neutral-800'
                      }`}
                    >
                      {/* Top Bar for Land: Unvalued Land Toggle */}
                      <div className="flex items-center justify-between pb-1 border-b border-neutral-850">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={item.isUnvaluedLand || false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              handleUpdateAsset(item.id, {
                                isUnvaluedLand: checked,
                                category: checked ? 'real_estate' : item.category,
                                unit: checked ? (item.unit || 'Plot') : item.unit,
                                estimatedValueUSD: checked ? 0 : (item.estimatedValueUSD || 50000),
                                plotSize: checked ? (item.plotSize || '20x20 m²') : item.plotSize,
                              });
                            }}
                            className="rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400" />
                            <span>Dhul aan lacag ku qiimaysnayn (Plots / Baloodho sidooda loo qaybinayo)</span>
                          </span>
                        </label>

                        {item.isUnvaluedLand && (
                          <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Plots Sidooda ah ($0 Qiimeyn)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-neutral-400 font-medium block mb-1">Nooca Hantida</label>
                          <select
                            value={item.category}
                            onChange={(e) => handleUpdateAsset(item.id, { category: e.target.value as any })}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="real_estate">Dhul / Plots / Guri</option>
                            <option value="farm_land">Beer / Dhul Beereed</option>
                            <option value="livestock">Xoolo (Geel, Lo', Ari)</option>
                            <option value="bank">Bangi / Xisaab Kayd</option>
                            <option value="cash">Lacag Cadaan ah</option>
                            <option value="gold_jewelry">Dahab / Qalab Qaali ah</option>
                            <option value="business">Ganacsi / Saamiyo</option>
                            <option value="other">Hanti Kale</option>
                          </select>
                        </div>

                        <div className="sm:col-span-5">
                          <label className="text-[10px] text-neutral-400 font-medium block mb-1">Magaca Hantida</label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => handleUpdateAsset(item.id, { title: e.target.value })}
                            placeholder="e.g. 12 Plot oo Boosaaso ah, Dhul Hargeysa..."
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="text-[10px] text-amber-400 font-semibold block mb-1">
                            Heerka / Tayada (Quality Tier)
                          </label>
                          <select
                            value={item.qualityTier || 'tier_1_prime'}
                            onChange={(e) => {
                              const tier = e.target.value as AssetQualityTier;
                              const tierName = tier === 'tier_1_prime' 
                                ? 'Heerka 1aad (Meel Fiican / Prime)' 
                                : tier === 'tier_2_standard'
                                ? 'Heerka 2aad (Dhexe / Standard)'
                                : 'Heerka 3aad (Hoose / Duleed)';
                              handleUpdateAsset(item.id, { qualityTier: tier, tierName });
                            }}
                            className="w-full bg-amber-950/40 border border-amber-500/40 text-amber-200 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                          >
                            <option value="tier_1_prime" className="bg-neutral-900 text-white">Heerka 1aad: Meel Fiican (Prime)</option>
                            <option value="tier_2_standard" className="bg-neutral-900 text-white">Heerka 2aad: Dhexe (Standard)</option>
                            <option value="tier_3_basic" className="bg-neutral-900 text-white">Heerka 3aad: Hoose / Duleed</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 items-center">
                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-amber-400 font-semibold block mb-0.5">Tirada Baloodhada</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity || 1}
                            onChange={(e) => handleUpdateAsset(item.id, { quantity: Math.max(1, parseFloat(e.target.value) || 1) })}
                            className="w-full bg-neutral-900 border border-amber-500/40 rounded-lg px-2 py-1 text-xs text-amber-200 font-mono font-bold"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-neutral-400 block mb-0.5">Halbeegga</label>
                          <input
                            type="text"
                            value={item.unit || (item.category === 'livestock' ? 'Neef' : 'Plot')}
                            onChange={(e) => handleUpdateAsset(item.id, { unit: e.target.value })}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white"
                          />
                        </div>

                        {item.isUnvaluedLand ? (
                          <div className="sm:col-span-4">
                            <label className="text-[10px] text-amber-400 font-medium block mb-0.5">
                              Cabbirka Baloodhkiiba (Optional Size)
                            </label>
                            <input
                              type="text"
                              value={item.plotSize || ''}
                              onChange={(e) => handleUpdateAsset(item.id, { plotSize: e.target.value })}
                              placeholder="e.g. 20x20 m², 400 m²..."
                              className="w-full bg-neutral-900 border border-amber-600/40 rounded-lg px-2.5 py-1 text-xs text-amber-200"
                            />
                          </div>
                        ) : (
                          <div className="sm:col-span-4">
                            <label className="text-[10px] text-emerald-400 font-semibold block mb-0.5">
                              Wadarta Qiimaha ({currency})
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={item.estimatedValueUSD}
                              onChange={(e) => handleUpdateAsset(item.id, { estimatedValueUSD: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-full bg-neutral-900 border border-emerald-500/40 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                            />
                          </div>
                        )}

                        <div className="sm:col-span-3 flex justify-end pt-3">
                          <button
                            type="button"
                            onClick={() => handleDeleteAsset(item.id)}
                            className="text-neutral-500 hover:text-rose-400 p-1.5 rounded transition-colors"
                            title="Tirtir hantidan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Deductions section */}
              <div className="pt-4 border-t border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-rose-400" />
                    <span>Deymaha & Kharashaadka Marxuumka ({deductionList.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAddDeduction}
                    className="text-xs text-rose-400 hover:text-rose-300 bg-rose-950/40 border border-rose-500/30 px-2.5 py-1 rounded-lg"
                  >
                    + Ku dar Deyn
                  </button>
                </div>

                {deductionList.map((d) => (
                  <div key={d.id} className="bg-neutral-950/60 border border-neutral-800 rounded-lg p-2.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={d.title}
                      onChange={(e) => handleUpdateDeduction(d.id, { title: e.target.value })}
                      placeholder="Magaca deynta ama dardaaranka..."
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <div className="w-32">
                      <input
                        type="number"
                        min="0"
                        value={d.amountUSD}
                        onChange={(e) => handleUpdateDeduction(d.id, { amountUSD: Math.max(0, parseFloat(e.target.value) || 0) })}
                        placeholder="Lacagta"
                        className="w-full bg-neutral-900 border border-rose-500/40 rounded px-2 py-1 text-xs text-rose-300 font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDeduction(d.id)}
                      className="p-1 text-neutral-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

            </div>
          )}

        </div>

        {/* Sticky Footer with Auto-Clear Checkbox & Action */}
        <div className="sticky bottom-0 z-30 px-6 py-4 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* User Request Feature: Auto-Clear Toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={autoClearOnSave}
              onChange={(e) => setAutoClearOnSave(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 bg-neutral-900 border-neutral-700 focus:ring-emerald-500 focus:ring-offset-neutral-950 cursor-pointer"
            />
            <span className="text-neutral-300 font-medium">
              Si toos ah foomka u nadiifi (Auto-clear) marka la buuxiyo / la keydiyo
            </span>
          </label>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3.5 py-2 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
            >
              Nadiifi Dhammaan
            </button>
            <button
              type="button"
              onClick={handleSaveAndSubmit}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg hover:shadow-emerald-900/40 transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Keydi & Xisaabi (Save)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
