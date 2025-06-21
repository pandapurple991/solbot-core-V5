import React, { useState } from 'react'
import { useDispatch } from 'react-redux'
import { X, ArrowRight, ArrowLeft, Check, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { backendService } from '../../services/backendService'
import { setCurrentSession } from '../../store/slices/sessionSlice'
import { setAdminWallet, setTradingWallets } from '../../store/slices/walletSlice'
import { WalletData } from '../../store/slices/walletSlice'
import TokenDiscovery from '../tokens/TokenDiscovery'
import toast from 'react-hot-toast'

interface MainSessionFlowProps {
  isOpen: boolean
  onClose: () => void
}

// This follows your EXACT index.ts flow
const MainSessionFlow: React.FC<MainSessionFlowProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Session data matching your backend structure
  const [tokenAddress, setTokenAddress] = useState('')
  const [tokenData, setTokenData] = useState<any>(null)
  const [poolKeys, setPoolKeys] = useState<any>(null)
  const [sessionFileName, setSessionFileName] = useState<string>('')
  const [adminWalletOption, setAdminWalletOption] = useState<'create' | 'import'>('create')
  const [adminPrivateKey, setAdminPrivateKey] = useState('')
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [adminWallet, setAdminWalletState] = useState<WalletData | null>(null)
  const [walletCount, setWalletCount] = useState(10)
  const [solAmount, setSolAmount] = useState(1.0)
  const [tradingWallets, setTradingWalletsState] = useState<WalletData[]>([])

  // Steps matching your EXACT index.ts flow
  const steps = [
    { id: 1, name: 'Token Discovery', description: 'Find and validate your token' },
    { id: 2, name: 'Admin Wallet', description: 'Set up your admin wallet' },
    { id: 3, name: 'Trading Wallets', description: 'Generate trading wallets' },
    { id: 4, name: 'Fund Wallets', description: 'Distribute SOL to wallets' },
    { id: 5, name: 'Token Distribution', description: 'Distribute tokens (optional)' },
    { id: 6, name: 'Start Trading', description: 'Choose strategy and begin' }
  ]

  const resetFlow = () => {
    setCurrentStep(1)
    setTokenAddress('')
    setTokenData(null)
    setPoolKeys(null)
    setSessionFileName('')
    setAdminWalletOption('create')
    setAdminPrivateKey('')
    setShowPrivateKey(false)
    setAdminWalletState(null)
    setWalletCount(10)
    setSolAmount(1.0)
    setTradingWalletsState([])
    setError(null)
    setIsLoading(false)
  }

  const handleClose = () => {
    resetFlow()
    onClose()
  }

  // Step 1: Token Discovery (calls backend)
  const handleTokenValidated = (validatedTokenData: any, validatedPoolKeys: any) => {
    setTokenData(validatedTokenData)
    setTokenAddress(validatedTokenData.address)
    setPoolKeys(validatedPoolKeys)
    
    // Create session file name
    const timestamp = new Date().toISOString()
    const fileName = `${validatedTokenData.name}_${new Date().toLocaleDateString().replace(/\//g, '.')}_${new Date().toLocaleTimeString().replace(/:/g, '.')}_session.json`
    setSessionFileName(fileName)
    
    setError(null)
    toast.success(`${validatedTokenData.name} validated and ready for trading!`)
  }

  // Step 2: Admin Wallet (calls backend)
  const createAdminWalletAndUpdateSession = async () => {
    setIsLoading(true)
    setError(null)

    try {
      let wallet: WalletData

      if (adminWalletOption === 'import') {
        if (!adminPrivateKey.trim()) {
          setError('Please enter admin wallet private key')
          return false
        }
        wallet = await backendService.importAdminWallet(adminPrivateKey)
      } else {
        wallet = await backendService.createAdminWallet()
      }
      
      setAdminWalletState(wallet)
      toast.success('Admin wallet ready! Please fund it with SOL before continuing.')
      return true
    } catch (error) {
      setError(`Failed to create admin wallet: ${error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error)}`)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3: Wallet Generation (calls backend)
  const generateWalletsAndUpdateSession = async () => {
    if (walletCount < 1 || walletCount > 100) {
      setError('Wallet count must be between 1 and 100')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const wallets = await backendService.generateTradingWallets(walletCount)
      setTradingWalletsState(wallets)
      toast.success(`Generated ${wallets.length} trading wallets`)
      return true
    } catch (error) {
      setError(`Failed to generate trading wallets: ${error instanceof Error ? error.message : String(error)}`)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Step 4: SOL Distribution (calls backend)
  const distributeSolToWallets = async () => {
    if (!adminWallet || tradingWallets.length === 0) {
      setError('Admin wallet and trading wallets are required')
      return false
    }

    if (solAmount <= 0) {
      setError('SOL amount must be greater than 0')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const updatedWallets = await backendService.distributeSol(adminWallet, tradingWallets, solAmount)
      setTradingWalletsState(updatedWallets)
      toast.success(`Successfully distributed SOL to ${updatedWallets.length} wallets`)
      return true
    } catch (error) {
      setError(`Failed to distribute SOL to wallets: ${error instanceof Error ? error.message : String(error)}`)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Step 5: Token Distribution (calls backend)
  const distributeTokensToWallets = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Check admin token balance
      const adminTokenBalance = await backendService.getAdminTokenBalance(adminWallet!, tokenAddress)
      
      if (adminTokenBalance > 0) {
        const amountPerWallet = adminTokenBalance / tradingWallets.length
        const updatedWallets = await backendService.distributeTokens(adminWallet!, tradingWallets, tokenAddress, amountPerWallet)
        setTradingWalletsState(updatedWallets)
        toast.success('Tokens distributed to trading wallets')
      } else {
        toast('No tokens found in admin wallet - skipping token distribution', { icon: 'ℹ️' })
      }
      
      return true
    } catch (error) {
      // For token distribution, we should allow proceeding even if it fails
      // This is because the admin wallet might not have tokens or SOL for fees
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn('Token distribution failed (this is expected if admin wallet has no tokens or SOL):', errorMessage)
      
      if (errorMessage.includes('no record of a prior credit') || errorMessage.includes('insufficient funds') || errorMessage.includes('Maximum call stack size exceeded')) {
        toast('Admin wallet has no tokens or SOL for fees - skipping token distribution', { icon: 'ℹ️' })
        return true // Allow proceeding to next step
      } else {
        // Only show error for unexpected issues
        setError(`Failed to distribute tokens: ${errorMessage}`)
        return false
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Step 6: Start Trading (calls backend)
  const startTradingWithStrategy = async (strategy: string) => {
    if (!tokenData || !adminWallet || tradingWallets.length === 0 || !poolKeys) {
      setError('All steps must be completed')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const sessionData = {
        admin: {
          number: adminWallet.number,
          address: adminWallet.publicKey,
          privateKey: adminWallet.privateKey
        },
        wallets: tradingWallets.map(wallet => ({
          number: wallet.number,
          address: wallet.publicKey,
          privateKey: wallet.privateKey,
          generationTimestamp: wallet.generationTimestamp
        })),
        tokenAddress,
        poolKeys,
        tokenName: tokenData.name,
        timestamp: new Date().toISOString()
      }

      // Save session first
      const savedFileName = await backendService.saveSession(sessionData)
      console.log('Session saved:', savedFileName)

      // Start trading
      await backendService.startTrading(strategy, sessionData)
      
      // Update Redux store
      dispatch(setCurrentSession(sessionData))
      dispatch(setAdminWallet(adminWallet))
      dispatch(setTradingWallets(tradingWallets))

      toast.success(`Trading started with ${strategy.replace('_', ' ').toLowerCase()}!`)
      handleClose()
    } catch (error) {
      setError(`Failed to start trading: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to determine if we can proceed to next step
  const canProceedToNext = () => {
    switch (currentStep) {
      case 1:
        return !!(tokenData && poolKeys)
      case 2:
        return !!adminWallet
      case 3:
        return tradingWallets.length > 0
      case 4:
        return true // SOL distribution can be skipped
      case 5:
        return true // Token distribution can be skipped
      default:
        return false
    }
  }

  const handleNext = async () => {
    let canProceed = false

    switch (currentStep) {
      case 1:
        canProceed = !!(tokenData && poolKeys)
        if (!canProceed) {
          setError('Please validate a token first')
        }
        break
      case 2:
        canProceed = await createAdminWalletAndUpdateSession()
        break
      case 3:
        canProceed = await generateWalletsAndUpdateSession()
        break
      case 4:
        canProceed = await distributeSolToWallets()
        break
      case 5:
        canProceed = await distributeTokensToWallets()
        break
      case 6:
        // This step handles strategy selection
        return
    }

    if (canProceed) {
      setCurrentStep(currentStep + 1)
      setError(null)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setError(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Start Trading Session
            </h2>
            <p className="text-muted-foreground mt-1">
              Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
            </p>
            {sessionFileName && (
              <p className="text-xs text-secondary mt-1">
                Session: {sessionFileName}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 bg-muted/30">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  currentStep > step.id
                    ? 'bg-secondary text-secondary-foreground'
                    : currentStep === step.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-1 mx-1 ${
                    currentStep > step.id ? 'bg-secondary' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-500">{error}</span>
            </div>
          )}

          {/* Step 1: Token Discovery */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Find Your Token
                </h3>
                <p className="text-muted-foreground">
                  Enter a token address to check if it's available for trading.
                </p>
              </div>

              <TokenDiscovery 
                onTokenValidated={handleTokenValidated}
                initialAddress={tokenAddress}
                showFullInterface={true}
              />
            </div>
          )}

          {/* Step 2: Admin Wallet */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Set Up Admin Wallet
                </h3>
                <p className="text-muted-foreground">
                  This wallet will control your trading session and hold your funds.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setAdminWalletOption('create')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    adminWalletOption === 'create'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <h4 className="font-medium text-foreground">Create New Wallet</h4>
                  <p className="text-sm text-muted-foreground">Generate a fresh wallet for trading</p>
                </button>

                <button
                  onClick={() => setAdminWalletOption('import')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    adminWalletOption === 'import'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <h4 className="font-medium text-foreground">Import Existing</h4>
                  <p className="text-sm text-muted-foreground">Use your existing wallet</p>
                </button>
              </div>

              {adminWalletOption === 'import' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Private Key
                  </label>
                  <div className="relative">
                    <input
                      type={showPrivateKey ? "text" : "password"}
                      value={adminPrivateKey}
                      onChange={(e) => setAdminPrivateKey(e.target.value)}
                      placeholder="Enter your wallet private key..."
                      className="w-full px-4 py-3 pr-12 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {adminWallet && (
                <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4">
                  <h4 className="font-medium text-secondary mb-2">
                    Admin Wallet Ready
                  </h4>
                  <p className="text-sm text-foreground font-mono">
                    {adminWallet.publicKey}
                  </p>
                  <p className="text-xs text-secondary mt-1">
                    ⚠️ Fund this wallet with SOL before proceeding to the next step
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Trading Wallets */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Generate Trading Wallets
                </h3>
                <p className="text-muted-foreground">
                  These wallets will execute your trading strategy.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Number of Trading Wallets (1-100)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={walletCount}
                  onChange={(e) => setWalletCount(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  More wallets = more trading activity but higher SOL requirements
                </p>
              </div>

              {tradingWallets.length > 0 && (
                <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4">
                  <h4 className="font-medium text-secondary mb-2">
                    {tradingWallets.length} Trading Wallets Generated
                  </h4>
                  <p className="text-sm text-foreground">
                    Ready for SOL distribution in the next step
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Fund Wallets */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Fund Trading Wallets
                </h3>
                <p className="text-muted-foreground">
                  Distribute SOL from your admin wallet to the trading wallets.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Total SOL Amount to Distribute
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={solAmount}
                  onChange={(e) => setSolAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 border border-input rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Each wallet will receive approximately {(solAmount / walletCount).toFixed(6)} SOL
                </p>
              </div>

              {tradingWallets.some(w => w.solBalance > 0) && (
                <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4">
                  <h4 className="font-medium text-secondary mb-2">
                    SOL Distribution Complete
                  </h4>
                  <p className="text-sm text-foreground">
                    {tradingWallets.filter(w => w.solBalance > 0).length} wallets funded successfully
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Token Distribution */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Token Distribution (Optional)
                </h3>
                <p className="text-muted-foreground">
                  If your admin wallet has {tokenData?.symbol} tokens, they'll be distributed automatically.
                </p>
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <h4 className="font-medium text-primary mb-2">
                  Automatic Token Check
                </h4>
                <p className="text-sm text-foreground">
                  The system will check if your admin wallet has any {tokenData?.symbol} tokens and distribute them to your trading wallets.
                  If no tokens are found, this step will be skipped.
                </p>
              </div>
            </div>
          )}

          {/* Step 6: Start Trading */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Choose Trading Strategy
                </h3>
                <p className="text-muted-foreground">
                  Select your trading strategy and start automated trading.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => startTradingWithStrategy('INCREASE_MAKERS_VOLUME')}
                  disabled={isLoading}
                  className="p-6 border-2 border-border rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  <h4 className="font-medium text-foreground mb-2">
                    Increase Makers + Volume
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Comprehensive strategy to boost both unique traders and trading volume
                  </p>
                </button>

                <button
                  onClick={() => startTradingWithStrategy('INCREASE_VOLUME_ONLY')}
                  disabled={isLoading}
                  className="p-6 border-2 border-border rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  <h4 className="font-medium text-foreground mb-2">
                    Volume Only
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Focus on maximizing trading volume for your token
                  </p>
                </button>

                <button
                  onClick={() => startTradingWithStrategy('LIQUIDITY_PHASE_TRADING')}
                  disabled={isLoading}
                  className="p-6 border-2 border-border rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  <h4 className="font-medium text-foreground mb-2">
                    Liquidity Phase Trading
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Timed buy phases followed by sell phases in continuous cycles
                  </p>
                </button>
              </div>

              {/* Session Summary */}
              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="font-medium text-foreground mb-3">
                  Session Summary
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Token:</span>
                    <span className="ml-2 text-foreground">{tokenData?.name} ({tokenData?.symbol})</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Trading Wallets:</span>
                    <span className="ml-2 text-foreground">{tradingWallets.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total SOL:</span>
                    <span className="ml-2 text-foreground">{solAmount} SOL</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">SOL per wallet:</span>
                    <span className="ml-2 text-foreground">{(solAmount / walletCount).toFixed(6)} SOL</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {currentStep < 6 && (
          <div className="flex items-center justify-between p-6 border-t border-border">
            <button
              onClick={handleBack}
              disabled={currentStep === 1 || isLoading}
              className="flex items-center px-4 py-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>

            <button
              onClick={handleNext}
              disabled={isLoading || !canProceedToNext()}
              className="btn btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              {isLoading ? 'Processing...' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default MainSessionFlow