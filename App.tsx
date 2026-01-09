
import React, { useState, useEffect, useRef } from 'react';
import { CoinInfo, CandleData, TelegramConfig, AnalysisResult } from './types.ts';
import { getTopCoins, get1hCandles } from './services/cryptoService.ts';
import { analyzeMarketForDCA } from './services/geminiService.ts';
import { sendTelegramAlert } from './services/telegramService.ts';
import { saveSignalToSupabase, getRecentSignals, updateAutoMonitorStatus, getAutoMonitorStatus } from './services/supabaseService.ts';
import CandleChart from './components/CandleChart.tsx';

const SCAN_INTERVAL_MS = 60 * 60 * 1000; 

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
  const [showDbHelp, setShowDbHelp] = useState(false);
  
  const [isAutoMonitoring, setIsAutoMonitoring] = useState<boolean>(false);
  const [tgConfig, setTgConfig] = useState<TelegramConfig>(() => {
    const saved = localStorage.getItem('tg_config');
    return saved ? JSON.parse(saved) : DEFAULT_TG_CONFIG;
  });

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    setLoading(true);
    try {
      // 1. Lấy trạng thái từ Database
      const remoteConfig = await getAutoMonitorStatus();
      if (remoteConfig) {
        setIsAutoMonitoring(remoteConfig.is_auto_active);
      }

      // 2. Lấy danh sách coin
      const topCoins = await getTopCoins();
      setCoins(topCoins);
      
      // 3. Khôi phục coin đang chọn
      const targetCoinId = remoteConfig?.last_selected_coin || localStorage.getItem('last_selected_coin_id');
      const foundCoin = topCoins.find(c => c.id === targetCoinId);
      
      if (foundCoin) handleCoinSelect(foundCoin);
      else if (topCoins.length > 0) handleCoinSelect(topCoins[0]);

      fetchHistory();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    try {
      const data = await getRecentSignals();
      setHistory(data);
    } catch (e) { console.error(e); }
  };

  const handleCoinSelect = async (coin: CoinInfo) => {
    setSelectedCoin(coin);
    localStorage.setItem('last_selected_coin_id', coin.id);
    setAnalysis(null);
    setCandles([]);
    try {
      const data = await get1hCandles(coin.id);
      setCandles(data);
    } catch (e) { console.error(e); }
  };

  const toggleAutoMonitor = async () => {
    if (!selectedCoin) return;
    const newStatus = !isAutoMonitoring;
    setIsAutoMonitoring(newStatus);
    setDbStatus('saving');
    const success = await updateAutoMonitorStatus(newStatus, selectedCoin.id);
    setDbStatus(success ? 'success' : 'error');
    setTimeout(() => setDbStatus('idle'), 2000);
  };

  const handleAnalyze = async () => {
    if (!selectedCoin) return;
    setAnalyzing(true);
    try {
      const freshCandles = await get1hCandles(selectedCoin.id);
      setCandles(freshCandles);
      const result = await analyzeMarketForDCA(selectedCoin.name, freshCandles);
      setAnalysis(result);
      setDbStatus('saving');
      await saveSignalToSupabase(selectedCoin, result);
      setDbStatus('success');
      fetchHistory();
      setTimeout(() => setDbStatus('idle'), 2000);
    } catch (error) {
      setDbStatus('error');
    } finally {
      setAnalyzing(false);
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

  const sqlSetup = `
-- 1. Bảng lưu tín hiệu
create table if not column exists signals (
  id bigint primary key generated always as identity,
  coin_name text not null,
  symbol text not null,
  current_price numeric,
  recommendation text,
  sentiment text,
  entry_point numeric,
  take_profit numeric,
  stop_loss numeric,
  reasoning text,
  support_level numeric,
  resistance_level numeric,
  created_at timestamptz default now()
);

-- 2. Bảng lưu cấu hình global cho Cron Job
create table if not column exists configs (
  id text primary key,
  is_auto_active boolean default false,
  last_selected_coin text,
  updated_at timestamptz default now()
);

-- Chèn dữ liệu mẫu nếu chưa có
insert into configs (id, is_auto_active) values ('global', false) on conflict (id) do nothing;

-- 3. Policy (RLS) cho phép public
alter table signals enable row level security;
create policy "Public Access" on signals for all using (true) with check (true);
alter table configs enable row level security;
create policy "Public Access Config" on configs for all using (true) with check (true);
`;

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white gap-4 text-center p-4">
      <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <div className="font-black text-xl tracking-widest animate-pulse">SYNCING WITH SUPABASE...</div>
      <p className="text-slate-500 text-[10px] uppercase tracking-widest">Đang tải cấu hình 24/7 từ database</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col h-screen overflow-hidden">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/20">D</div>
          <h1 className="text-xl font-bold tracking-tight uppercase">DCA Bot 24/7</h1>
        </div>

        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2 flex justify-between">
          <span>Binance Live</span>
          {dbStatus !== 'idle' && (
            <span className={`text-[10px] ${dbStatus === 'saving' ? 'text-yellow-500' : dbStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}>
              {dbStatus === 'saving' ? 'Updating DB...' : dbStatus === 'success' ? 'Synced' : 'Error'}
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
                  {coin.price_change_percentage_24h.toFixed(2)}%
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-800">
           <div className="flex justify-between items-center px-2 mb-3">
             <h3 className="text-[10px] font-bold text-slate-500 uppercase">Lịch sử tín hiệu</h3>
             <button onClick={() => setShowDbHelp(!showDbHelp)} className="text-[10px] text-blue-500 hover:underline">DB SQL</button>
           </div>
           
           <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {history.map((sig, idx) => (
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
              ))}
           </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-800">
           {isAutoMonitoring && (
             <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Cloud Worker Active</span>
                </div>
                <p className="text-[8px] text-slate-500 text-center mt-1 uppercase">Hệ thống đang chạy ngầm trên Vercel</p>
             </div>
           )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-slate-950 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {showDbHelp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-2xl w-full shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold">SQL Setup (Cho 24/7)</h3>
                  <button onClick={() => setShowDbHelp(false)} className="text-slate-500 hover:text-white">✕</button>
                </div>
                <p className="text-xs text-slate-400 mb-4 uppercase font-bold tracking-widest">Chạy lệnh này trong Supabase SQL Editor:</p>
                <div className="relative">
                  <pre className="bg-black/50 p-4 rounded-xl text-[10px] font-mono overflow-x-auto text-green-500 border border-slate-800 max-h-60 overflow-y-auto">
                    {sqlSetup}
                  </pre>
                  <button 
                    onClick={() => navigator.clipboard.writeText(sqlSetup).then(() => alert('Copied!'))}
                    className="absolute top-2 right-2 bg-slate-800 px-3 py-1 rounded text-[10px] font-bold"
                  >
                    COPY
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  <p className="text-slate-400 text-xs font-medium">Auto-Scanning: <span className={isAutoMonitoring ? 'text-green-500' : 'text-red-500'}>{isAutoMonitoring ? 'ENABLED (24/7)' : 'DISABLED'}</span></p>
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button 
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex-1 md:flex-none px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 border border-slate-700"
                >
                  {analyzing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "Check Ngay"}
                </button>
                <button 
                  onClick={toggleAutoMonitor}
                  className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-black tracking-wider transition-all flex items-center justify-center gap-2 border-2 ${
                    isAutoMonitoring 
                    ? 'bg-green-600/10 text-green-500 border-green-600/30' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600 shadow-xl shadow-blue-600/30'
                  }`}
                >
                  {isAutoMonitoring ? 'ĐANG CHẠY 24/7' : 'BẬT CHẠY 24/7'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 crypto-card rounded-2xl p-6 min-h-[400px] flex flex-col">
               <h3 className="font-bold text-slate-300 mb-6 flex items-center gap-2 italic uppercase text-xs tracking-widest">
                 <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                 Biểu đồ 1H (Binance Data)
               </h3>
               <div className="flex-1 w-full bg-slate-900/10 rounded-xl overflow-hidden min-h-[300px]">
                 {candles.length > 0 ? <CandleChart data={candles} /> : <div className="h-full flex items-center justify-center text-slate-600">Loading Chart...</div>}
               </div>
            </div>

            <div className="crypto-card rounded-2xl p-6 border-t-2 border-t-blue-600">
               <h3 className="font-bold text-slate-300 mb-6 uppercase text-xs tracking-widest">Telegram Config</h3>
               <form onSubmit={(e) => { e.preventDefault(); localStorage.setItem('tg_config', JSON.stringify(tgConfig)); alert('Cấu hình đã lưu cục bộ!'); }} className="space-y-4">
                 <div className="space-y-1">
                   <p className="text-[10px] text-slate-500 font-bold">BOT TOKEN</p>
                   <input 
                     type="password"
                     value={tgConfig.botToken}
                     onChange={(e) => setTgConfig({...tgConfig, botToken: e.target.value})}
                     className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500"
                   />
                 </div>
                 <div className="space-y-1">
                   <p className="text-[10px] text-slate-500 font-bold">CHAT ID</p>
                   <input 
                     type="text"
                     value={tgConfig.chatId}
                     onChange={(e) => setTgConfig({...tgConfig, chatId: e.target.value})}
                     className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500"
                   />
                 </div>
                 <button type="submit" className="w-full py-3 bg-blue-600/10 text-blue-400 rounded-xl text-xs font-black border border-blue-600/20">LƯU CẤU HÌNH</button>
               </form>
               <div className="mt-6 p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-[9px] text-slate-500 leading-relaxed uppercase font-bold text-center">
                 Hệ thống sẽ tự động quét mỗi 60 phút và đẩy tín hiệu về Telegram nếu bạn BẬT CHẠY 24/7.
               </div>
            </div>
          </div>

          {analysis && (
            <div className="crypto-card rounded-3xl p-8 animate-in fade-in slide-in-from-bottom-8 duration-700 border-l-8 border-l-blue-600">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-slate-800 pb-8">
                  <div>
                    <h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">AI Signal Audit</h3>
                    <div className="flex flex-wrap items-center gap-4">
                       <span className={`px-4 py-1.5 rounded-full text-[11px] font-black tracking-widest ${analysis.sentiment === 'Bullish' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {analysis.sentiment.toUpperCase()}
                       </span>
                       <span className="px-4 py-1.5 rounded-full text-[11px] font-black tracking-widest bg-blue-600 text-white uppercase">
                          Pattern: {analysis.detectedPattern}
                       </span>
                    </div>
                  </div>
                  <div className={`px-10 py-4 rounded-2xl text-xl font-black uppercase ${analysis.recommendation === 'BUY (DCA)' ? 'bg-green-600 shadow-green-600/30' : 'bg-slate-700'} text-white shadow-xl`}>
                    {analysis.recommendation}
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12 text-center">
                  <div className="p-8 bg-slate-900/60 rounded-[2.5rem] border border-slate-800">
                    <p className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-[0.3em]">Entry Point</p>
                    <p className="text-4xl font-black text-white tracking-tighter">${analysis.entryPoint.toLocaleString()}</p>
                  </div>
                  <div className="p-8 bg-slate-900/60 rounded-[2.5rem] border border-slate-800">
                    <p className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-[0.3em]">Take Profit</p>
                    <p className="text-4xl font-black text-white tracking-tighter text-blue-400">${analysis.takeProfit.toLocaleString()}</p>
                  </div>
                  <div className="p-8 bg-slate-900/60 rounded-[2.5rem] border border-slate-800">
                    <p className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-[0.3em]">Stop Loss</p>
                    <p className="text-4xl font-black text-white tracking-tighter text-red-400">${analysis.stopLoss.toLocaleString()}</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                  <div className="space-y-6">
                    <h4 className="text-[10px] uppercase font-black text-slate-500 tracking-[0.4em] flex items-center gap-3">
                       <span className="w-12 h-px bg-slate-800"></span> REASONING
                    </h4>
                    <div className="bg-slate-900/20 p-8 rounded-[3rem] border border-slate-800 text-slate-400 text-sm italic font-medium">
                      "{analysis.reasoning}"
                    </div>
                  </div>

                  <button 
                    onClick={() => handlePushToTelegram()}
                    disabled={notificationStatus !== 'idle'}
                    className="w-full py-6 rounded-[2rem] font-black text-sm tracking-[0.3em] bg-white text-black hover:bg-slate-200 transition-all flex items-center justify-center gap-4 shadow-2xl disabled:opacity-50"
                  >
                    {notificationStatus === 'idle' ? 'ĐẨY TÍN HIỆU NGAY' : 'ĐANG GỬI...'}
                  </button>
               </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
