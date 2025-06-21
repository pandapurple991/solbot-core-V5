import React from 'react'
import { 
  Play, 
  Pause, 
  Square, 
  Settings, 
  Zap, 
  Target,
  Loader2
} from 'lucide-react'

interface TradingControlPanelProps {
  status: string
  strategy: string | null
  selectedStrategy: 'INCREASE_MAKERS_VOLUME' | 'INCREASE_VOLUME_ONLY' | 'LIQUIDITY_PHASE_TRADING'
  onStrategyChange: (strategy: 'INCREASE_MAKERS_VOLUME' | 'INCREASE_VOLUME_ONLY' | 'LIQUIDITY_PHASE_TRADING') => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  isLoading: boolean
  canStart: boolean
}

const TradingControlPanel: React.FC<TradingControlPanelProps> = ({
  status,
  strategy,
  selectedStrategy,
  onStrategyChange,
  onStart,
  onPause,
  onResume,
  onStop,
  isLoading,
  canStart
}) => {
  const strategies = [
    {
      value: 'INCREASE_MAKERS_VOLUME' as const,
      name: 'Makers + Volume',
      description: 'Increase unique traders and trading volume',
      icon: Target,
      duration: '3 minutes',
      color: 'border-primary bg-primary/10'
    },
    {
      value: 'INCREASE_VOLUME_ONLY' as const,
      name: 'Volume Only',
      description: 'Focus on maximizing trading volume',
      icon: Zap,
      duration: '20 minutes',
      color: 'border-secondary bg-secondary/10'
    },
    {
      value: 'LIQUIDITY_PHASE_TRADING' as const,
      name: 'Liquidity Phase Trading',
      description: 'Timed buy phases followed by sell phases',
      icon: Settings,
      duration: 'Continuous cycles',
      color: 'border-accent bg-accent/10'
    }
  ]

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            Trading Controls
          </h2>
        </div>
        
        {strategy && (
          <div className="text-sm text-muted-foreground">
            Active: {strategy.replace('_', ' ').toLowerCase()}
          </div>
        )}
      </div>

      {/* Strategy Selection */}
      {status === 'idle' && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">
            Select Trading Strategy
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategies.map((strat) => {
              const Icon = strat.icon
              const isSelected = selectedStrategy === strat.value
              
              return (
                <button
                  key={strat.value}
                  onClick={() => onStrategyChange(strat.value)}
                  className={`p-4 border-2 rounded-lg text-left transition-all duration-200 ${
                    isSelected
                      ? strat.color
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <Icon className={`w-6 h-6 mt-1 ${
                      isSelected ? 'text-current' : 'text-muted-foreground'
                    }`} />
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground">
                        {strat.name}
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {strat.description}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                        <span>Duration: {strat.duration}</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center space-x-3">
        {status === 'idle' && (
          <button
            onClick={onStart}
            disabled={!canStart || isLoading}
            className="btn btn-secondary flex items-center"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Play className="w-5 h-5 mr-2" />
            )}
            Start Trading
          </button>
        )}

        {status === 'running' && (
          <>
            <button
              onClick={onPause}
              disabled={isLoading}
              className="btn flex items-center bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Pause className="w-4 h-4 mr-2" />
              )}
              Pause
            </button>
            <button
              onClick={onStop}
              disabled={isLoading}
              className="btn flex items-center bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-2" />
              )}
              Stop
            </button>
          </>
        )}

        {status === 'paused' && (
          <>
            <button
              onClick={onResume}
              disabled={isLoading}
              className="btn btn-secondary flex items-center"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Resume
            </button>
            <button
              onClick={onStop}
              disabled={isLoading}
              className="btn flex items-center bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-2" />
              )}
              Stop
            </button>
          </>
        )}

        {(status === 'stopped' || status === 'error') && (
          <button
            onClick={onStart}
            disabled={!canStart || isLoading}
            className="btn btn-secondary flex items-center"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Play className="w-5 h-5 mr-2" />
            )}
            Restart Trading
          </button>
        )}
      </div>

      {/* Prerequisites Warning */}
      {!canStart && status === 'idle' && (
        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-sm text-yellow-500">
            Complete session setup with admin wallet and trading wallets before starting.
          </p>
        </div>
      )}
    </div>
  )
}

export default TradingControlPanel