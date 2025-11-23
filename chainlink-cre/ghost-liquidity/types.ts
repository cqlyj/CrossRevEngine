import { z } from "zod";

export const configSchema = z.object({
  schedule: z.string(),
  aggregatedFeedUrl: z.string(),
  baseChain: z.string(),
  targetChain: z.string(),
  oappSenderAddress: z.string(),
  oappExecutorAddress: z.string(),
  recipientAddress: z.string(),
});

export type Config = z.infer<typeof configSchema>;

export interface AggregatedFeed {
  feed_version: string;
  aggregation_timestamp: string;
  incident_id: string;
  severity: string;
  status?: string; // "idle" or "chance"
  executive_summary: {
    event: string;
    impact: string;
    market_state: string;
    opportunity: string;
    risk_level: string;
    confidence: number;
  };
  social_intelligence: {
    twitter_alerts: Array<{
      account: string;
      credibility: number;
      message: string;
      sentiment: string;
      timestamp: string;
    }>;
    aggregate_sentiment: number;
    panic_level: number;
    fud_score: number;
  };
  onchain_intelligence: {
    exploit_summary: {
      total_drained_usd: number;
      affected_pools: string[];
      attack_pattern: string;
      time_window_minutes: number;
      exploit_confidence: number;
    };
    suspicious_activity: Array<{
      type: string;
      pool?: string;
      amount_usd: number;
      flags: string[];
    }>;
  };
  market_intelligence: {
    arbitrage_opportunities: Array<{
      asset: string;
      spread_percentage: number;
      risk_level: string;
      recommended_action: string;
    }>;
    volatility: {
      index: string;
      panic_selling: boolean;
      liquidity_crisis: boolean;
    };
    gas_conditions: {
      current_gwei: number;
      recommendation: string;
    };
  };
}

export interface SchrodingerStrategy {
  strategy_type: string;
  incident: string;
  market_analysis: {
    exploit_detected: boolean;
    total_loss_usd: number;
    panic_level: number;
    arbitrage_spreads: Array<{
      asset: string;
      spread_percent: number;
      risk: string;
    }>;
  };
  ai_decision: {
    approach: string;
    reasoning: string[];
    risk_assessment: string;
  };
  swapvm_strategies: Array<{
    asset: string;
    action: string;
    curve_type: string;
    entry_price: number;
    allocation_percent: number;
    priority: number;
    bytecode: string;
    oaqua_params?: {
      amount: string;
      tokenOut: string;
      strategyBuffer: string;
    };
  }>;
  execution_plan: {
    trigger: string;
    cancel_others: boolean;
    time_limit_hours: number;
  };
  confidence: number;
}
