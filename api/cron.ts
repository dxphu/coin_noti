
import { GoogleGenAI } from "@google/genai";

// Cấu hình cứng để serverless function có thể chạy độc lập
const SUPABASE_URL = "https://cgsgcwvpfgjbhatjhxkg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnc2djd3ZwZmdqYmhhdGpoeGtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NjExNzAsImV4cCI6MjA4MzQzNzE3MH0.OxGeevVJlkBjmGFbcZ5rowsO0ZNgX_plKrKkWJBaZxA";
const GEMINI_KEY = "AIzaSyCvmudIm4PgJ1DgMfA7wWbg0ZwpLZ3gOgk";
const TG_TOKEN = "8459324070:AAE8x2nNGt2c2RVgUCP-F1KcY0SInFOZeqA";
const TG_CHAT_ID = "6305931650";

export default async function handler(req: any, res: any) {
  try {
    // 1. Kiểm tra cấu hình từ Database
    const configRes = await fetch(`${SUPABASE_URL}/rest/v1/configs?id=eq.global&select=*`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const configData = await configRes.json();
    const config = configData[0];

    if (!config || !config.is_auto_active || !config.last_selected_coin) {
      return res.status(200).json({ status: "skipped", reason: "Auto-monitor is disabled or no coin selected" });
    }

    const symbol = config.last_selected_coin;

    // 2. Lấy nến từ Binance
    const binanceRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=40`);
    const klines = await binanceRes.json();
    const candles = klines.map((d: any) => ({
      time: new Date(d[0]).toISOString(),
      open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
    }));

    // 3. Phân tích với Gemini
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    const dataString = candles.map((c: any) => `[${c.time}] C:${c.close}`).join(' | ');
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Phân tích Price Action cho ${symbol}: ${dataString}. Trả về JSON: {sentiment: 'Bullish'|'Bearish'|'Neutral', recommendation: 'BUY (DCA)'|'HOLD'|'WAIT', detectedPattern: string, reasoning: string, supportLevel: number, resistanceLevel: number, entryPoint: number, takeProfit: number, stopLoss: number}`,
      config: { responseMimeType: "application/json" }
    });
    
    const analysis = JSON.parse(aiResponse.text || "{}");

    // 4. Lưu tín hiệu vào Database
    await fetch(`${SUPABASE_URL}/rest/v1/signals`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coin_name: symbol, symbol, current_price: candles[candles.length - 1].close,
        recommendation: analysis.recommendation, sentiment: analysis.sentiment,
        entry_point: analysis.entryPoint, take_profit: analysis.takeProfit, stop_loss: analysis.stopLoss,
        reasoning: analysis.reasoning, support_level: analysis.supportLevel, resistance_level: analysis.resistanceLevel
      })
    });

    // 5. Nếu là BUY (DCA), gửi Telegram
    if (analysis.recommendation === 'BUY (DCA)') {
      const message = `🚀 *BOT 24/7 ALERT: ${symbol}*\n💰 Giá: $${candles[candles.length - 1].close}\n📊 Tâm lý: ${analysis.sentiment}\n🧩 Mô hình: ${analysis.detectedPattern}\n🔥 *KHUYẾN NGHỊ: BUY (DCA)*\n📍 Entry: $${analysis.entryPoint}\n🎁 TP: $${analysis.takeProfit}\n🛡️ SL: $${analysis.stopLoss}\n\n_Hệ thống quét ngầm Vercel Cron_`;
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT_ID, text: message, parse_mode: 'Markdown' })
      });
    }

    return res.status(200).json({ status: "success", symbol, recommendation: analysis.recommendation });
  } catch (error: any) {
    return res.status(500).json({ status: "error", message: error.message });
  }
}
