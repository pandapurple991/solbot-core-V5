import React, { useState, useEffect } from 'react'
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Percent, 
  DollarSign,
  Coins,
  Target,
  Shuffle,
  BarChart3,
  AlertTriangle,
  Info,
  RefreshCw
} from 'lucide-react'

interface SwapCalculation {
  id: string
  walletNumber: number
  type: 'buy' | 'sell'
  inputAmount: number
  outputAmount: number
  slippage: number
  priceImpact: number
  minimumReceived: number
  exchangeRate: number
  timestamp: number
  randomizationFactor: number
}

interface PoolInfo {
  tokenPrice: number
  solPrice: number
  liquidity: number
  volume24h: number
  lastUpdated: number
}

interface SwapCalculatorProps {
  tokenSymbol: string
  tokenAddress?: string
  onCalculationUpdate?: (calculations: SwapCalculation[]) => void
  isActive?: boolean
}

const SwapCalculator: React.FC<SwapCalculatorProps> = ({
  tokenSymbol,
  tokenAddress,
  onCalculationUpdate,
  isActive = false
}) => {
  const [calculations, setCalculations] = useState<SwapCalculation[]>([])
  const [poolInfo, setPoolInfo] = useState<PoolInfo>({
    tokenPrice: 0.001234,
    solPrice: 180.45,
    liquidity: 1250000,
    volume24h: 850000,
    lastUpdated: Date.now()
  })
  const [manualInput, setManualInput] = useState({
    amount: 0.01,
    type: 'buy' as 'buy' | 'sell',
    slippage: 5
  })
  const [showCalculator, setShowCalculator] = useState(false)

  // Mock swap calculations
  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance to generate a calculation
        const newCalculation = generateSwapCalculation()
        setCalculations(prev => [newCalculation, ...prev.slice(0, 49)]) // Keep last 50
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isActive, poolInfo])

  // Update pool info periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPoolInfo(prev => ({
        ...prev,
        tokenPrice: prev.tokenPrice * (1 + (Math.random() - 0.5) * 0.02), // ±1% change
        solPrice: prev.solPrice * (1 + (Math.random() - 0.5) * 0.01), // ±0.5% change
        liquidity: prev.liquidity * (1 + (Math.random() - 0.5) * 0.05), // ±2.5% change
        volume24h: prev.volume24h * (1 + (Math.random() - 0.5) * 0.1), // ±5% change
        lastUpdated: Date.now()
      }))
    }, 10000) // Update every 10 seconds

    return () => clearInterval(interval)
  }, [])

  const generateSwapCalculation = (): SwapCalculation => {
    const type = Math.random() > 0.5 ? 'buy' : 'sell'
    const baseAmount = Math.random() * 0.1 + 0.001
    const randomizationFactor = 0.8 + Math.random() * 0.4 // 80% to 120%
    const inputAmount = baseAmount * randomizationFactor
    
    const slippage = 0.5 + Math.random() * 4.5 // 0.5% to 5%
    const priceImpact = Math.random() * 2 // 0% to 2%
    
    let outputAmount: number
    let exchangeRate: number
    
    if (type === 'buy') {
      // Buying tokens with SOL
      exchangeRate = poolInfo.tokenPrice * poolInfo.solPrice
      outputAmount = (inputAmount / poolInfo.tokenPrice) * (1 - slippage / 100)
    } else {
      // Selling tokens for SOL
      exchangeRate = 1 / (poolInfo.tokenPrice * poolInfo.solPrice)
      outputAmount = (inputAmount * poolInfo.tokenPrice) * (1 - slippage / 100)
    }
    
    const minimumReceived = outputAmount * (1 - slippage / 100)

    return {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      walletNumber: Math.floor(Math.random() * 10) + 1,
      type,
      inputAmount,
      outputAmount,
      slippage,
      priceImpact,
      minimumReceived,
      exchangeRate,
      timestamp: Date.now(),
      randomizationFactor
    }
  }

  const calculateManualSwap = () => {
    const calculation = {
      ...generateSwapCalculation(),
      inputAmount: manualInput.amount,
      type: manualInput.type,
      slippage: manualInput.slippage,
      walletNumber: 0 // Manual calculation
    }
    
    // Recalculate based on manual inputs
    if (calculation.type === 'buy') {
      calculation.outputAmount = (calculation.inputAmount / poolInfo.tokenPrice) * (1 - calculation.slippage / 100)
    } else {
      calculation.outputAmount = (calculation.inputAmount * poolInfo.tokenPrice) * (1 - calculation.slippage / 100)
    }
    calculation.minimumReceived = calculation.outputAmount * (1 - calculation.slippage / 100)
    
    setCalculations(prev => [calculation, ...prev])
  }

  // Update parent component
  useEffect(() => {
    if (onCalculationUpdate) {
      onCalculationUpdate(calculations)
    }
  }, [calculations, onCalculationUpdate])

  const formatAmount = (amount: number, decimals: number = 6) => {
    return amount.toFixed(decimals)
  }

  const formatPrice = (price: number) => {
    return price.toFixed(6)
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getRandomizationColor = (factor: number) => {
    if (factor > 1.1) return 'text-green-500'
    if (factor < 0.9) return 'text-red-500'
    return 'text-gray-500'
  }

  const averageSlippage = calculations.length > 0 
    ? calculations.reduce((sum, calc) => sum + calc.slippage, 0) / calculations.length 
    : 0

  const averagePriceImpact = calculations.length > 0 
    ? calculations.reduce((sum, calc) => sum + calc.priceImpact, 0) / calculations.length 
    : 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Calculator className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Swap Calculator & Analytics
          </h3>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className="flex items-center px-3 py-1 text-sm bg-purple-100 dark:bg-purple-900/20 hover:bg-purple-200 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg transition-colors"
          >
            <Calculator className="w-4 h-4 mr-1" />
            {showCalculator ? 'Hide' : 'Show'} Calculator
          </button>
        </div>
      </div>

      {/* Pool Information */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Coins className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{tokenSymbol} Price</span>
          </div>
          <div className="text-xl font-bold text-blue-900 dark:text-blue-100">
            ${formatPrice(poolInfo.tokenPrice)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Updated: {formatTime(poolInfo.lastUpdated)}
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">SOL Price</span>
          </div>
          <div className="text-xl font-bold text-green-900 dark:text-green-100">
            ${formatPrice(poolInfo.solPrice)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Live price
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Liquidity</span>
          </div>
          <div className="text-xl font-bold text-purple-900 dark:text-purple-100">
            ${(poolInfo.liquidity / 1000).toFixed(1)}K
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Pool depth
          </div>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Target className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">24h Volume</span>
          </div>
          <div className="text-xl font-bold text-orange-900 dark:text-orange-100">
            ${(poolInfo.volume24h / 1000).toFixed(1)}K
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Trading volume
          </div>
        </div>
      </div>

      {/* Manual Calculator */}
      {showCalculator && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">
            Manual Swap Calculator
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Swap Type
              </label>
              <div className="flex">
                <button
                  onClick={() => setManualInput(prev => ({ ...prev, type: 'buy' }))}
                  className={`flex-1 flex items-center justify-center px-4 py-2 text-sm font-medium rounded-l-lg ${
                    manualInput.type === 'buy'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Buy
                </button>
                <button
                  onClick={() => setManualInput(prev => ({ ...prev, type: 'sell' }))}
                  className={`flex-1 flex items-center justify-center px-4 py-2 text-sm font-medium rounded-r-lg ${
                    manualInput.type === 'sell'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  Sell
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {manualInput.type === 'buy' ? 'SOL Amount' : `${tokenSymbol} Amount`}
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={manualInput.amount}
                onChange={(e) => setManualInput(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Slippage Tolerance (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={manualInput.slippage}
                onChange={(e) => setManualInput(prev => ({ ...prev, slippage: parseFloat(e.target.value) || 0 }))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <button
            onClick={calculateManualSwap}
            className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
          >
            <Calculator className="w-4 h-4 mr-2" />
            Calculate Swap
          </button>
        </div>
      )}

      {/* Swap Calculations */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {calculations.length > 0 ? (
          calculations.map((calc) => (
            <div
              key={calc.id}
              className={`p-4 border rounded-lg transition-all duration-200 hover:shadow-md ${
                calc.type === 'buy'
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                  : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  {calc.type === 'buy' ? (
                    <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {calc.type === 'buy' ? 'Buy' : 'Sell'} {calc.walletNumber === 0 ? '(Manual)' : `- Wallet #${calc.walletNumber}`}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(calc.timestamp)}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Shuffle className="w-4 h-4 text-gray-400" />
                  <span className={`text-xs font-medium ${getRandomizationColor(calc.randomizationFactor)}`}>
                    {(calc.randomizationFactor * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {calc.type === 'buy' ? 'Input (SOL)' : `Input (${tokenSymbol})`}
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatAmount(calc.inputAmount, calc.type === 'buy' ? 6 : 2)}
                  </div>
                </div>
                
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {calc.type === 'buy' ? `Output (${tokenSymbol})` : 'Output (SOL)'}
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatAmount(calc.outputAmount, calc.type === 'buy' ? 2 : 6)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div>
                  <span className="flex items-center">
                    <Percent className="w-3 h-3 mr-1" />
                    Slippage: {calc.slippage.toFixed(2)}%
                  </span>
                </div>
                <div>
                  <span className="flex items-center">
                    <Target className="w-3 h-3 mr-1" />
                    Impact: {calc.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div>
                  <span className="flex items-center">
                    <Info className="w-3 h-3 mr-1" />
                    Min: {formatAmount(calc.minimumReceived, calc.type === 'buy' ? 2 : 6)}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <Calculator className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Swap Calculations
            </h4>
            <p className="text-gray-600 dark:text-gray-400">
              Swap calculations will appear here when trading begins
            </p>
          </div>
        )}
      </div>

      {/* Analytics Summary */}
      {calculations.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Swap Analytics
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {calculations.filter(c => c.type === 'buy').length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Buy Calculations
              </div>
            </div>
            
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {calculations.filter(c => c.type === 'sell').length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Sell Calculations
              </div>
            </div>
            
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {averageSlippage.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Avg Slippage
              </div>
            </div>
            
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {averagePriceImpact.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Avg Price Impact
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SwapCalculator