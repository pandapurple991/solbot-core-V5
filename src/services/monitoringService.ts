import { backendService } from './backendService';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'success' | 'debug';
  message: string;
  source: string;
  details?: any;
}

export interface ErrorData {
  id: string;
  timestamp: number;
  message: string;
  source: string;
  stack?: string;
  resolved: boolean;
  resolvedAt?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  occurrences: number;
  lastOccurrence: number;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
}

export interface SystemHealth {
  components: {
    name: string;
    status: 'operational' | 'degraded' | 'outage' | 'unknown';
    lastChecked: number;
    responseTime?: number;
    details?: string;
  }[];
  uptime: number;
  startTime: number;
}

export interface BalanceChange {
  id: string;
  timestamp: number;
  walletNumber: number;
  walletAddress: string;
  solBefore: number;
  solAfter: number;
  tokenBefore: number;
  tokenAfter: number;
  solChange: number;
  tokenChange: number;
  source: string;
  details?: string;
  transactionHash?: string;
  reason: string;
}

export interface TradingAnalytics {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  averageTradeSize: number;
  profitLoss: number;
  successRate: number;
  averageExecutionTime: number;
  lastTradeTime?: number;
  buyCount: number;
  sellCount: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalFees: number;
  averageSlippage: number;
  volumeData: Array<{ name: string; volume: number; }>;
  transactionData: Array<{ name: string; count: number; }>;
  profitLossData: Array<{ name: string; value: number; }>;
  topPerformingWallets: {
    walletNumber: number;
    walletAddress: string;
    trades: number;
    volume: number;
    profitLoss: number;
  }[];
}

class MonitoringService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '/api/monitoring';
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private async handleResponse(response: Response) {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // If parsing fails, use the default error message
      }
      throw new Error(errorMessage);
    }
    return response;
  }

  async getLogs(limit: number = 100, level?: string, source?: string): Promise<LogEntry[]> {
    try {
      console.log('🔍 Fetching logs from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      let url = `${this.baseUrl}/logs?limit=${limit}`;
      if (level) url += `&level=${level}`;
      if (source) url += `&source=${source}`;
      
      const response = await fetch(url, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const logs = await response.json();
      console.log('✅ Logs received:', logs.length);
      return logs;
    } catch (error) {
      console.error('❌ Failed to fetch logs:', error);
      throw new Error(`Failed to fetch logs: ${this.getErrorMessage(error)}`);
    }
  }

  async getConsoleOutput(limit: number = 100): Promise<string[]> {
    try {
      console.log('🔍 Fetching console output from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/console?limit=${limit}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const output = await response.json();
      console.log('✅ Console output received:', output.length);
      return output;
    } catch (error) {
      console.error('❌ Failed to fetch console output:', error);
      throw new Error(`Failed to fetch console output: ${this.getErrorMessage(error)}`);
    }
  }

  async getErrors(limit: number = 50): Promise<ErrorData[]> {
    try {
      console.log('🔍 Fetching errors from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/errors?limit=${limit}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const errors = await response.json();
      console.log('✅ Errors received:', errors.length);
      return errors;
    } catch (error) {
      console.error('❌ Failed to fetch errors:', error);
      throw new Error(`Failed to fetch errors: ${this.getErrorMessage(error)}`);
    }
  }

  async resolveError(errorId: string): Promise<void> {
    try {
      console.log('🔧 Resolving error:', errorId);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/errors/${errorId}/resolve`, {
        method: 'POST',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      console.log('✅ Error resolved successfully');
    } catch (error) {
      console.error('❌ Failed to resolve error:', error);
      throw new Error(`Failed to resolve error: ${this.getErrorMessage(error)}`);
    }
  }

  async getPerformanceMetrics(): Promise<PerformanceMetric[]> {
    try {
      console.log('🔍 Fetching performance metrics from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/performance`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const metrics = await response.json();
      console.log('✅ Performance metrics received:', metrics.length);
      return metrics;
    } catch (error) {
      console.error('❌ Failed to fetch performance metrics:', error);
      throw new Error(`Failed to fetch performance metrics: ${this.getErrorMessage(error)}`);
    }
  }

  async getSystemHealth(): Promise<SystemHealth> {
    try {
      console.log('🔍 Fetching system health from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const health = await response.json();
      console.log('✅ System health received');
      return health;
    } catch (error) {
      console.error('❌ Failed to fetch system health:', error);
      throw new Error(`Failed to fetch system health: ${this.getErrorMessage(error)}`);
    }
  }

  async getBalanceChanges(limit: number = 50): Promise<BalanceChange[]> {
    try {
      console.log('🔍 Fetching balance changes from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/balance-changes?limit=${limit}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const changes = await response.json();
      console.log('✅ Balance changes received:', changes.length);
      return changes;
    } catch (error) {
      console.error('❌ Failed to fetch balance changes:', error);
      throw new Error(`Failed to fetch balance changes: ${this.getErrorMessage(error)}`);
    }
  }

  async getTransactions(limit: number = 100): Promise<any[]> {
    try {
      console.log('🔍 Fetching transactions from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/transactions?limit=${limit}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const transactions = await response.json();
      console.log('✅ Transactions received:', transactions.length);
      return transactions;
    } catch (error) {
      console.error('❌ Failed to fetch transactions:', error);
      throw new Error(`Failed to fetch transactions: ${this.getErrorMessage(error)}`);
    }
  }

  async getTradingAnalytics(): Promise<TradingAnalytics> {
    try {
      console.log('🔍 Fetching trading analytics from backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${this.baseUrl}/analytics`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      await this.handleResponse(response);
      const analytics = await response.json();
      console.log('✅ Trading analytics received');
      return analytics;
    } catch (error) {
      console.error('❌ Failed to fetch trading analytics:', error);
      throw new Error(`Failed to fetch trading analytics: ${this.getErrorMessage(error)}`);
    }
  }
}

export const monitoringService = new MonitoringService();