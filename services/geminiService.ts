
import { GoogleGenAI, Type } from "@google/genai";
import { CandleData, AnalysisResult } from "../types.ts";

export const analyzeMarketForDCA = async (
  coinName: string, 
  candles: CandleData[]
): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: "AIzaSyCvmudIm4PgJ1DgMfA7wWbg0ZwpLZ3gOgk" });
  
  // Lấy dữ liệu 100 nến nhưng tập trung vào 20 nến cuối để soi mô hình
  const dataString = candles
    .slice(-40) 
    .map(c => `[${c.time}] O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`)
    .join(' | ');
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Bạn là một chuyên gia phân tích kỹ thuật theo trường phái Price Action (Hành động giá). 
    Dữ liệu 40 giờ gần nhất của ${coinName}: ${dataString}

    Nhiệm vụ:
    1. Soi kỹ các mô hình nến (Candlestick Patterns) như: Bullish Engulfing, Hammer, Morning Star, Double Bottom, Inverted Head and Shoulders, hoặc RSI Divergence (nếu suy luận được).
    2. Chỉ được đưa ra khuyến nghị "BUY (DCA)" khi và chỉ khi có mô hình nến/kỹ thuật đảo chiều tăng giá RÕ RÀNG.
    3. Nếu không có mô hình nào khớp hoặc xu hướng đang giảm mạnh không có dấu hiệu dừng, hãy khuyến nghị "WAIT" hoặc "HOLD". Tuyệt đối không được "phím kèo" bừa bãi.
    4. Đối với Spot: Tập trung vào các vùng hỗ trợ mạnh.

    Yêu cầu JSON output chính xác theo cấu hình.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentiment: { type: Type.STRING, enum: ['Bullish', 'Bearish', 'Neutral'] },
          recommendation: { type: Type.STRING, enum: ['BUY (DCA)', 'HOLD', 'WAIT'] },
          detectedPattern: { type: Type.STRING, description: "Tên mô hình nến phát hiện được (ví dụ: Bullish Engulfing)" },
          reasoning: { type: Type.STRING, description: "Giải thích tại sao khớp mô hình này" },
          supportLevel: { type: Type.NUMBER },
          resistanceLevel: { type: Type.NUMBER },
          entryPoint: { type: Type.NUMBER },
          takeProfit: { type: Type.NUMBER },
          stopLoss: { type: Type.NUMBER }
        },
        required: ['sentiment', 'recommendation', 'detectedPattern', 'reasoning', 'supportLevel', 'resistanceLevel', 'entryPoint', 'takeProfit', 'stopLoss']
      }
    }
  });

  try {
    const text = response.text || "";
    return JSON.parse(text.trim()) as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("Analysis failed to parse");
  }
};
