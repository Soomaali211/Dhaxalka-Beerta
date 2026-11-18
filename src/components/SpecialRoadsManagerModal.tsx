import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Plus,
  Route,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { LandSubdivisionState, SpecialRoadDefinition } from '../types/landSubdivision';

interface SpecialRoadsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  subdivisionState: LandSubdivisionState;
  onUpdateSubdivisionState: (updater: (prev: LandSubdivisionState) => LandSubdivisionState) => void;
  onNotify: (title: string, message: string) => void;
}

export const SpecialRoadsManagerModal: React.FC<SpecialRoadsManagerModalProps> = ({
  isOpen,
  onClose,
  subdivisionState,
  onUpdateSubdivisionState,
  onNotify,
}) => {
  if (!isOpen) return null;

  const specialRoads = subdivisionState.specialRoads || [];

  const [axis, setAxis] = useState<'column' | 'row'>('column');
  const [index, setIndex] = useState<number>(1);
  const [name, setName] = useState<string>('Waddada Gaarka ah');
  const [widthM, setWidthM] = useState<number>(25);

  const handleAddSpecialRoad = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onNotify('Fadlan Geli Magaca', 'Fadlan geli magaca waddada gaarka ah.');
      return;
    }
    if (widthM <= 0 || !Number.isFinite(widthM)) {
      onNotify('Ballac Khalad ah', 'Fadlan geli ballac sax ah (mitir).');
      return;
    }

    const newRoad: SpecialRoadDefinition = {
      id: `SR-${Date.now().toString().slice(-6)}`,
      axis,
      index,
      name: name.trim(),
      widthM,
    };

    onUpdateSubdivisionState((prev) => ({
      ...prev,
      specialRoads: [...(prev.specialRoads || []), newRoad],
      params: {
        ...prev.params,
        specialRoads: [...(prev.params.specialRoads || []), newRoad],
      },
    }));

    onNotify('Waddadii Waa La Daray', `Waxaa la abuuray waddada gaarka ah "${newRoad.name}" (${widthM}m ballac).`);
    setName('Waddada Gaarka ah');
  };

  const handleDeleteSpecialRoad = (id: string) => {
    onUpdateSubdivisionState((prev) => {
      const nextRoads = (prev.specialRoads || []).filter((r) => r.id !== id);
      return {
        ...prev,
        specialRoads: nextRoads,
        params: {
          ...prev.params,
          specialRoads: nextRoads,
        },
      };
    });
    onNotify('Waddada Waa La Tirtiray', 'Waddadii gaarka ahayd waa la tirtiray.');
  };

  return (
    <div
      className="fixed inset-0 z-[1200] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[500px] max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl bg-[#0B1220] border border-[#243449] shadow-2xl text-[#F8FAFC] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[#243449] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
              <Route className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight truncate">
                Maamulka Waddooyinka Gaarka ah (Special Roads)
              </h2>
              <span className="text-[11px] text-[#94A3B8]">
                Ku qoondee waddooyin ballac gaar ah safafka iyo kolonyada blocks-ka
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#16263D] text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Add Form */}
          <form onSubmit={handleAddSpecialRoad} className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 space-y-3">
            <div className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>Ku Dar Waddo Gaar ah Cusub</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">
                  Nooca Jidka (Axis)
                </label>
                <select
                  value={axis}
                  onChange={(e) => setAxis(e.target.value as 'column' | 'row')}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="column">Kolonno (U-Column / Inta u dhaxeysa Col)</option>
                  <option value="row">Saf (V-Row / Inta u dhaxeysa Safaska)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">
                  Lambarka Safka / Kolonka (Index)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={index}
                  onChange={(e) => setIndex(parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 text-xs font-bold text-white tabular-nums focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">
                  Magaca Waddada
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tusaale: Waddada Laamiga"
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold text-[#94A3B8] mb-1">
                  Ballaca Gaarka ah (Mitir - m)
                </label>
                <input
                  type="number"
                  min={2}
                  max={200}
                  value={widthM}
                  onChange={(e) => setWidthM(parseFloat(e.target.value) || 25)}
                  className="w-full rounded-lg bg-[#07101E] border border-[#243449] px-2.5 py-1.5 text-xs font-bold text-emerald-400 tabular-nums focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[36px] rounded-xl bg-[#22C55E] hover:bg-emerald-600 text-[#05130B] text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Keydi oo Ku Diiwaangeli Waddada</span>
            </button>
          </form>

          {/* List of Special Roads */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold text-[#94A3B8] uppercase tracking-wider">
              Waddada Gaarka ah ee Hadda Jirta ({specialRoads.length})
            </div>

            {specialRoads.length === 0 ? (
              <div className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-4 text-center text-xs text-[#94A3B8]">
                Weli lama darin waddooyin gaar ah. Isticmaal foomka sare si aad ugu darto waddo ballac gaar leh.
              </div>
            ) : (
              <div className="space-y-2">
                {specialRoads.map((sr) => (
                  <div
                    key={sr.id}
                    className="rounded-xl bg-[#0F1B2D] border border-[#243449] p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-[#F8FAFC] truncate">
                        {sr.name}
                      </div>
                      <div className="text-[10.5px] text-[#94A3B8] space-x-2">
                        <span>{sr.axis === 'column' ? 'U-Column' : 'V-Row'} #{sr.index}</span>
                        <span>·</span>
                        <strong className="text-emerald-400 font-bold">{sr.widthM} m Ballac</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSpecialRoad(sr.id)}
                      className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/60 transition-colors cursor-pointer shrink-0"
                      title="Tirtir waddada"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#243449] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-4 rounded-xl bg-[#0F1B2D] hover:bg-[#16263D] border border-[#243449] text-xs font-bold cursor-pointer"
          >
            Xidh
          </button>
        </div>
      </div>
    </div>
  );
};
