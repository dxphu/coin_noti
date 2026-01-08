
import { CandleData, CoinInfo } from '../types';

const MOCK_COINS: CoinInfo[] = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 65420.50, price_change_percentage_24h: 2.5 },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3450.20, price_change_percentage_24h: -1.2 },
  { id: 'solana', symbol: 'sol', name: 'Solana', current_price: 145.75, price_change_percentage_24h: 5.8 },
  { id: 'binancecoin', symbol: 'bnb', name: 'BNB', current_price: 590.30, price_change_percentage_24h: 0.4 },
  { id: 'cardano', symbol: 'ada', name: 'Cardano', current_price: 0.45, price_change_percentage_24h: -2.1 },
];

export const getTopCoins = async (): Promise<CoinInfo[]> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_COINS), 800);
  });
};

export const get1hCandles = async (coinId: string): Promise<CandleData[]> => {
  // Tăng lên 100 nến 1h (~4.1 ngày dữ liệu)
  const basePrice = MOCK_COINS.find(c => c.id === coinId)?.current_price || 100;
  const data: CandleData[] = [];
  const now = new Date();
  
  let currentPrice = basePrice * 0.95; // Bắt đầu từ giá thấp hơn để tạo trend
  
  for (let i = 100; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    const volatility = currentPrice * 0.015;
    const open = currentPrice;
    const close = open + (Math.random() - 0.45) * volatility; // Hơi bias đi lên một chút
    const high = Math.max(open, close) + Math.random() * volatility * 0.3;
    const low = Math.min(open, close) - Math.random() * volatility * 0.3;
    
    data.push({
      time: i % 12 === 0 ? `${time.getDate()}/${time.getMonth() + 1} ${time.getHours()}h` : `${time.getHours()}:00`,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000
    });
    currentPrice = close;
  }
  return data;
};
