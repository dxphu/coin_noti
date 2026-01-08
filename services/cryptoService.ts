import { CandleData, CoinInfo } from '../types.ts';

const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

// Danh sách các cặp tiền phổ biến trên Binance
const TARGET_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT', 'DOTUSDT'];

export const getTopCoins = async (): Promise<CoinInfo[]> => {
  try {
    const response = await fetch(`${BINANCE_BASE_URL}/ticker/24hr`);
    const data = await response.json();
    
    const filtered = data.filter((item: any) => TARGET_SYMBOLS.includes(item.symbol));
    
    return filtered.map((item: any) => ({
      id: item.symbol,
      symbol: item.symbol.replace('USDT', '').toLowerCase(),
      name: item.symbol.replace('USDT', ''),
      current_price: parseFloat(item.lastPrice),
      price_change_percentage_24h: parseFloat(item.priceChangePercent)
    }));
  } catch (error) {
    console.error("Binance API Error (Top Coins):", error);
    return [];
  }
};

export const get1hCandles = async (symbol: string): Promise<CandleData[]> => {
  try {
    // Tăng limit lên 100 để có đủ dữ liệu vẽ biểu đồ
    const response = await fetch(`${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=1h&limit=100`);
    if (!response.ok) throw new Error("Failed to fetch klines");
    const data = await response.json();
    
    return data.map((d: any) => {
      const date = new Date(d[0]);
      return {
        time: `${date.getHours()}h ${date.getDate()}/${date.getMonth() + 1}`,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
      };
    });
  } catch (error) {
    console.error("Binance API Error (Candles):", error);
    return [];
  }
};