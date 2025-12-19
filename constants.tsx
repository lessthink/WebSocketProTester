
import React from 'react';
import { 
  Send, 
  Trash2, 
  Play, 
  Square, 
  Clock, 
  Settings, 
  History as HistoryIcon, 
  Plus, 
  Copy, 
  Filter, 
  FileJson, 
  Variable,
  Layers,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';

export const ICONS = {
  Send: <Send size={16} />,
  Trash: <Trash2 size={16} />,
  Play: <Play size={16} />,
  Stop: <Square size={16} />,
  Clock: <Clock size={16} />,
  Settings: <Settings size={16} />,
  History: <HistoryIcon size={16} />,
  Plus: <Plus size={16} />,
  Copy: <Copy size={16} />,
  Filter: <Filter size={16} />,
  JSON: <FileJson size={16} />,
  Variable: <Variable size={16} />,
  Templates: <Layers size={16} />,
  Search: <Search size={16} />,
  Success: <CheckCircle2 size={16} className="text-emerald-500" />,
  Error: <XCircle size={16} className="text-rose-500" />,
  Warning: <AlertCircle size={16} className="text-amber-500" />
};

export const DEFAULT_TEMPLATES = [
  { id: '1', name: 'Ping', content: '{"type": "ping"}', type: 'json' },
  { id: '2', name: 'Hello', content: 'Hello WebSocket Server!', type: 'text' },
  { id: '3', name: 'Auth', content: '{"action": "auth", "token": "{{uuid}}"}', type: 'json' },
];

export const VARIABLE_HELP = [
  { key: '{{timestamp}}', desc: 'Current unix timestamp' },
  { key: '{{isoDate}}', desc: 'Current ISO date string' },
  { key: '{{uuid}}', desc: 'Random unique ID' },
  { key: '{{randomNum}}', desc: 'Random number (0-1000)' },
];
