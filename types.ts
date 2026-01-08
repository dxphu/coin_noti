
export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CoinInfo {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface AnalysisResult {
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  recommendation: 'BUY (DCA)' | 'HOLD' | 'WAIT';
  detectedPattern: string; // Tên mô hình nến hoặc kỹ thuật được phát hiện
  reasoning: string;
  supportLevel: number;
  resistanceLevel: number;
  entryPoint: number;
  takeProfit: number;
  stopLoss: number;
}
