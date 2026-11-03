import React from 'react';
import { Home, Calculator, TableProperties, Download } from 'lucide-react';
import { PrimaryDestination } from './MobileTopAppBar';

interface MobileBottomNavProps {
  activeDestination: PrimaryDestination;
  onSelectDestination: (destination: PrimaryDestination) => void;
}

const NAV_TABS: {
  id: PrimaryDestination;
  label: string;
  icon: typeof Home;
}[] = [
  {
    id: 'dashboard',
    label: 'Khariidad',
    icon: Home,
  },
  {
    id: 'calculate',
    label: 'Xisaabi',
    icon: Calculator,
  },
  {
    id: 'list_data',
    label: 'Xogta',
    icon: TableProperties,
  },
  {
    id: 'export',
    label: 'Soo saar',
    icon: Download,
  },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeDestination,
  onSelectDestination,
}) => {
  return (
    <nav
      aria-label="Hagidda Hoose"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0a1220]/95 backdrop-blur-md border-t border-[#223250] pb-safe no-print"
    >
      <div className="grid grid-cols-4 items-center h-16 px-1.5">
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeDestination === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectDestination(tab.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer ${
                isActive ? 'text-[#22c55e]' : 'text-[#a9b8d0] hover:text-[#e8eef7]'
              }`}
            >
              <div
                className={`px-3 py-0.5 rounded-xl transition-colors ${
                  isActive ? 'bg-[#22c55e]/15' : 'bg-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
              </div>
              <span className="text-[11px] font-bold tracking-tight leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
