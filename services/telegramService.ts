
import { TelegramConfig, AnalysisResult } from "../types.ts";

export const sendTelegramAlert = async (
  config: TelegramConfig,
  coinName: string,
  analysis: AnalysisResult,
  price: number
): Promise<boolean> => {
  if (!config.botToken || !config.chatId) return false;

  const sentimentIcon = analysis.sentiment === 'Bullish' ? '🟢' : analysis.sentiment === 'Bearish' ? '🔴' : '⚪';
  
  const message = `
🎯 *TÍN HIỆU SPOT: ${coinName.toUpperCase()}*
💰 Giá: $${price.toLocaleString()}
📊 Tâm lý: ${sentimentIcon} ${analysis.sentiment}
🧩 Mô hình: *${analysis.detectedPattern}*

🔥 *KHUYẾN NGHỊ: ${analysis.recommendation}*

📍 *Chiến lược:*
🟢 Vào lệnh: *$${analysis.entryPoint.toLocaleString()}*
🎁 Mục tiêu (TP): *$${analysis.takeProfit.toLocaleString()}*
🛡️ Bảo vệ (SL): *$${analysis.stopLoss.toLocaleString()}*

💡 *Phân tích kỹ thuật:*
_${analysis.reasoning}_

📉 Hỗ trợ: $${analysis.supportLevel.toLocaleString()}
📈 Kháng cự: $${analysis.resistanceLevel.toLocaleString()}

_Bot AI quét 100 nến 1H - Binance Data_
  `;

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    return response.ok;
  } catch (error) {
    console.error("Telegram error:", error);
    return false;
  }
};
