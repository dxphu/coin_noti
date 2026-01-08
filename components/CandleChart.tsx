import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  CartesianGrid
} from 'recharts';
import { CandleData } from '../types.ts';

interface Props {
  data: CandleData[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload as CandleData;
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-2xl text-[11px] backdrop-blur-md">
        <p className="text-blue-400 mb-2 font-bold border-b border-slate-800 pb-1">{d.time}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <p><span className="text-slate-500 font-medium">Mở:</span> <span className="text-slate-200">${d.open.toLocaleString()}</span></p>
          <p><span className="text-slate-500 font-medium">Đóng:</span> <span className="text-slate-200">${d.close.toLocaleString()}</span></p>
          <p><span className="text-slate-500 font-medium">Cao:</span> <span className="text-green-500">${d.high.toLocaleString()}</span></p>
          <p><span className="text-slate-500 font-medium">Thấp:</span> <span className="text-red-500">${d.low.toLocaleString()}</span></p>
        </div>
      </div>
    );
  }
  return null;
};

const CandleChart: React.FC<Props> = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="w-full h-full min-h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="time" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748b', fontSize: 10 }}
            interval={Math.floor(data.length / 5)}
          />
          <YAxis 
            domain={['auto', 'auto']} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#64748b', fontSize: 10 }}
            orientation="right"
            tickFormatter={(value) => value > 1000 ? `${(value/1000).toFixed(1)}k` : value}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
          <Bar dataKey="close">
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.close > entry.open ? '#22c55e' : '#ef4444'} 
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CandleChart;