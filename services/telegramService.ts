
import { TelegramConfig, AnalysisResult } from "../types.ts";

export const sendTelegramAlert = async (
  config: TelegramConfig,
  coinName: string,
  analysis: AnalysisResult,
  price: number
): Promise<boolean> => {
  if (!config.botToken || !config.chatId) return false;

  const message = `
🚀 *Crypto DCA Alert: ${coinName}*
💰 Giá hiện tại: $${price.toLocaleString()}
📊 Tâm lý: ${analysis.sentiment === 'Bullish' ? '🟢 Bullish' : analysis.sentiment === 'Bearish' ? '🔴 Bearish' : '⚪ Neutral'}
🎯 Khuyến nghị: *${analysis.recommendation}*

📍 *Chiến lược giao dịch:*
🟢 Entry: *$${analysis.entryPoint.toLocaleString()}*
🎁 Take Profit: *$${analysis.takeProfit.toLocaleString()}*
🛡️ Stop Loss: *$${analysis.stopLoss.toLocaleString()}*

💡 *Nhận định:*
${analysis.reasoning}

📉 Hỗ trợ: $${analysis.supportLevel.toLocaleString()}
📈 Kháng cự: $${analysis.resistanceLevel.toLocaleString()}

_Hệ thống quét 100 nến 1h - AI Assistant_
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
