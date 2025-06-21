import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Sidebar from './Sidebar'
import Header from './Header'
import { RootState } from '../store/store'
import { initializeTheme } from '../store/slices/themeSlice'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const dispatch = useDispatch()
  const { isDark } = useSelector((state: RootState) => state.theme)

  useEffect(() => {
    dispatch(initializeTheme(undefined))
  }, [dispatch])

  return (
    <div className={`min-h-screen bg-background transition-colors duration-300 ${isDark ? 'dark' : ''}`}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default Layout