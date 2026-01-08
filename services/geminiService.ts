
import { GoogleGenAI, Type } from "@google/genai";
import { CandleData, AnalysisResult } from "../types.ts";

export const analyzeMarketForDCA = async (
  coinName: string, 
  candles: CandleData[]
): Promise<AnalysisResult> => {
  // BẮT BUỘC sử dụng process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: "AIzaSyADWfQXkQeleCdFu56oeHC3YD-xnWb2lMk" });
  
  // Rút gọn dữ liệu nến để không vượt quá giới hạn context của AI
  const dataString = candles
    .slice(-50) // Lấy 50 nến gần nhất để phân tích sâu
    .filter((_, index) => index % 2 === 0) 
    .map(c => `[${c.time}] O:${c.open.toFixed(2)} C:${c.close.toFixed(2)}`)
    .join(' | ');
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Bạn là một chuyên gia phân tích kỹ thuật tiền điện tử. Hãy phân tích dữ liệu 100 giờ gần đây của ${coinName}.
    
    Dữ liệu giá: ${dataString}
    Giá hiện tại: ${candles[candles.length - 1].close.toFixed(2)}

    Nhiệm vụ:
    1. Xác định xu hướng (Sentiment).
    2. Đưa ra chiến lược DCA: Điểm mua (Entry), Chốt lời (TP), Cắt lỗ (SL).
    3. Khuyến nghị: BUY (DCA), HOLD, hoặc WAIT.
    
    Phản hồi bằng JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentiment: { type: Type.STRING, enum: ['Bullish', 'Bearish', 'Neutral'] },
          recommendation: { type: Type.STRING, enum: ['BUY (DCA)', 'HOLD', 'WAIT'] },
          reasoning: { type: Type.STRING },
          supportLevel: { type: Type.NUMBER },
          resistanceLevel: { type: Type.NUMBER },
          entryPoint: { type: Type.NUMBER },
          takeProfit: { type: Type.NUMBER },
          stopLoss: { type: Type.NUMBER }
        },
        required: ['sentiment', 'recommendation', 'reasoning', 'supportLevel', 'resistanceLevel', 'entryPoint', 'takeProfit', 'stopLoss']
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
