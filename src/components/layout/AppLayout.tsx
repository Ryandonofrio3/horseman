import { ReactNode } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  sidebar: ReactNode
  tabBar?: ReactNode
  main: ReactNode
}

export function AppLayout({ sidebar, tabBar, main }: AppLayoutProps) {
  const sidebarCollapsed = useStore((state) => state.sidebarCollapsed)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar - fixed width with smooth collapse transition */}
      <aside
        className={cn(
          'h-full shrink-0 border-r border-border transition-all duration-200 ease-in-out',
          sidebarCollapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-64'
        )}
      >
        {/* Inner container to maintain full sidebar content during collapse */}
        <div className="w-64 h-full overflow-hidden">
          {sidebar}
        </div>
      </aside>

      {/* Main Panel - takes remaining space */}
      <main className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
        {/* Tab bar - fixed height */}
        {tabBar}
        {/* Main content - scrollable, takes remaining space */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {main}
        </div>
      </main>
    </div>
  )
}
