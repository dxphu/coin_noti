
import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';
import { CandleData } from '../types';

interface Props {
  data: CandleData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload as CandleData;
    return (
      <div className="bg-slate-800 border border-slate-700 p-2 rounded shadow-xl text-[10px]">
        <p className="text-slate-400 mb-1 font-bold">{d.time}</p>
        <div className="grid grid-cols-2 gap-x-2">
          <p><span className="text-slate-500">O:</span> {d.open.toFixed(2)}</p>
          <p><span className="text-slate-500">C:</span> {d.close.toFixed(2)}</p>
          <p><span className="text-slate-500">H:</span> {d.high.toFixed(2)}</p>
          <p><span className="text-slate-500">L:</span> {d.low.toFixed(2)}</p>
        </div>
      </div>
    );
  }
  return null;
};

const CandleChart: React.FC<Props> = ({ data }) => {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <XAxis 
            dataKey="time" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#475569', fontSize: 8 }}
            interval={12} // Chỉ hiển thị nhãn mỗi 12 nến (nửa ngày) để tránh chật chội
          />
          <YAxis 
            domain={['auto', 'auto']} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#475569', fontSize: 9 }}
            orientation="right"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff10' }} />
          <Bar dataKey="close">
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.close > entry.open ? '#22c55e' : '#ef4444'} 
                fillOpacity={0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CandleChart;
