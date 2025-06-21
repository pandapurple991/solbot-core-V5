import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../../store/store'
import { 
  DollarSign, 
  Coins, 
  Users, 
  TrendingUp, 
  CheckCircle, 
  AlertCircle,
  Clock,
  RefreshCw,
  ArrowDown,
  Loader2
} from 'lucide-react'

interface CollectionData {
  walletNumber: number
  publicKey: string
  solBalance: number
  tokenBalance: number
  solCollected: number
  tokensCollected: number
  status: 'pending' | 'collecting' | 'completed' | 'failed'
  error?: string
}

interface CollectionMonitorProps {
  wallets: any[]
  tokenSymbol: string
  isActive: boolean
  onCollectionUpdate: (data: CollectionData[]) => void
}

const CollectionMonitor: React.FC<CollectionMonitorProps> = ({
  wallets,
  tokenSymbol,
  isActive,
  onCollectionUpdate
}) => {
  const currentSession = useSelector((state: RootState) => state.session.currentSession)
  const [collectionData, setCollectionData] = useState<CollectionData[]>([])
  const [totalProgress, setTotalProgress] = useState(0)
  const [isCollecting, setIsCollecting] = useState(false)

  useEffect(() => {
    if (isActive && wallets.length > 0) {
      initializeCollection()
    }
  }, [isActive, wallets])

  const initializeCollection = () => {
    const initialData: CollectionData[] = wallets.map(wallet => ({
      walletNumber: wallet.number,
      publicKey: wallet.publicKey,
      solBalance: wallet.solBalance || 0,
      tokenBalance: wallet.tokenBalance || 0,
      solCollected: 0,
      tokensCollected: 0,
      status: 'pending'
    }))

    setCollectionData(initialData)
    setIsCollecting(true)
    startCollection(initialData)
  }

  const startCollection = async (data: CollectionData[]) => {
    const updatedData = [...data]

    for (let i = 0; i < updatedData.length; i++) {
      const wallet = updatedData[i]
      
      // Update status to collecting
      wallet.status = 'collecting'
      setCollectionData([...updatedData])

      try {
        // Real API call to collect from wallet
        const response = await fetch('/api/cleanup/close-accounts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: wallet.publicKey,
            tokenAddress: currentSession?.tokenAddress
          })
        })

        if (response.ok) {
          const data = await response.json()
          wallet.solCollected = data.solCollected || 0
          wallet.tokensCollected = data.tokensCollected || 0
          wallet.status = 'completed'
        } else {
          throw new Error('Failed to collect from wallet')
        }

      } catch (error) {
        wallet.status = 'failed'
        wallet.error = error instanceof Error ? error.message : String(error)
        wallet.solCollected = 0
        wallet.tokensCollected = 0
      }

      // Update progress
      const progress = ((i + 1) / updatedData.length) * 100
      setTotalProgress(progress)
      setCollectionData([...updatedData])

      // Small delay between wallets
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    setIsCollecting(false)
    onCollectionUpdate(updatedData)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />
      case 'collecting':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-gray-500'
      case 'collecting': return 'text-blue-500'
      case 'completed': return 'text-green-500'
      case 'failed': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const totalSolCollected = collectionData.reduce((sum, wallet) => sum + wallet.solCollected, 0)
  const totalTokensCollected = collectionData.reduce((sum, wallet) => sum + wallet.tokensCollected, 0)
  const completedWallets = collectionData.filter(w => w.status === 'completed').length
  const failedWallets = collectionData.filter(w => w.status === 'failed').length

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <ArrowDown className="w-5 h-5 text-green-600 dark:text-green-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Collection Monitor
          </h3>
        </div>
        
        {isCollecting && (
          <div className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Collecting...</span>
          </div>
        )}
      </div>

      {/* Progress Overview */}
      {collectionData.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Collection Progress
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {totalProgress.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-green-600 dark:bg-green-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {collectionData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                SOL
              </span>
            </div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {totalSolCollected.toFixed(6)}
            </div>
          </div>

          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <Coins className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {tokenSymbol}
              </span>
            </div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {totalTokensCollected.toFixed(2)}
            </div>
          </div>

          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Success
              </span>
            </div>
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {completedWallets}
            </div>
          </div>

          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                Failed
              </span>
            </div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400">
              {failedWallets}
            </div>
          </div>
        </div>
      )}

      {/* Wallet Collection Details */}
      {collectionData.length > 0 ? (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {collectionData.map((wallet) => (
            <div
              key={wallet.publicKey}
              className={`p-3 border rounded-lg transition-colors ${
                wallet.status === 'completed'
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                  : wallet.status === 'failed'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                  : wallet.status === 'collecting'
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(wallet.status)}
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Wallet #{wallet.walletNumber}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-8)}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="text-center">
                      <div className="font-medium text-green-600 dark:text-green-400">
                        {wallet.solCollected.toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        SOL
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-blue-600 dark:text-blue-400">
                        {wallet.tokensCollected.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {tokenSymbol}
                      </div>
                    </div>
                  </div>
                  
                  <div className={`text-xs font-medium capitalize ${getStatusColor(wallet.status)}`}>
                    {wallet.status}
                  </div>
                </div>
              </div>

              {wallet.error && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                  {wallet.error}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <ArrowDown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Collection Activity
          </h4>
          <p className="text-gray-600 dark:text-gray-400">
            Collection monitoring will start when a trading lap completes
          </p>
        </div>
      )}
    </div>
  )
}

export default CollectionMonitor