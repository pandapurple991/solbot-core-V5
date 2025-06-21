import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { 
  Play, 
  Pause, 
  Square, 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Users,
  DollarSign,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Settings,
  RefreshCw,
  Zap,
  Target,
  Timer,
  RotateCcw,
  ArrowDown,
  Database,
  Calculator,
  Trash2
} from 'lucide-react'
import { RootState } from '../store/store'
import { backendService } from '../services/backendService'
import { monitoringService } from '../services/monitoringService'
import { 
  setStatus, 
  setStrategy, 
  startTrading, 
  pauseTrading, 
  resumeTrading, 
  stopTrading,
  startLap,
  completeLap,
  updateElapsedTime
} from '../store/slices/tradingSlice'
import TradingControlPanel from '../components/trading/TradingControlPanel'
import TradingStatusGrid from '../components/trading/TradingStatusGrid'
import WalletTradingGrid from '../components/trading/WalletTradingGrid'
import TradingLapMonitor from '../components/trading/TradingLapMonitor'
import TransactionMonitor from '../components/trading/TransactionMonitor'
import TradingMetrics from '../components/trading/TradingMetrics'
import DynamicLapManager from '../components/trading/DynamicLapManager'
import CollectionMonitor from '../components/trading/CollectionMonitor'
import WalletRegenerationTracker from '../components/trading/WalletRegenerationTracker'
import BalanceTracker from '../components/trading/BalanceTracker'
import SwapCalculator from '../components/trading/SwapCalculator'
import PoolInfoMonitor from '../components/trading/PoolInfoMonitor'
import CleanupOperations from '../components/trading/CleanupOperations'
import toast from 'react-hot-toast'

const Trading: React.FC = () => {
  const dispatch = useDispatch()
  const { currentSession } = useSelector((state: RootState) => state.session)
  const { adminWallet, tradingWallets } = useSelector((state: RootState) => state.wallet)
  const { 
    status, 
    strategy, 
    currentLap, 
    laps, 
    globalTradingFlag, 
    elapsedTime, 
    timeLeft, 
    duration 
  } = useSelector((state: RootState) => state.trading)

  const [selectedStrategy, setSelectedStrategy] = useState<'INCREASE_MAKERS_VOLUME' | 'INCREASE_VOLUME_ONLY' | 'LIQUIDITY_PHASE_TRADING'>('INCREASE_MAKERS_VOLUME')
  const [isLoading, setIsLoading] = useState(false)
  const [walletStatuses, setWalletStatuses] = useState<Map<string, any>>(new Map())
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'control' | 'laps' | 'collection' | 'regeneration' | 'transactions' | 'analytics' | 'cleanup'>('control')
  
  // Lap management state
  const [isCollectionActive, setIsCollectionActive] = useState(false)
  const [isRegenerationActive, setIsRegenerationActive] = useState(false)
  const [lapResults, setLapResults] = useState<any[]>([])
  const [collectionData, setCollectionData] = useState<any[]>([])
  const [swapCalculations, setSwapCalculations] = useState<any[]>([])
  const [poolInfo, setPoolInfo] = useState<any>(null)

  // Real-time updates
  useEffect(() => {
    let interval: NodeJS.Timeout
    
    if (status === 'running') {
      interval = setInterval(() => {
        // Update elapsed time
        if (currentLap) {
          const elapsed = Date.now() - currentLap.startTime
          dispatch(updateElapsedTime(elapsed))
        }
        
        // Refresh wallet statuses
        refreshWalletStatuses()
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [status, currentLap, dispatch])

  const refreshWalletStatuses = async () => {
    if (!tradingWallets.length) return
    
    try {
      const updatedWallets = await backendService.getWalletBalances(tradingWallets)
      const statusMap = new Map()
      
      updatedWallets.forEach(wallet => {
        statusMap.set(wallet.publicKey, {
          ...wallet,
          isTrading: globalTradingFlag && wallet.isActive,
          lastUpdate: Date.now()
        })
      })
      
      setWalletStatuses(statusMap)
    } catch (error) {
      console.error('Failed to refresh wallet statuses:', error)
    }
  }

  const handleStartTrading = async () => {
    if (!currentSession || !adminWallet || tradingWallets.length === 0) {
      toast.error('Complete session setup required before starting trading')
      return
    }

    setIsLoading(true)
    try {
      // Start trading via backend
      await backendService.startTrading(selectedStrategy, currentSession)
      
      // Update local state
      const tradeDuration = selectedStrategy === 'INCREASE_MAKERS_VOLUME' ? 181000 : 
                         selectedStrategy === 'INCREASE_VOLUME_ONLY' ? 1200000000 : 
                         0 // Continuous for LIQUIDITY_PHASE_TRADING
      dispatch(startTrading({ strategy: selectedStrategy, duration: tradeDuration }))
      dispatch(startLap(1))
      
      toast.success(`Trading started with ${selectedStrategy.replace('_', ' ').toLowerCase()}`)
    } catch (error) {
      toast.error(`Failed to start trading: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePauseTrading = async () => {
    setIsLoading(true)
    try {
      await backendService.pauseTrading()
      dispatch(pauseTrading())
      toast.success('Trading paused')
    } catch (error) {
      toast.error(`Failed to pause trading: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResumeTrading = async () => {
    setIsLoading(true)
    try {
      await backendService.resumeTrading()
      dispatch(resumeTrading())
      toast.success('Trading resumed')
    } catch (error) {
      toast.error(`Failed to resume trading: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopTrading = async () => {
    setIsLoading(true)
    try {
      await backendService.stopTrading()
      dispatch(stopTrading())
      
      if (currentLap) {
        dispatch(completeLap({ solCollected: 0, tokensCollected: 0 }))
      }
      
      toast.success('Trading stopped')
    } catch (error) {
      toast.error(`Failed to stop trading: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLapComplete = (result: any) => {
    setLapResults(prev => [...prev, result])
    
    if (result.status === 'completed') {
      // Start collection process
      setIsCollectionActive(true)
      setActiveTab('collection')
    }
  }

  const handleCollectionUpdate = (data: any[]) => {
    setCollectionData(data)
    
    // Check if collection is complete
    const allCompleted = data.every(wallet => wallet.status === 'completed' || wallet.status === 'failed')
    
    if (allCompleted) {
      setIsCollectionActive(false)
      
      // Start regeneration process
      const totalSol = data.reduce((sum, wallet) => sum + wallet.solCollected, 0)
      const totalTokens = data.reduce((sum, wallet) => sum + wallet.tokensCollected, 0)
      
      if (totalSol > 0 || totalTokens > 0) {
        setIsRegenerationActive(true)
        setActiveTab('regeneration')
      }
    }
  }

  const handleRegenerationComplete = (result: any) => {
    setIsRegenerationActive(false)
    
    if (result.success) {
      toast.success('Wallet regeneration completed successfully!')
      setActiveTab('control')
    } else {
      toast.error(`Regeneration failed: ${result.error}`)
    }
  }

  const handleTransactionUpdate = (transactions: any[]) => {
    setRecentTransactions(transactions)
  }

  // Fetch transactions from backend monitoring API
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const transactions = await monitoringService.getTransactions(50)
        setRecentTransactions(transactions)
      } catch (error) {
        console.error('Failed to fetch transactions:', error)
        // Don't show error to user, just log it
      }
    }

    fetchTransactions()
    
    // Set up polling for real-time updates when trading is active
    let interval: NodeJS.Timeout | null = null
    if (status === 'running') {
      interval = setInterval(fetchTransactions, 5000) // Poll every 5 seconds
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [status])

  const handleSwapCalculationUpdate = (calculations: any[]) => {
    setSwapCalculations(calculations)
  }

  const handlePoolUpdate = (poolData: any) => {
    setPoolInfo(poolData)
  }

  // Calculate metrics
  const activeWallets = Array.from(walletStatuses.values()).filter(w => w.isTrading).length
  const totalTransactions = recentTransactions.length
  const successfulTransactions = recentTransactions.filter(tx => tx.status === 'success').length
  const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0

  const tabs = [
    { id: 'control', name: 'Trading Control', icon: Settings },
    { id: 'laps', name: 'Lap Management', icon: Target },
    { id: 'collection', name: 'Collection Monitor', icon: ArrowDown },
    { id: 'regeneration', name: 'Wallet Regeneration', icon: RotateCcw },
    { id: 'transactions', name: 'Transactions', icon: Activity },
    { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    { id: 'cleanup', name: 'Cleanup', icon: Trash2 }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Advanced Trading Control Center
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Dynamic multi-lap trading with real-time monitoring and analytics
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={refreshWalletStatuses}
            className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
            status === 'running' ? 'bg-green-100 dark:bg-green-900/20' :
            status === 'paused' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
            'bg-gray-100 dark:bg-gray-700'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              status === 'running' ? 'bg-green-500 animate-pulse' :
              status === 'paused' ? 'bg-yellow-500' :
              'bg-gray-400'
            }`}></div>
            <span className={`font-medium capitalize ${
              status === 'running' ? 'text-green-700 dark:text-green-300' :
              status === 'paused' ? 'text-yellow-700 dark:text-yellow-300' :
              'text-gray-700 dark:text-gray-300'
            }`}>
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* Session Check */}
      {!currentSession && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h3 className="font-medium text-yellow-800 dark:text-yellow-300">
                No Active Session
              </h3>
              <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                Please create or load a trading session before starting trading operations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trading Metrics */}
      <TradingMetrics
        activeWallets={activeWallets}
        totalWallets={tradingWallets.length}
        successRate={successRate}
        totalTransactions={totalTransactions}
        currentLap={currentLap}
        elapsedTime={elapsedTime}
        timeLeft={timeLeft}
      />

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          <nav className="flex space-x-6 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-solana-500 text-solana-600 dark:text-solana-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                  {tab.id === 'collection' && isCollectionActive && (
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  )}
                  {tab.id === 'regeneration' && isRegenerationActive && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  )}
                  {tab.id === 'transactions' && status === 'running' && (
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'control' && (
            <div className="space-y-6">
              {/* Trading Control Panel */}
              <TradingControlPanel
                status={status}
                strategy={strategy}
                selectedStrategy={selectedStrategy}
                onStrategyChange={setSelectedStrategy}
                onStart={handleStartTrading}
                onPause={handlePauseTrading}
                onResume={handleResumeTrading}
                onStop={handleStopTrading}
                isLoading={isLoading}
                canStart={!!(currentSession && adminWallet && tradingWallets.length > 0)}
              />

              {/* Trading Status Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lap Monitor */}
                <TradingLapMonitor
                  currentLap={currentLap}
                  laps={laps}
                  elapsedTime={elapsedTime}
                  timeLeft={timeLeft}
                  duration={duration}
                  status={status}
                />

                {/* Transaction Monitor */}
                <TransactionMonitor
                  transactions={recentTransactions}
                  onTransactionUpdate={handleTransactionUpdate}
                  tokenSymbol={currentSession?.tokenName}
                  isActive={status === 'running'}
                />
              </div>

              {/* Wallet Trading Grid */}
              <WalletTradingGrid
                wallets={tradingWallets}
                walletStatuses={walletStatuses}
                globalTradingFlag={globalTradingFlag}
                tokenSymbol={currentSession?.tokenName}
              />
            </div>
          )}

          {activeTab === 'laps' && (
            <DynamicLapManager
              isActive={status === 'running'}
              onLapComplete={handleLapComplete}
            />
          )}

          {activeTab === 'collection' && (
            <CollectionMonitor
              wallets={tradingWallets}
              tokenSymbol={currentSession?.tokenName || 'Tokens'}
              isActive={isCollectionActive}
              onCollectionUpdate={handleCollectionUpdate}
            />
          )}

          {activeTab === 'regeneration' && (
            <WalletRegenerationTracker
              isActive={isRegenerationActive}
              walletCount={tradingWallets.length}
              solAmount={collectionData.reduce((sum, wallet) => sum + wallet.solCollected, 0)}
              tokenAmount={collectionData.reduce((sum, wallet) => sum + wallet.tokensCollected, 0)}
              tokenSymbol={currentSession?.tokenName || 'Tokens'}
              onRegenerationComplete={handleRegenerationComplete}
            />
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-6">
              <TransactionMonitor
                transactions={recentTransactions}
                onTransactionUpdate={handleTransactionUpdate}
                tokenSymbol={currentSession?.tokenName}
                isActive={status === 'running'}
              />
              
              <BalanceTracker
                wallets={tradingWallets}
                tokenSymbol={currentSession?.tokenName || 'Tokens'}
                adminWallet={adminWallet}
                autoRefresh={status === 'running'}
              />
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <PoolInfoMonitor
                tokenAddress={currentSession?.tokenAddress || ''}
                tokenSymbol={currentSession?.tokenName || 'Tokens'}
                onPoolUpdate={handlePoolUpdate}
                autoRefresh={status === 'running'}
              />
              
              <SwapCalculator
                tokenSymbol={currentSession?.tokenName || 'Tokens'}
                tokenAddress={currentSession?.tokenAddress || ''}
                onCalculationUpdate={handleSwapCalculationUpdate}
                isActive={status === 'running'}
              />
            </div>
          )}

          {activeTab === 'cleanup' && (
            <CleanupOperations />
          )}
        </div>
      </div>
    </div>
  )
}

export default Trading