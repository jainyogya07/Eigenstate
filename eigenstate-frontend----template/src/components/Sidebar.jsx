import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  BrainCircuit,
  Settings,
  History,
  MessageSquare,
  CreditCard,
} from 'lucide-react';

const Sidebar = () => {
  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Why Explorer', icon: Search, path: '/explorer' },
    { name: 'Repo Analyser', icon: MessageSquare, path: '/analyser' },
    { name: 'Git Intelligence', icon: BrainCircuit, path: '/git' },
    { name: 'History', icon: History, path: '/history' },
    { name: 'Pricing', icon: CreditCard, path: '/pricing' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <aside className="z-20 flex h-screen w-64 shrink-0 flex-col border-r border-github-border bg-github-bg-secondary md:w-72">
      <div className="space-y-6 border-b border-github-border px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-github-blue/15 text-github-blue">
            <BrainCircuit size={22} strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">EigenState</p>
            <p className="text-xs text-github-text-secondary">Architectural intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-github-green" />
          <span className="text-xs font-medium text-github-text-secondary">Engine operational</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-6 custom-scrollbar">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'bg-github-bg-tertiary text-white'
                        : 'text-github-text-secondary hover:bg-github-bg-tertiary/60 hover:text-github-text-primary'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={18}
                        strokeWidth={1.75}
                        className={isActive ? 'text-github-blue' : 'opacity-80'}
                      />
                      <span>{item.name}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-github-border p-4">
        <div className="es-card-interactive flex cursor-default items-center gap-3 rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-github-blue text-xs font-semibold text-white">
            TP
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-github-text-primary">Team Pralay</p>
            <p className="truncate text-xs text-github-text-secondary">Workspace</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
