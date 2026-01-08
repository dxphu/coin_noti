
import React, { useState, useEffect, useRef } from 'react';
import { CoinInfo, CandleData, TelegramConfig, AnalysisResult } from './types';
import { getTopCoins, get1hCandles } from './services/cryptoService';
import { analyzeMarketForDCA } from './services/geminiService';
import { sendTelegramAlert } from './services/telegramService';
import { saveSignalToSupabase, getRecentSignals } from './services/supabaseService';
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
  const [dbStatus, setDbStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [history, setHistory] = useState<any[]>([]);
  
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
    fetchHistory();
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

  const fetchHistory = async () => {
    const data = await getRecentSignals();
    setHistory(data);
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
      
      // Tự động lưu vào Supabase mỗi khi có kết quả mới
      setDbStatus('saving');
      const saved = await saveSignalToSupabase(selectedCoin, result);
      setDbStatus(saved ? 'success' : 'error');
      fetchHistory(); // Refresh lịch sử
      setTimeout(() => setDbStatus('idle'), 2000);

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
    return () => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); };
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
      <aside className="w-full md:w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col h-screen overflow-hidden">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/20">D</div>
          <h1 className="text-xl font-bold tracking-tight">DCA Assistant</h1>
        </div>

        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2 flex justify-between">
          <span>Coins Theo Dõi</span>
          {dbStatus !== 'idle' && (
            <span className={`text-[10px] animate-pulse ${dbStatus === 'saving' ? 'text-yellow-500' : dbStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}>
              {dbStatus === 'saving' ? 'Supabase Syncing...' : dbStatus === 'success' ? 'Saved' : 'Error'}
            </span>
          )}
        </h2>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mb-4">
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

        <div className="pt-4 border-t border-slate-800">
           <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 px-2">Lịch sử gần đây (Supabase)</h3>
           <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {history.map((sig, idx) => (
                <div key={idx} className="p-2 bg-slate-800/50 rounded-lg border border-slate-800 text-[10px]">
                   <div className="flex justify-between font-bold mb-1">
                      <span className="text-blue-400">{sig.symbol}</span>
                      <span className={sig.recommendation === 'BUY (DCA)' ? 'text-green-500' : 'text-slate-400'}>{sig.recommendation}</span>
                   </div>
                   <div className="flex justify-between text-slate-500">
                      <span>E: ${sig.entry_point?.toLocaleString()}</span>
                      <span>{new Date(sig.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                   </div>
                </div>
              ))}
           </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-800">
           {isAutoMonitoring && (
             <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center mb-2">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Active Monitoring</span>
                </div>
                <div className="text-xl font-mono text-white tracking-tighter">{formatTime(countdown)}</div>
             </div>
           )}
        </div>
      </aside>

      <main className="flex-1 bg-slate-950 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {selectedCoin && (
            <div className="crypto-card rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                   <h2 className="text-3xl font-bold">{selectedCoin.name}</h2>
                   <span className="text-slate-500 font-medium uppercase">{selectedCoin.symbol}</span>
                </div>
                <p className="text-slate-400 text-sm">Chế độ: <span className="text-blue-400 font-medium">100 nến 1 giờ & Supabase Sync</span></p>
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
                  Phân tích & Lưu
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
                    Đang tải dữ liệu...
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
                   className="w-full bg-slate-900/50 border border-slate-800 rounded-lg p-3 text-xs text-white focus:border-blue-500 outline-none transition-all"
                   placeholder="Bot Token"
                 />
                 <input 
                   type="text"
                   value={tgConfig.chatId}
                   onChange={(e) => setTgConfig({...tgConfig, chatId: e.target.value})}
                   className="w-full bg-slate-900/50 border border-slate-800 rounded-lg p-3 text-xs text-white focus:border-blue-500 outline-none transition-all"
                   placeholder="Chat ID"
                 />
                 <button type="submit" className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors">
                   Lưu Cấu Hình
                 </button>
               </form>
               <div className="mt-6 p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                  <p className="text-[10px] text-blue-400 font-medium">Hệ thống sẽ lưu mọi tín hiệu vào Supabase và chỉ Push Telegram khi có tín hiệu <b>BUY (DCA)</b>.</p>
               </div>
            </div>
          </div>

          {analysis && (
            <div className="crypto-card rounded-3xl p-8 animate-in fade-in slide-in-from-bottom-6 duration-700 shadow-2xl">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-slate-800 pb-8">
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">KẾT QUẢ PHÂN TÍCH 100 GIỜ</h3>
                    <div className="flex items-center gap-3 mt-2">
                       <span className={`flex items-center gap-1.5 text-sm font-bold ${analysis.sentiment === 'Bullish' ? 'text-green-400' : 'text-red-400'}`}>
                          <span className={`w-2 h-2 rounded-full ${analysis.sentiment === 'Bullish' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                          {analysis.sentiment.toUpperCase()}
                       </span>
                       <span className="text-slate-600">|</span>
                       <span className="text-slate-400 text-xs font-medium">Hỗ trợ: ${analysis.supportLevel.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className={`px-8 py-3 rounded-2xl text-lg font-black uppercase tracking-widest shadow-xl ${
                    analysis.recommendation.includes('BUY') ? 'bg-green-500 text-white shadow-green-500/20' :
                    analysis.recommendation.includes('WAIT') ? 'bg-yellow-500 text-black shadow-yellow-500/20' :
                    'bg-slate-800 text-slate-400 shadow-slate-900/20'
                  }`}>
                    {analysis.recommendation}
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                  <div className="p-6 bg-green-500/5 border border-green-500/10 rounded-3xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity"><svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg></div>
                    <p className="text-[10px] uppercase font-black text-green-500/60 mb-2 tracking-widest">Entry Point</p>
                    <p className="text-3xl font-black text-green-500 tracking-tighter">${analysis.entryPoint.toLocaleString()}</p>
                  </div>
                  <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-3xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity"><svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l4.5 9h-9L12 2z"/></svg></div>
                    <p className="text-[10px] uppercase font-black text-blue-500/60 mb-2 tracking-widest">Target TP</p>
                    <p className="text-3xl font-black text-blue-400 tracking-tighter">${analysis.takeProfit.toLocaleString()}</p>
                  </div>
                  <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-3xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity"><svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 18c4.41 0 8-3.59 8-8s-3.59-8-8-8-8 3.59-8 8 3.59 8 8 8zm1-13h-2v6h2V7zm0 8h-2v2h2v-2z"/></svg></div>
                    <p className="text-[10px] uppercase font-black text-red-500/60 mb-2 tracking-widest">Stop Loss</p>
                    <p className="text-3xl font-black text-red-500 tracking-tighter">${analysis.stopLoss.toLocaleString()}</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <h4 className="text-xs uppercase font-black text-slate-500 tracking-[0.2em] flex items-center gap-2">
                       <span className="w-8 h-px bg-slate-800"></span> AI REASONING
                    </h4>
                    <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800 leading-relaxed text-slate-300 text-sm italic font-medium">
                      "{analysis.reasoning}"
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-4">
                    <button 
                      onClick={() => handlePushToTelegram()}
                      disabled={notificationStatus !== 'idle'}
                      className={`w-full py-5 rounded-2xl font-black text-sm tracking-widest transition-all shadow-2xl flex items-center justify-center gap-3 ${
                        notificationStatus === 'idle' ? 'bg-white text-black hover:bg-slate-200' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {notificationStatus === 'idle' ? (
                        <>
                          PUSH TO TELEGRAM
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                        </>
                      ) : (
                        'PROCESSING...'
                      )}
                    </button>
                    <div className="flex items-center justify-center gap-2 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                       <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                       Signal synced with Supabase
                    </div>
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
