
import { GoogleGenAI, Type } from "@google/genai";
import { CandleData, AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: "AIzaSyADWfQXkQeleCdFu56oeHC3YD-xnWb2lMk" });

export const analyzeMarketForDCA = async (
  coinName: string, 
  candles: CandleData[]
): Promise<AnalysisResult> => {
  const dataString = candles
    .filter((_, index) => index % 2 === 0) 
    .map(c => `[${c.time}] C:${c.close.toFixed(2)}`)
    .join(' | ');
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Bạn là một chuyên gia phân tích kỹ thuật tiền điện tử lão luyện. Hãy phân tích 100 nến 1 giờ của ${coinName}.
    
    Dữ liệu giá (mỗi 2 giờ): ${dataString}
    Giá hiện tại: ${candles[candles.length - 1].close.toFixed(2)}

    Nhiệm vụ:
    1. Xác định xu hướng chính.
    2. Đưa ra chiến lược DCA cụ thể bao gồm:
       - Điểm mua tối ưu (Entry Point).
       - Điểm chốt lời mục tiêu (Take Profit).
       - Điểm cắt lỗ (Stop Loss) để quản trị rủi ro.
    3. Khuyến nghị hành động: BUY (DCA), HOLD, hoặc WAIT.
    
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
          entryPoint: { type: Type.NUMBER, description: "Giá mua đề xuất" },
          takeProfit: { type: Type.NUMBER, description: "Giá chốt lời đề xuất" },
          stopLoss: { type: Type.NUMBER, description: "Giá cắt lỗ đề xuất" }
        },
        required: ['sentiment', 'recommendation', 'reasoning', 'supportLevel', 'resistanceLevel', 'entryPoint', 'takeProfit', 'stopLoss']
      }
    }
  });

  try {
    return JSON.parse(response.text.trim()) as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw new Error("Analysis failed");
  }
};
