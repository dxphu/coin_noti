
import { AnalysisResult, CoinInfo } from '../types';

const SUPABASE_URL = "https://cgsgcwvpfgjbhatjhxkg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnc2djd3ZwZmdqYmhhdGpoeGtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NjExNzAsImV4cCI6MjA4MzQzNzE3MH0.OxGeevVJlkBjmGFbcZ5rowsO0ZNgX_plKrKkWJBaZxA";

export const saveSignalToSupabase = async (
  coin: CoinInfo,
  analysis: AnalysisResult
): Promise<boolean> => {
  const endpoint = `${SUPABASE_URL}/rest/v1/signals`;
  
  const payload = {
    coin_name: coin.name,
    symbol: coin.symbol.toUpperCase(),
    current_price: coin.current_price,
    recommendation: analysis.recommendation,
    sentiment: analysis.sentiment,
    entry_point: analysis.entryPoint,
    take_profit: analysis.takeProfit,
    stop_loss: analysis.stopLoss,
    reasoning: analysis.reasoning,
    support_level: analysis.supportLevel,
    resistance_level: analysis.resistanceLevel,
    created_at: new Date().toISOString()
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    return response.ok;
  } catch (error) {
    console.error("Supabase Save Error:", error);
    return false;
  }
};

export const getRecentSignals = async (limit = 5): Promise<any[]> => {
  const endpoint = `${SUPABASE_URL}/rest/v1/signals?select=*&order=created_at.desc&limit=${limit}`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });

    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Supabase Fetch Error:", error);
    return [];
  }
};
