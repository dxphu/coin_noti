
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CoinInfo, CandleData, TelegramConfig, AnalysisResult } from './types';
import { getTopCoins, get1hCandles } from './services/cryptoService';
import { analyzeMarketForDCA } from './services/geminiService';
import { sendTelegramAlert } from './services/telegramService';
import CandleChart from './components/CandleChart';

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 giờ
const COUNTDOWN_STEP_MS = 1000;

const App: React.FC = () => {
  const [coins, setCoins] = useState<CoinInfo[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<CoinInfo | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  
  // Auto Monitoring states
  const [isAutoMonitoring, setIsAutoMonitoring] = useState(false);
  const [countdown, setCountdown] = useState(SCAN_INTERVAL_MS / 1000);
  const [lastAutoPushTime, setLastAutoPushTime] = useState<Date | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  const [tgConfig, setTgConfig] = useState<TelegramConfig>(() => {
    const saved = localStorage.getItem('tg_config');
    return saved ? JSON.parse(saved) : { botToken: '', chatId: '' };
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const topCoins = await getTopCoins();
    setCoins(topCoins);
    if (topCoins.length > 0) {
      handleCoinSelect(topCoins[0]);
    }
    setLoading(false);
  };

  const handleCoinSelect = async (coin: CoinInfo) => {
    setSelectedCoin(coin);
    setAnalysis(null);
    const data = await get1hCandles(coin.id);
    setCandles(data);
    setCountdown(SCAN_INTERVAL_MS / 1000);
  };

  const handleAnalyze = async (isAuto = false) => {
    if (!selectedCoin) return null;
    if (!isAuto) setAnalyzing(true);
    
    try {
      const freshCandles = isAuto ? await get1hCandles(selectedCoin.id) : candles;
      if (isAuto) setCandles(freshCandles);

      const result = await analyzeMarketForDCA(selectedCoin.name, freshCandles);
      setAnalysis(result);
      return result;
    } catch (error) {
      console.error("Analysis Error:", error);
      return null;
    } finally {
      if (!isAuto) setAnalyzing(false);
    }
  };

  const handlePushToTelegram = async (customAnalysis?: AnalysisResult) => {
    const targetAnalysis = customAnalysis || analysis;
    if (!selectedCoin || !targetAnalysis) return;
    
    setNotificationStatus('sending');
    const success = await sendTelegramAlert(tgConfig, selectedCoin.name, targetAnalysis, selectedCoin.current_price);
    setNotificationStatus(success ? 'success' : 'error');
    
    if (success) setLastAutoPushTime(new Date());
    setTimeout(() => setNotificationStatus('idle'), 3000);
  };

  // Auto Monitor Logic
  useEffect(() => {
    if (isAutoMonitoring) {
      setCountdown(SCAN_INTERVAL_MS / 1000);
      
      countdownTimerRef.current = window.setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            performAutoScan();
            return SCAN_INTERVAL_MS / 1000;
          }
          return prev - 1;
        });
      }, COUNTDOWN_STEP_MS);
    } else {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isAutoMonitoring, selectedCoin]);

  const performAutoScan = async () => {
    const result = await handleAnalyze(true);
    if (result && result.recommendation === 'BUY (DCA)') {
      await handlePushToTelegram(result);
    }
  };

  const saveTgConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('tg_config', JSON.stringify(tgConfig));
    alert('Đã lưu cấu hình Telegram!');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar - Coin List */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col h-screen overflow-hidden">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/20">D</div>
          <h1 className="text-xl font-bold tracking-tight">DCA Assistant</h1>
        </div>

        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">Coins Theo Dõi</h2>
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
          {coins.map(coin => (
            <button
              key={coin.id}
              onClick={() => handleCoinSelect(coin)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                selectedCoin?.id === coin.id 
                ? 'bg-blue-600/10 border-blue-600/20 border text-blue-400' 
                : 'hover:bg-slate-800 text-slate-400 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold uppercase text-sm">{coin.symbol}</span>
                <span className="text-xs opacity-60 truncate w-16">{coin.name}</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium">${coin.current_price.toLocaleString()}</div>
                <div className={`text-[10px] ${coin.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coin.price_change_percentage_24h > 0 ? '+' : ''}{coin.price_change_percentage_24h.toFixed(2)}%
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-4 border-t border-slate-800 space-y-4">
           {isAutoMonitoring && (
             <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] text-green-500 font-bold uppercase">Monitoring active</span>
                </div>
                <div className="text-xl font-mono text-white">{formatTime(countdown)}</div>
             </div>
           )}
           <p className="text-[10px] text-slate-500 text-center">AI Powered Market Analyzer</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-slate-950 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {selectedCoin && (
            <div className="crypto-card rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                   <h2 className="text-3xl font-bold">{selectedCoin.name}</h2>
                   <span className="text-slate-500 font-medium uppercase">{selectedCoin.symbol}</span>
                </div>
                <p className="text-slate-400 text-sm">Chế độ xem: <span className="text-blue-400 font-medium">100 nến 1 giờ</span></p>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button 
                  onClick={() => handleAnalyze(false)}
                  disabled={analyzing}
                  className="flex-1 md:flex-none px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  )}
                  Phân tích ngay
                </button>
                <button 
                  onClick={() => setIsAutoMonitoring(!isAutoMonitoring)}
                  className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    isAutoMonitoring 
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                  }`}
                >
                  {isAutoMonitoring ? 'Dừng Tự Động' : 'Bật Auto Monitor'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 crypto-card rounded-2xl p-6">
               <div className="flex justify-between items-center mb-6">
                 <h3 className="font-semibold text-slate-300">Biểu đồ biến động</h3>
               </div>
               {candles.length > 0 ? (
                 <CandleChart data={candles} />
               ) : (
                 <div className="h-64 flex items-center justify-center text-slate-600">
                    Đang tải...
                 </div>
               )}
            </div>

            <div className="crypto-card rounded-2xl p-6">
               <h3 className="font-semibold text-slate-300 mb-4">Cấu hình Telegram</h3>
               <form onSubmit={saveTgConfig} className="space-y-4">
                 <input 
                   type="password"
                   value={tgConfig.botToken}
                   onChange={(e) => setTgConfig({...tgConfig, botToken: e.target.value})}
                   className="w-full bg-slate-900/50 border border-slate-800 rounded-lg p-2 text-xs text-white"
                   placeholder="Bot Token"
                 />
                 <input 
                   type="text"
                   value={tgConfig.chatId}
                   onChange={(e) => setTgConfig({...tgConfig, chatId: e.target.value})}
                   className="w-full bg-slate-900/50 border border-slate-800 rounded-lg p-2 text-xs text-white"
                   placeholder="Chat ID"
                 />
                 <button type="submit" className="w-full py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold">
                   Lưu Cấu Hình
                 </button>
               </form>
               <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                  <p className="text-[10px] text-slate-500">Auto push khi AI khuyến nghị <b>BUY (DCA)</b>.</p>
               </div>
            </div>
          </div>

          {analysis && (
            <div className="crypto-card rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-blue-400">Kết quả phân tích 100 nến</h3>
                    <p className="text-slate-500 text-xs">Tâm lý: <span className={analysis.sentiment === 'Bullish' ? 'text-green-400' : 'text-red-400'}>{analysis.sentiment}</span></p>
                  </div>
                  <div className={`px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest ${
                    analysis.recommendation.includes('BUY') ? 'bg-green-500/20 text-green-500 border border-green-500/40' :
                    analysis.recommendation.includes('WAIT') ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/40' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {analysis.recommendation}
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-center">
                    <p className="text-[10px] uppercase font-black text-green-500/60 mb-1">Điểm mua (Entry)</p>
                    <p className="text-2xl font-black text-green-500">${analysis.entryPoint.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-center">
                    <p className="text-[10px] uppercase font-black text-blue-500/60 mb-1">Chốt lời (Target)</p>
                    <p className="text-2xl font-black text-blue-400">${analysis.takeProfit.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
                    <p className="text-[10px] uppercase font-black text-red-500/60 mb-1">Cắt lỗ (Stoploss)</p>
                    <p className="text-2xl font-black text-red-500">${analysis.stopLoss.toLocaleString()}</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-xs uppercase font-bold text-slate-500 tracking-widest">Lập luận của AI</h4>
                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 leading-relaxed text-slate-300 text-sm italic">
                      "{analysis.reasoning}"
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                          <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Hỗ trợ (Support)</p>
                          <p className="text-lg font-bold text-slate-300">${analysis.supportLevel.toLocaleString()}</p>
                       </div>
                       <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                          <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Kháng cự (Resist)</p>
                          <p className="text-lg font-bold text-slate-300">${analysis.resistanceLevel.toLocaleString()}</p>
                       </div>
                    </div>
                    
                    <button 
                      onClick={() => handlePushToTelegram()}
                      disabled={notificationStatus !== 'idle'}
                      className="w-full py-4 rounded-2xl font-black bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {notificationStatus === 'idle' ? 'BÁO VỀ TELEGRAM NGAY' : 'ĐANG XỬ LÝ...'}
                    </button>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
