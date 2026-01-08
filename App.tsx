
import React, { useState, useEffect, useRef } from 'react';
import { CoinInfo, CandleData, TelegramConfig, AnalysisResult } from './types.ts';
import { getTopCoins, get1hCandles } from './services/cryptoService.ts';
import { analyzeMarketForDCA } from './services/geminiService.ts';
import { sendTelegramAlert } from './services/telegramService.ts';
import { saveSignalToSupabase, getRecentSignals } from './services/supabaseService.ts';
import CandleChart from './components/CandleChart.tsx';

const SCAN_INTERVAL_MS = 60 * 60 * 1000; 
const COUNTDOWN_STEP_MS = 1000;

// Hardcoded Telegram Config theo yêu cầu người dùng
const DEFAULT_TG_CONFIG: TelegramConfig = {
  botToken: "8459324070:AAE8x2nNGt2c2RVgUCP-F1KcY0SInFOZeqA",
  chatId: "6305931650"
};

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
  const countdownTimerRef = useRef<number | null>(null);

  const [tgConfig, setTgConfig] = useState<TelegramConfig>(() => {
    const saved = localStorage.getItem('tg_config');
    return saved ? JSON.parse(saved) : DEFAULT_TG_CONFIG;
  });

  useEffect(() => {
    fetchInitialData();
    fetchHistory();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const topCoins = await getTopCoins();
      setCoins(topCoins);
      if (topCoins.length > 0) {
        handleCoinSelect(topCoins[0]);
      }
    } catch (e) {
      console.error("Fetch data error", e);
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    try {
      const data = await getRecentSignals();
      setHistory(data);
    } catch (e) {
      console.error("History fetch error", e);
    }
  };

  const handleCoinSelect = async (coin: CoinInfo) => {
    setSelectedCoin(coin);
    setAnalysis(null);
    setCandles([]); // Reset biểu đồ trước khi tải mới
    try {
      const data = await get1hCandles(coin.id);
      setCandles(data);
      setCountdown(SCAN_INTERVAL_MS / 1000);
    } catch (e) {
      console.error("Fetch candles error", e);
    }
  };

  const handleAnalyze = async (isAuto = false) => {
    if (!selectedCoin) return null;
    if (!isAuto) setAnalyzing(true);
    
    try {
      const freshCandles = await get1hCandles(selectedCoin.id);
      setCandles(freshCandles);

      const result = await analyzeMarketForDCA(selectedCoin.name, freshCandles);
      setAnalysis(result);
      
      setDbStatus('saving');
      const saved = await saveSignalToSupabase(selectedCoin, result);
      setDbStatus(saved ? 'success' : 'error');
      fetchHistory();
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
    alert('Đã cập nhật cấu hình Telegram!');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white gap-4">
      <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
      <div className="font-black text-xl tracking-widest animate-pulse">BINANCE CONNECTING...</div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="w-full md:w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col h-screen overflow-hidden">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/20">D</div>
          <h1 className="text-xl font-bold tracking-tight">DCA Binance</h1>
        </div>

        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2 flex justify-between">
          <span>Markets (Binance)</span>
          {dbStatus !== 'idle' && (
            <span className={`text-[10px] animate-pulse ${dbStatus === 'saving' ? 'text-yellow-500' : dbStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}>
              {dbStatus === 'saving' ? 'Syncing...' : dbStatus === 'success' ? 'Saved' : 'Error'}
            </span>
          )}
        </h2>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mb-4 pr-1">
          {coins.map(coin => (
            <button
              key={coin.id}
              onClick={() => handleCoinSelect(coin)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${
                selectedCoin?.id === coin.id 
                ? 'bg-blue-600/10 border-blue-600/40 text-blue-400' 
                : 'hover:bg-slate-800 text-slate-400 border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold uppercase text-sm">{coin.symbol}</span>
                <span className="text-[10px] opacity-60 px-1.5 py-0.5 bg-slate-800 rounded">USDT</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold">${coin.current_price.toLocaleString()}</div>
                <div className={`text-[10px] font-medium ${coin.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {coin.price_change_percentage_24h > 0 ? '+' : ''}{coin.price_change_percentage_24h.toFixed(2)}%
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-800">
           <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 px-2">Lịch sử (Supabase)</h3>
           <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {history.length > 0 ? history.map((sig, idx) => (
                <div key={idx} className="p-2 bg-slate-800/50 rounded-lg border border-slate-800 text-[10px]">
                   <div className="flex justify-between font-bold mb-1">
                      <span className="text-blue-400">{sig.symbol}</span>
                      <span className={sig.recommendation === 'BUY (DCA)' ? 'text-green-500' : 'text-slate-400'}>{sig.recommendation}</span>
                   </div>
                   <div className="flex justify-between text-slate-500">
                      <span>${sig.current_price?.toLocaleString()}</span>
                      <span>{new Date(sig.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                   </div>
                </div>
              )) : <p className="text-[10px] text-center text-slate-600 p-2 italic">Chưa có tín hiệu</p>}
           </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-800">
           {isAutoMonitoring && (
             <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center mb-2">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Live Scanning</span>
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
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center font-bold text-xl border border-slate-700">
                  {selectedCoin.symbol.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                     <h2 className="text-3xl font-black tracking-tight">{selectedCoin.name}</h2>
                     <span className="text-slate-500 font-bold uppercase text-xs mt-1">/ USDT</span>
                  </div>
                  <p className="text-slate-400 text-xs font-medium">Nguồn: <span className="text-blue-500 font-bold uppercase tracking-widest">Binance Official API</span></p>
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button 
                  onClick={() => handleAnalyze(false)}
                  disabled={analyzing}
                  className="flex-1 md:flex-none px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 border border-slate-700"
                >
                  {analyzing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : "Phân tích AI"}
                </button>
                <button 
                  onClick={() => setIsAutoMonitoring(!isAutoMonitoring)}
                  className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-black tracking-wider transition-all flex items-center justify-center gap-2 ${
                    isAutoMonitoring 
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/30'
                  }`}
                >
                  {isAutoMonitoring ? 'DỪNG QUÉT' : 'BẬT TỰ ĐỘNG'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 crypto-card rounded-2xl p-6 min-h-[380px] flex flex-col">
               <div className="flex justify-between items-center mb-6">
                 <h3 className="font-bold text-slate-300 flex items-center gap-2 italic">
                   <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                   BIỂU ĐỒ 100 NẾN 1 GIỜ
                 </h3>
                 <div className="text-[10px] text-slate-500 font-bold bg-slate-800 px-2 py-1 rounded">1H INTERVAL</div>
               </div>
               <div className="flex-1 w-full bg-slate-900/10 rounded-xl overflow-hidden min-h-[250px]">
                 {candles.length > 0 ? (
                   <CandleChart data={candles} />
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                      <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
                      <span className="text-xs font-bold tracking-widest uppercase">Fetching Binance Data...</span>
                   </div>
                 )}
               </div>
            </div>

            <div className="crypto-card rounded-2xl p-6 border-t-2 border-t-blue-600">
               <h3 className="font-bold text-slate-300 mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.39.52-.46-.01-1.33-.26-1.98-.48-.8-.27-1.43-.42-1.37-.89.03-.25.38-.51 1.03-.78 4.04-1.76 6.74-2.92 8.09-3.48 3.85-1.6 4.64-1.88 5.17-1.89.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.13-.03.19z"/></svg>
                  TELEGRAM SETTINGS
               </h3>
               <form onSubmit={saveTgConfig} className="space-y-4">
                 <div className="space-y-1.5">
                   <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Bot Token</label>
                   <input 
                     type="password"
                     value={tgConfig.botToken}
                     onChange={(e) => setTgConfig({...tgConfig, botToken: e.target.value})}
                     className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs text-white focus:border-blue-500 outline-none transition-all font-mono"
                     placeholder="Bot Token"
                   />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Chat ID</label>
                   <input 
                     type="text"
                     value={tgConfig.chatId}
                     onChange={(e) => setTgConfig({...tgConfig, chatId: e.target.value})}
                     className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs text-white focus:border-blue-500 outline-none transition-all font-mono"
                     placeholder="Chat ID"
                   />
                 </div>
                 <button type="submit" className="w-full py-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-xl text-xs font-black tracking-tighter transition-all border border-blue-600/20">
                   UPDATE CONFIG
                 </button>
               </form>
               <div className="mt-6 p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                  <p className="text-[9px] text-slate-500 font-bold leading-relaxed uppercase tracking-wider">
                    Auto-push is triggered only when AI detects a <span className="text-green-500">BUY (DCA)</span> signal. All other signals are saved to Supabase logs.
                  </p>
               </div>
            </div>
          </div>

          {analysis && (
            <div className="crypto-card rounded-3xl p-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 border-l-8 border-l-blue-600">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-slate-800 pb-8">
                  <div>
                    <h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">Technical AI Report</h3>
                    <div className="flex items-center gap-4">
                       <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${analysis.sentiment === 'Bullish' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                          {analysis.sentiment.toUpperCase()}
                       </span>
                       <span className="text-slate-700">|</span>
                       <span className="text-slate-400 text-xs font-bold tracking-tight">Supp: ${analysis.supportLevel.toLocaleString()}</span>
                       <span className="text-slate-400 text-xs font-bold tracking-tight">Res: ${analysis.resistanceLevel.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className={`px-10 py-4 rounded-2xl text-xl font-black uppercase tracking-[0.2em] shadow-2xl ${
                    analysis.recommendation.includes('BUY') ? 'bg-green-600 text-white shadow-green-600/30' :
                    analysis.recommendation.includes('WAIT') ? 'bg-yellow-500 text-black shadow-yellow-500/30' :
                    'bg-slate-800 text-slate-400 shadow-black/50'
                  }`}>
                    {analysis.recommendation}
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                  <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] group hover:border-green-500/50 transition-all duration-500">
                    <p className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-[0.3em]">Entry Point</p>
                    <p className="text-4xl font-black text-white tracking-tighter group-hover:text-green-400 transition-colors">${analysis.entryPoint.toLocaleString()}</p>
                  </div>
                  <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] group hover:border-blue-500/50 transition-all duration-500">
                    <p className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-[0.3em]">Take Profit</p>
                    <p className="text-4xl font-black text-white tracking-tighter group-hover:text-blue-400 transition-colors">${analysis.takeProfit.toLocaleString()}</p>
                  </div>
                  <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] group hover:border-red-500/50 transition-all duration-500">
                    <p className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-[0.3em]">Stop Loss</p>
                    <p className="text-4xl font-black text-white tracking-tighter group-hover:text-red-400 transition-colors">${analysis.stopLoss.toLocaleString()}</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                  <div className="space-y-6">
                    <h4 className="text-[10px] uppercase font-black text-slate-500 tracking-[0.4em] flex items-center gap-3">
                       <span className="w-12 h-px bg-slate-800"></span> AI REASONING
                    </h4>
                    <div className="bg-slate-900/20 p-8 rounded-[3rem] border border-slate-800 leading-relaxed text-slate-400 text-sm font-medium italic shadow-inner">
                      "{analysis.reasoning}"
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    <button 
                      onClick={() => handlePushToTelegram()}
                      disabled={notificationStatus !== 'idle'}
                      className={`w-full py-6 rounded-[2rem] font-black text-sm tracking-[0.3em] transition-all shadow-2xl flex items-center justify-center gap-4 border-2 ${
                        notificationStatus === 'idle' 
                        ? 'bg-white text-black border-white hover:bg-slate-200 hover:-translate-y-1' 
                        : 'bg-slate-800 text-slate-500 border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      {notificationStatus === 'idle' ? (
                        <>
                          SEND TELEGRAM NOW
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                        </>
                      ) : (
                        'QUEUING MESSAGE...'
                      )}
                    </button>
                    <div className="flex items-center justify-center gap-3">
                       <span className="w-8 h-px bg-slate-900"></span>
                       <span className="text-[10px] text-slate-700 font-black uppercase tracking-widest">
                          Supabase Audit Log Active
                       </span>
                       <span className="w-8 h-px bg-slate-900"></span>
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
