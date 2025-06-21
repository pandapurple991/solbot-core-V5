import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type TradingStrategy = 'INCREASE_MAKERS_VOLUME' | 'INCREASE_VOLUME_ONLY' | 'LIQUIDITY_PHASE_TRADING'
export type TradingStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error'

interface TradingLap {
  lapNumber: number
  startTime: number
  endTime?: number
  totalSolCollected: number
  totalTokensCollected: number
  status: 'running' | 'completed' | 'failed'
  transactionCount?: number
  successRate?: number
  poolInfo?: any
}

interface TradingState {
  status: TradingStatus
  strategy: TradingStrategy | null
  currentLap: TradingLap | null
  laps: TradingLap[]
  globalTradingFlag: boolean
  startTime: number | null
  elapsedTime: number
  timeLeft: number
  duration: number
  pauseStartTimes: number[]
  resumeTimes: number[]
  error: string | null
  transactionStats: {
    totalTransactions: number
    successfulTransactions: number
    failedTransactions: number
    totalVolume: number
    totalFees: number
    averageSlippage: number
  }
  poolInfo: any | null
}

const initialState: TradingState = {
  status: 'idle',
  strategy: null,
  currentLap: null,
  laps: [],
  globalTradingFlag: false,
  startTime: null,
  elapsedTime: 0,
  timeLeft: 0,
  duration: 0,
  pauseStartTimes: [],
  resumeTimes: [],
  error: null,
  transactionStats: {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    totalVolume: 0,
    totalFees: 0,
    averageSlippage: 0
  },
  poolInfo: null
}

const tradingSlice = createSlice({
  name: 'trading',
  initialState,
  reducers: {
    setStatus: (state, action: PayloadAction<TradingStatus>) => {
      state.status = action.payload
      if (action.payload === 'idle') {
        state.error = null
      }
    },
    setStrategy: (state, action: PayloadAction<TradingStrategy>) => {
      state.strategy = action.payload
    },
    setGlobalTradingFlag: (state, action: PayloadAction<boolean>) => {
      state.globalTradingFlag = action.payload
    },
    startTrading: (state, action: PayloadAction<{ strategy: TradingStrategy; duration: number }>) => {
      state.status = 'running'
      state.strategy = action.payload.strategy
      state.duration = action.payload.duration
      state.startTime = Date.now()
      state.globalTradingFlag = true
      state.error = null
    },
    pauseTrading: (state) => {
      state.status = 'paused'
      state.globalTradingFlag = false
      state.pauseStartTimes.push(Date.now())
    },
    resumeTrading: (state) => {
      state.status = 'running'
      state.globalTradingFlag = true
      state.resumeTimes.push(Date.now())
    },
    stopTrading: (state) => {
      state.status = 'stopped'
      state.globalTradingFlag = false
    },
    startLap: (state, action: PayloadAction<number>) => {
      const lap: TradingLap = {
        lapNumber: action.payload,
        startTime: Date.now(),
        totalSolCollected: 0,
        totalTokensCollected: 0,
        status: 'running',
        transactionCount: 0,
        successRate: 0
      }
      state.currentLap = lap
      state.laps.push(lap)
    },
    completeLap: (state, action: PayloadAction<{ 
      solCollected: number; 
      tokensCollected: number;
      transactionCount?: number;
      successRate?: number;
      poolInfo?: any;
    }>) => {
      if (state.currentLap) {
        state.currentLap.endTime = Date.now()
        state.currentLap.totalSolCollected = action.payload.solCollected
        state.currentLap.totalTokensCollected = action.payload.tokensCollected
        state.currentLap.status = 'completed'
        
        if (action.payload.transactionCount !== undefined) {
          state.currentLap.transactionCount = action.payload.transactionCount
        }
        
        if (action.payload.successRate !== undefined) {
          state.currentLap.successRate = action.payload.successRate
        }
        
        if (action.payload.poolInfo) {
          state.currentLap.poolInfo = action.payload.poolInfo
        }
        
        // Update the lap in the laps array
        const lapIndex = state.laps.findIndex(lap => lap.lapNumber === state.currentLap?.lapNumber)
        if (lapIndex !== -1) {
          state.laps[lapIndex] = { ...state.currentLap }
        }
        
        state.currentLap = null
      }
    },
    failLap: (state, action: PayloadAction<string>) => {
      if (state.currentLap) {
        state.currentLap.endTime = Date.now()
        state.currentLap.status = 'failed'
        
        // Update the lap in the laps array
        const lapIndex = state.laps.findIndex(lap => lap.lapNumber === state.currentLap?.lapNumber)
        if (lapIndex !== -1) {
          state.laps[lapIndex] = { ...state.currentLap }
        }
        
        state.currentLap = null
      }
      state.error = action.payload
    },
    updateElapsedTime: (state, action: PayloadAction<number>) => {
      state.elapsedTime = action.payload
      state.timeLeft = Math.max(0, state.duration - action.payload)
    },
    updateTransactionStats: (state, action: PayloadAction<Partial<TradingState['transactionStats']>>) => {
      state.transactionStats = {
        ...state.transactionStats,
        ...action.payload
      }
    },
    setPoolInfo: (state, action: PayloadAction<any>) => {
      state.poolInfo = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
      if (action.payload) {
        state.status = 'error'
      }
    },
    clearError: (state) => {
      state.error = null
    },
    reset: (state) => {
      return { ...initialState }
    },
  },
})

export const {
  setStatus,
  setStrategy,
  setGlobalTradingFlag,
  startTrading,
  pauseTrading,
  resumeTrading,
  stopTrading,
  startLap,
  completeLap,
  failLap,
  updateElapsedTime,
  updateTransactionStats,
  setPoolInfo,
  setError,
  clearError,
  reset,
} = tradingSlice.actions

export default tradingSlice.reducer